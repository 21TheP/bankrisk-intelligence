/* ============================================================
   BANKRISK Intelligence — App shell
   Router hash (#/view?params), trạng thái toàn cục, luồng upload,
   bộ chọn năm toàn cục (FR-DASH-00c), huy hiệu riêng tư (P-05),
   modal tuyên bố miễn trừ (SEC-13), xuất báo cáo PDF/Word (FG-6).
   ============================================================ */
(function () {
  'use strict';
  const BR = window.BRCORE, UI = window.BRUI, PIPE = window.BRPIPE;

  const APP_VERSION = '1.0.0';
  const MODEL_VERSION = window.BRMODEL.artifact.model_version;
  const DISCLAIMER = 'BANKRISK Intelligence là sản phẩm học thuật phục vụ nghiên cứu và hỗ trợ ra quyết định. Hệ thống không đưa ra quyết định giám sát, quyết định cấp tín dụng, khuyến nghị đầu tư hay kết luận pháp lý. Nhãn RISK sử dụng trong hệ thống là quy tắc gán nhãn dữ liệu phục vụ nghiên cứu, không phải chuẩn mực pháp lý đầy đủ. Kết quả mô hình phụ thuộc vào chất lượng dữ liệu do người dùng tải lên.';

  const APP = window.BRAPP = window.APP = {
    version: APP_VERSION,
    state: {
      source: null, fileName: null,
      rows: [], columns: [],
      validation: null, indicators: [], meta: {},
      dq: null, unit: 'million_vnd', carMode: 'computed', winsorized: false,
      year: null, bank: null,
      weights: Object.assign({}, BR.FHS_WEIGHTS_DEFAULT),
      ensembleWeights: { logit: 0.5, xgb: 0.5 },
      modelRun: null,
      datasetHash: null,
      stress: { params: {}, assumptions: {}, scenarios: [] }
    },
    views: {},
    registerView(id, def) { this.views[id] = def; },

    /* ---------- Web Worker (P-06) với fallback main thread ---------- */
    _worker: null, _workerSeq: 0, _workerPending: new Map(),
    _getWorker() {
      if (this._worker !== null) return this._worker;
      try {
        const w = new Worker('js/worker.js');
        w.onmessage = e => {
          const { id, ok, result, error } = e.data;
          const p = this._workerPending.get(id);
          if (p) { this._workerPending.delete(id); ok ? p.resolve(result) : p.reject(new Error(error)); }
        };
        w.onerror = () => { this._worker = false; };
        this._worker = w;
        return w;
      } catch (e) { this._worker = false; return null; }
    },
    _callWorker(op, payload) {
      return new Promise((resolve, reject) => {
        const w = this._getWorker();
        if (!w) { // fallback: tính trên main thread (file:// hoặc Worker bị chặn)
          try { resolve(PIPE[op](payload)); } catch (e) { reject(e); }
          return;
        }
        const id = ++this._workerSeq;
        this._workerPending.set(id, { resolve, reject });
        w.postMessage({ id, op, payload });
      });
    },

    /* ---------- Tuỳ chọn URL (FR-DASH-00c) ---------- */
    setHash(params, keepView) {
      const cur = this.parseHash();
      const view = keepView !== undefined ? keepView : cur.view;
      const merged = Object.assign({}, cur.params, params);
      for (const k of Object.keys(merged)) if (merged[k] === null || merged[k] === undefined) delete merged[k];
      window.location.hash = '#/' + view + (Object.keys(merged).length ? '?' + new URLSearchParams(merged) : '');
    },
    parseHash() {
      const h = window.location.hash.replace(/^#\/?/, '');
      const [view, qs] = h.split('?');
      return { view: view || 'overview', params: Object.fromEntries(new URLSearchParams(qs || '')) };
    },

    /* ---------- Dữ liệu ---------- */
    years() { return [...new Set(this.state.indicators.map(i => i.year))].filter(y => y !== null).sort((a, b) => a - b); },
    banks() {
      const m = new Map();
      this.state.rows.forEach(r => { if (!m.has(r.bank_code)) m.set(r.bank_code, { bank_code: r.bank_code, bank_name: r.bank_name, ownership_group: r.ownership_group, listing: null }); });
      return [...m.values()];
    },
    ind(bank, year) { return this.state.indicators.find(i => i.bank_code === bank && i.year === year) || null; },
    latestYearOf(bank) {
      let best = null;
      this.state.indicators.forEach(i => { if (i.bank_code === bank && (best === null || i.year > best)) best = i.year; });
      return best;
    },

    async runAnalysis(rawRows, columns, duplicatePolicy) {
      const res = await this._callWorker('analyze', {
        rows: rawRows, columns,
        duplicatePolicy: duplicatePolicy || 'keep-all',
        opts: { carMode: this.state.carMode, unit: this.state.unit }
      });
      const st = this.state;
      st.source = st._pendingSource;
      st.fileName = st._pendingFileName || null;
      st.rows = res.rows; st.columns = columns;
      st.validation = res.validation;
      st.indicators = res.indicators;
      st.meta = res.meta;
      st.meta.unit = res.unit;
      st.dq = res.validation.dq;
      st.modelRun = null; // dữ liệu mới → phải chấm điểm lại
      // Hash bộ dữ liệu (M-05)
      st.datasetHash = await BR.hashText(JSON.stringify(res.rows.map(r => {
        const o = {}; BR.REQUIRED_COLS.forEach(c => o[c] = r[c]); return o;
      })));
      this.computeGroups();
      if (!st.year || !this.years().includes(st.year)) st.year = Math.max(...this.years());
    },

    computeGroups() {
      const probs = this.state.modelRun ? this.state.modelRun.probs : null;
      PIPE.computeGroups(this.state.indicators, probs);
    },

    /* ---------- Chạy chấm điểm mô hình ---------- */
    async runModel() {
      const st = this.state;
      if (!st.indicators.length) return;
      // SEC-13: modal tuyên bố miễn trừ trước lần chạy đầu
      if (!localStorage.getItem('br_model_ack')) {
        const ack = await new Promise(resolve => {
          const m = UI.modal({
            title: 'Xác nhận trước khi chấm điểm mô hình',
            body: UI.h('div', {},
              UI.h('p', { style: { fontWeight: 600 } }, 'Tuyên bố miễn trừ trách nhiệm bắt buộc'),
              UI.h('p', {}, DISCLAIMER),
              UI.h('p', { class: 'muted' }, 'Mô hình suy luận chạy hoàn toàn trong trình duyệt của bạn; không có dữ liệu nào được gửi đi. Kết quả chỉ mang tính hỗ trợ ra quyết định học thuật.')),
            footer: [
              UI.h('button', { class: 'btn', onclick: () => { m.close(); resolve(false); } }, 'Huỷ'),
              UI.h('button', { class: 'btn primary', onclick: () => { localStorage.setItem('br_model_ack', '1'); m.close(); resolve(true); } }, 'Tôi đã hiểu — Chạy chấm điểm')
            ]
          });
        });
        if (!ack) return;
      }
      // FR-MODEL-03: kiểm chứng artefact bằng test_vectors
      const ver = BR.verifyArtifact(window.BRMODEL.artifact);
      if (!ver.ok) {
        UI.toast('Mô hình không vượt qua kiểm chứng (test_vectors), chặn suy luận. Vui lòng báo quản trị viên.', 'err');
        return;
      }
      const res = await this._callWorker('score', {
        indicators: st.indicators, artifact: window.BRMODEL.artifact, ensembleWeights: st.ensembleWeights
      });
      st.modelRun = {
        probs: res.probs, nScored: res.nScored, nSkipped: res.nSkipped,
        verified: ver, scoredAt: new Date().toISOString(),
        version: window.BRMODEL.artifact.model_version,
        featureImportance: window.BRMODEL.artifact.feature_importance_gain
      };
      this.computeGroups(); // điểm nghiêm trọng cập nhật thành phần "xác suất mô hình"
      UI.toast('Đã chấm điểm ' + res.nScored + ' quan sát bằng Logit + XGBoost + Ensemble (kiểm chứng test_vectors: PASS)', 'ok');
      this.render();
    },

    /* ---------- Router ---------- */
    render() {
      const { view, params } = this.parseHash();
      const st = this.state;
      if (params.year && this.years().includes(+params.year)) st.year = +params.year;
      if (params.bank) st.bank = params.bank;
      const root = document.getElementById('view-root');
      root.innerHTML = '';
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
      document.getElementById('page-title').textContent = this.views[view] ? this.views[view].title : 'BANKRISK';

      if (!st.source) {
        UI.clearCharts();
        root.append(this.welcomeScreen());
        this.refreshTopbar();
        return;
      }
      UI.clearCharts();
      const def = this.views[view] || this.views.overview;
      def.render(root, params);
      this.refreshTopbar();
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => {
          UI.resizeCharts();
          setTimeout(() => UI.resizeCharts(), 100);
        });
      }
    },

    refreshTopbar() {
      const st = this.state;
      const yearSel = document.getElementById('year-select');
      const years = this.years();
      yearSel.innerHTML = '';
      if (years.length) {
        years.forEach(y => yearSel.append(UI.h('option', { value: y }, 'Năm ' + y)));
        yearSel.value = String(st.year);
        yearSel.disabled = false;
      } else yearSel.disabled = true;
      document.getElementById('source-chip').innerHTML = '';
      if (st.source) {
        document.getElementById('source-chip').append(
          UI.h('span', { class: 'chip ' + (st.source === 'demo' ? 'demo' : 'neutral') },
            st.source === 'demo' ? 'Dữ liệu mẫu' : (st.fileName || 'Dữ liệu tải lên'))
        );
      } else {
        document.getElementById('source-chip').append(
          UI.h('button', { class: 'btn small', onclick: () => APP.loadDemo() }, 'Dùng dữ liệu mẫu')
        );
      }
    },

    /* ---------- Màn hình chào ---------- */
    welcomeScreen() {
      const wrap = UI.h('div', { class: 'welcome' });
      const fileInput = UI.h('input', {
        type: 'file', accept: '.xlsx,.csv', style: { display: 'none' },
        onchange: e => {
          if (e.target.files && e.target.files[0]) APP.handleFile(e.target.files[0]);
        }
      });
      wrap.append(fileInput);
      wrap.append(
        UI.h('div', { style: { fontSize: '44px' } }, '🏦'),
        UI.h('h1', {}, 'BANKRISK Intelligence'),
        UI.h('p', { class: 'lead' }, 'Nền tảng cảnh báo sớm rủi ro kiệt quệ ngân hàng thương mại Việt Nam. Tự động chuẩn hóa dữ liệu BCTC, tính toán chỉ tiêu an toàn vốn và định lượng nguy cơ rủi ro hệ thống.'),
        UI.h('div', { class: 'choices' },
          UI.h('div', { class: 'choice', onclick: () => APP.loadDemo(), role: 'button', tabindex: '0' },
            UI.h('div', { class: 'big' }, '🧪'),
            UI.h('h3', {}, 'Dùng bộ dữ liệu mẫu'),
            UI.h('p', { class: 'muted' }, 'Khám phá ngay hệ thống với bộ số liệu mẫu 23 ngân hàng thương mại Việt Nam (2014–2024).'),
            UI.h('button', { class: 'btn primary mt', onclick: e => { e.stopPropagation(); APP.loadDemo(); } }, 'Khám phá dữ liệu mẫu')),
          UI.h('div', { class: 'choice', onclick: () => fileInput.click(), role: 'button', tabindex: '0' },
            UI.h('div', { class: 'big' }, '📤'),
            UI.h('h3', {}, 'Tải lên dữ liệu của bạn'),
            UI.h('p', { class: 'muted' }, 'Mở hộp thoại chọn tệp BCTC (.xlsx, .csv). Hệ thống tự động nhận diện tên cột tiếng Việt/Anh và chuẩn hoá.'),
            UI.h('button', { class: 'btn primary mt', onclick: e => { e.stopPropagation(); fileInput.click(); } }, '📁 Chọn tệp từ máy tính (.xlsx, .csv)'))),
        UI.h('div', { class: 'steps' },
          ['1. Chọn tệp XLSX/CSV', '2. Tự động chuẩn hóa', '3. Tính chỉ tiêu an toàn', '4. Phân tích dashboard', '5. Dự báo & Giám sát', '6. Xuất báo cáo'].map(s => UI.h('span', {}, s)))
      );
      return wrap;
    },

    /* ---------- Nạp dữ liệu demo ---------- */
    async loadDemo() {
      this.state._pendingSource = 'demo';
      this.state._pendingFileName = 'demo_dataset_2014_2024.csv';
      await this.runAnalysis(window.BRDEMO.rows(), BR.REQUIRED_COLS.concat(BR.AUDIT_COLS, BR.EXTENSION_COLS));
      UI.toast('Đã nạp bộ dữ liệu mẫu: ' + this.state.rows.length + ' quan sát × ' + this.banks().length + ' ngân hàng (2014–2024).', 'ok');
      this.setHash({}, 'overview');
      this.render();
    },

    /* ---------- Upload (V-01, V-02, SEC-06) ---------- */
    async handleFile(file) {
      const st = this.state;
      // V-01: chỉ .csv/.xlsx
      if (!/\.(csv|xlsx)$/i.test(file.name)) { UI.toast('Định dạng không hỗ trợ. Chỉ chấp nhận .csv và .xlsx', 'err'); return; }
      // V-02: tối đa 10MB
      if (file.size > 10 * 1024 * 1024) { UI.toast('Tệp vượt 10 MB (' + BR.fmtNum(file.size / 1048576, 1) + ' MB). Hãy tách nhỏ hoặc xoá bớt dòng.', 'err'); return; }
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheetName = wb.SheetNames.includes('data') ? 'data' : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
        if (!aoa.length) { UI.toast('Tệp rỗng hoặc hỏng — không đọc được dòng nào.', 'err'); return; }
        // chuẩn hoá tên cột (tự động khớp tiếng Việt có/không dấu, BCTC, Vietstock, bộ dữ liệu nghiên cứu)
        const rawHeaders = aoa[0] || [];
        const header = rawHeaders.map(c => BR.normalizeHeader ? BR.normalizeHeader(c) : String(c === null ? '' : c).trim().toLowerCase().replace(/\s+/g, '_'));
        if (!header.includes('inflation') && (header.includes('year') || header.includes('infl'))) header.push('inflation');
        if (!header.includes('bank_name') && (header.includes('bank_code') || header.includes('id'))) header.push('bank_name');
        if (!header.includes('group_5_loans') && (header.includes('no_xau') || header.includes('bad_debts') || header.includes('nonperforming'))) {
          if (!header.includes('group_3_loans')) header.push('group_3_loans');
          if (!header.includes('group_4_loans')) header.push('group_4_loans');
          header.push('group_5_loans');
        }
        if ((!header.includes('risk_weighted_assets') || !header.includes('regulatory_capital')) && (header.includes('car_reported') || header.includes('car'))) {
          if (!header.includes('risk_weighted_assets')) header.push('risk_weighted_assets');
          if (!header.includes('regulatory_capital')) header.push('regulatory_capital');
        }
        const missing = BR.REQUIRED_COLS.filter(c => !header.includes(c));
        if (missing.length) {
          UI.modal({
            title: 'Thiếu cột bắt buộc (V-03)',
            body: UI.h('div', {},
              UI.h('p', {}, 'Tệp thiếu ' + missing.length + ' cột bắt buộc:'),
              UI.h('p', { class: 'mono' }, missing.join(', ')),
              UI.h('p', { class: 'muted' }, 'Hệ thống đã tự nhận diện tên cột tiếng Việt/viết tắt. Hãy tải mẫu chuẩn ở trang Dữ liệu để xem danh sách trường.')),
            footer: [UI.h('button', { class: 'btn primary', onclick: function () { this.closest('.modal-back').remove(); } }, 'Đã hiểu')]
          });
          return;
        }
        const rows = aoa.slice(1).filter(r => r.some(c => c !== null && String(c).trim() !== ''))
          .map(r => {
            const o = {};
            rawHeaders.forEach((c, i) => o[header[i]] = r[i] === undefined ? null : r[i]);
            
            // Xử lý nợ xấu gộp (nonperforming / bad_debts / no_xau)
            if (o.group_5_loans === null || o.group_5_loans === undefined) {
              const bd = o.bad_debts !== undefined && o.bad_debts !== null ? o.bad_debts : (o.no_xau !== undefined ? o.no_xau : o.nonperforming);
              if (bd !== undefined && bd !== null) {
                const bdNum = BR.parseNumeric(bd);
                o.group_5_loans = bdNum.ok ? bdNum.value : null;
                o.group_3_loans = o.group_3_loans || 0;
                o.group_4_loans = o.group_4_loans || 0;
              }
            }

            // Xử lý CAR reported -> RWA và vốn tự có
            const carVal = o.car_reported !== undefined && o.car_reported !== null ? o.car_reported : o.car;
            if (carVal !== null && carVal !== undefined) {
              const numCar = BR.parseNumeric(carVal);
              if (numCar.ok) {
                const carRatio = Math.abs(numCar.value) > 1 ? numCar.value / 100 : numCar.value;
                o.car_reported = carRatio;
                if (!o.risk_weighted_assets || !o.regulatory_capital) {
                  const taNum = BR.parseNumeric(o.total_assets);
                  const ta = taNum.ok && taNum.value > 0 ? taNum.value : 1000000;
                  o.risk_weighted_assets = Math.round(ta * 0.70);
                  o.regulatory_capital = Math.round(carRatio * o.risk_weighted_assets);
                }
              }
            }

            // Xử lý lạm phát
            if (o.inflation === null || o.inflation === undefined) {
              if (o.year && BR.GSO_INFLATION && BR.GSO_INFLATION[o.year] !== undefined) {
                o.inflation = BR.GSO_INFLATION[o.year];
              }
            } else {
              const infP = BR.parseNumeric(o.inflation);
              if (infP.ok && Math.abs(infP.value) <= 1) {
                o.inflation = infP.value * 100;
              }
            }

            if (!o.bank_name && o.bank_code) o.bank_name = o.bank_code;
            return o;
          });
        if (!rows.length) { UI.toast('Tệp không có dòng dữ liệu nào.', 'err'); return; }

        // Kiểm tra trùng trước khi nạp (C-06: luôn hỏi)
        const cleaned0 = BR.cleanRows(rows, {});
        const dupCheck = BR.validate(cleaned0, { columns: header });
        const hasDup = dupCheck.issues.some(x => x.rule === 'V-04');
        st._pendingSource = 'upload';
        st._pendingFileName = file.name;
        if (hasDup) {
          const choice = await new Promise(resolve => {
            const m = UI.modal({
              title: 'Phát hiện dòng trùng (V-04)',
              body: UI.h('div', {},
                UI.h('p', {}, 'Có các bản ghi trùng <bank_code + year>. Hệ thống KHÔNG tự xoá dòng trùng — bạn chọn cách giữ:'),
                UI.h('p', { class: 'muted' }, 'Chi tiết từng dòng trùng hiển thị trong bảng kiểm tra sau khi nạp.')),
              footer: [
                UI.h('button', { class: 'btn', onclick: () => { m.close(); resolve('keep-all'); } }, 'Giữ tất cả'),
                UI.h('button', { class: 'btn', onclick: () => { m.close(); resolve('keep-first'); } }, 'Giữ dòng đầu'),
                UI.h('button', { class: 'btn primary', onclick: () => { m.close(); resolve('keep-last'); } }, 'Giữ dòng sau')
              ]
            });
          });
          await this.runAnalysis(rows, header, choice);
        } else {
          await this.runAnalysis(rows, header);
        }
        const v = st.validation;
        UI.toast('Đã đọc ' + rows.length + ' dòng, ' + header.length + ' cột. ' +
          (v.blocks.length ? '⚠ ' + v.blocks.length + ' lỗi nghiêm trọng' : 'Dữ liệu hợp lệ') +
          (v.warns.length ? ', ' + v.warns.length + ' cảnh báo.' : '.'), v.blocks.length ? 'warn' : 'ok');
        this.setHash({}, v.blocks.filter(b => b.rule !== 'V-04').length ? 'data' : 'overview');
        this.render();
      } catch (e) {
        UI.toast('Không đọc được tệp: ' + (e.message || e) + '. Tệp có thể hỏng hoặc sai cấu trúc.', 'err');
      }
    },

    /* ---------- Cập nhật 1 ô (sửa lỗi trực tiếp trong preview) ---------- */
    async updateCell(rowIdx, col, rawValue) {
      const row = this.state.rows.find(r => r._rowIdx === rowIdx);
      if (!row) return;
      if (BR.REQUIRED_NUMERIC.includes(col)) {
        const p = BR.parseNumeric(rawValue);
        row[col] = p.ok ? p.value : null;
      } else if (col === 'bank_code') row.bank_code = String(rawValue).trim().toUpperCase();
      else row[col] = rawValue;
      // phân tích lại nhanh trên dữ liệu hiện tại
      const raws = this.state.rows.map(r => {
        const o = {}; for (const c of BR.REQUIRED_COLS.concat(BR.AUDIT_COLS, BR.EXTENSION_COLS)) o[c] = r[c]; return o;
      });
      const src = this.state.source, fn = this.state.fileName;
      this.state._pendingSource = src; this.state._pendingFileName = fn;
      await this.runAnalysis(raws, this.state.columns);
      this.render();
    },

    /* ---------- Mẫu upload (PRD Phụ lục C) ---------- */
    downloadTemplate(kind) {
      const headers = BR.REQUIRED_COLS.concat(BR.AUDIT_COLS, BR.EXTENSION_COLS);
      const examples = [
        ['AAA', 'Ngan hang TMCP Mau A', 2022, 1200000, 780000, 68000, 15000, 42000, 33000, 820000, 1500, 900, 4800, 3200, 14000, 3.15, 'https://example.com/bctc2022.pdf', '2023-03-30', 'audited', 'So lieu hop nhat'],
        ['AAA', 'Ngan hang TMCP Mau A', 2023, 1380000, 905000, 76000, 17500, 48000, 37000, 940000, 1900, 1100, 6200, 4100, 16000, 3.25, 'https://example.com/bctc2023.pdf', '2024-03-28', 'audited', 'So lieu hop nhat'],
        ['BBB', 'Ngan hang TMCP Mau B', 2023, 640000, 430000, 31000, 4200, 19000, 16500, 470000, 2400, 1800, 9100, 3900, 9500, 3.25, 'https://example.com/bctc2023b.pdf', '2024-04-02', 'audited', '']
      ];
      if (kind === 'csv') {
        UI.downloadText('bankrisk_template_v1.csv', BR.toCSV([headers, ...examples]), 'text/csv;charset=utf-8');
        UI.toast('Đã tải bankrisk_template_v1.csv', 'ok');
        return;
      }
      const wb = XLSX.utils.book_new();
      const wsData = XLSX.utils.aoa_to_sheet([headers, ...examples]);
      wsData['!cols'] = headers.map(hh => ({ wch: Math.max(12, hh.length + 2) }));
      XLSX.utils.book_append_sheet(wb, wsData, 'data');
      const dict = [['Trường', 'Nhãn tiếng Việt', 'Bắt buộc', 'Quy tắc kiểm tra', 'Nguồn gợi ý']];
      const D = {
        bank_code: ['Mã ngân hàng', '✅', 'Chữ+số viết hoa, không dấu cách', 'Mã niêm yết'],
        bank_name: ['Tên ngân hàng', '✅', 'Không rỗng', 'Giấy phép/Điều lệ'],
        year: ['Năm tài chính', '✅', '1990 ≤ year ≤ năm hiện tại', 'Trang bìa BCTC'],
        total_assets: ['Tổng tài sản', '✅', '> 0', 'Bảng cân đối kế toán'],
        risk_weighted_assets: ['Tài sản có rủi ro (RWA)', '✅', '> 0; cảnh báo nếu > 1.5×tổng tài sản', 'Công bố an toàn vốn'],
        regulatory_capital: ['Vốn tự có', '✅', '> 0', 'Công bố an toàn vốn'],
        profit_after_tax: ['Lợi nhuận sau thuế', '✅', 'Cho phép âm', 'Báo cáo KQKD'],
        total_operating_income: ['Tổng thu nhập hoạt động', '✅', '≠ 0 (mẫu số)', 'Báo cáo KQKD'],
        net_interest_income: ['Thu nhập lãi thuần', '✅', '≤ tổng thu nhập hoạt động (cảnh báo nếu vượt)', 'Báo cáo KQKD'],
        gross_loans: ['Dư nợ cho vay (gộp)', '✅', '> 0', 'Bảng cân đối/Thuyết minh'],
        group_3_loans: ['Nợ nhóm 3 (dưới tiêu chuẩn)', '✅', '≥ 0', 'Thuyết minh chất lượng nợ'],
        group_4_loans: ['Nợ nhóm 4 (nghi ngờ)', '✅', '≥ 0', 'Thuyết minh chất lượng nợ'],
        group_5_loans: ['Nợ nhóm 5 (khả năng mất vốn)', '✅', '≥ 0; tổng nhóm 3–5 ≤ dư nợ', 'Thuyết minh chất lượng nợ'],
        credit_risk_provision_expense: ['Chi phí dự phòng rủi ro tín dụng', '✅', '≥ 0', 'Báo cáo KQKD'],
        operating_expenses: ['Chi phí hoạt động', '✅', '≥ 0', 'Báo cáo KQKD'],
        inflation: ['Lạm phát (%)', '✅', '−20 ≤ x ≤ 100; đồng nhất trong năm', 'GSO / World Bank'],
        source_url: ['Đường dẫn nguồn', '⬜', 'URL hợp lệ', '—'],
        report_date: ['Ngày phát hành báo cáo', '⬜', 'ISO YYYY-MM-DD', 'Trang ký BCTC'],
        audited_status: ['Tình trạng kiểm toán', '⬜', 'audited/unaudited/reviewed', '—'],
        notes: ['Ghi chú', '⬜', '≤ 500 ký tự', '—'],
        car_reported: ['CAR công bố (dùng khi thiếu RWA)', '⬜', '0 < x < 1 hoặc (%)', 'Công bố an toàn vốn'],
        total_deposits: ['Tiền gửi khách hàng (bật LDR)', '⬜', '> 0', 'Bảng cân đối'],
        earning_assets: ['Tài sản sinh lời (bật NIM)', '⬜', '> 0', 'Bảng cân đối'],
        equity: ['Vốn chủ sở hữu (dùng cho Z-score)', '⬜', '> 0', 'Bảng cân đối'],
        ownership_group: ['Nhóm sở hữu', '⬜', 'state/private/foreign/other', '—']
      };
      headers.forEach(hh => dict.push([hh, ...(D[hh] || ['—', '⬜', '—', '—'])]));
      const wsDict = XLSX.utils.aoa_to_sheet(dict);
      wsDict['!cols'] = [{ wch: 32 }, { wch: 34 }, { wch: 9 }, { wch: 44 }, { wch: 26 }];
      XLSX.utils.book_append_sheet(wb, wsDict, 'huong_dan');
      const src = [
        ['Loại dữ liệu', 'Nguồn gợi ý', 'Ghi chú'],
        ['BCTC hợp nhất đã kiểm toán', 'Trang Quan hệ Nhà đầu tư của từng ngân hàng', 'Ưu tiên báo cáo hợp nhất, năm dương lịch'],
        ['Vốn tự có, RWA, CAR', 'Công bố an toàn vốn / chuẩn Basel', 'Nếu chỉ công bố CAR → điền cột car_reported'],
        ['Lạm phát', 'GSO hoặc World Bank', 'Cùng một nguồn cho toàn bộ chuỗi năm'],
        ['Quy ước đơn vị', 'triệu VND (khuyến nghị)', 'Một đơn vị thống nhất trong cả tệp (FR-DATA-01)']
      ];
      const wsSrc = XLSX.utils.aoa_to_sheet(src);
      wsSrc['!cols'] = [{ wch: 30 }, { wch: 48 }, { wch: 46 }];
      XLSX.utils.book_append_sheet(wb, wsSrc, 'nguon');
      XLSX.writeFile(wb, 'bankrisk_template_v1.xlsx');
      UI.toast('Đã tải bankrisk_template_v1.xlsx (3 sheet: data, huong_dan, nguon)', 'ok');
    },

    /* ---------- Xuất báo cáo (FG-6, AC-08) ---------- */
    reportMetaLine() {
      const st = this.state;
      return 'app v' + APP_VERSION + ' · model v' + MODEL_VERSION + ' · dataset ' + (st.datasetHash ? st.datasetHash.slice(0, 20) + '…' : 'n/a') + ' · ' + new Date().toLocaleString('vi-VN');
    },
    buildReportHTML(scope) {
      const st = this.state;
      const esc = BR.esc;
      const year = st.year;
      const inYear = st.indicators.filter(i => i.year === year);
      const sri = BR.sri(st.indicators, year);
      const groups = { stable: 0, watch: 0, high: 0, critical: 0 };
      inYear.forEach(i => { if (i.group) groups[i.group]++; });
      const alerts = inYear.filter(i => i.group === 'critical' || i.group === 'high')
        .sort((a, b) => b.severity.score100 - a.severity.score100).slice(0, 10);

      const bankSec = (bank) => {
        const rows = st.indicators.filter(i => i.bank_code === bank.code).sort((a, b) => a.year - b.year);
        if (!rows.length) return '';
        const last = rows[rows.length - 1];
        const tr = rows.map(r => '<tr><td>' + r.year + '</td><td>' + BR.fmtPct(r.car) + '</td><td>' + BR.fmtPct(r.npl) + '</td><td>' + BR.fmtPct(r.roa) + '</td><td>' + BR.fmtPct(r.cir) + '</td><td>' + BR.fmtPct(r.niir) + '</td><td>' + BR.fmtPct(r.dprr) + '</td><td>' + (r.risk_label === null ? 'N/A' : r.risk_label) + '</td></tr>').join('');
        return '<h2>2. Hồ sơ ngân hàng: ' + esc(bank.code) + ' — ' + esc(bank.name) + '</h2>' +
          '<p>Nhóm cảnh báo kỳ mới nhất: <b>' + UI.groupLabel(last.group) + '</b>; điểm nghiêm trọng ' + last.severity.score100 + '/100. ' +
          'Quy tắc kích hoạt: ' + (last.reasons.length ? last.reasons.map(r => esc(r.rule)).join('; ') : 'không có') + '.</p>' +
          '<table><tr><th>Năm</th><th>CAR</th><th>NPL</th><th>ROA</th><th>CIR</th><th>NIIR</th><th>DPRR</th><th>RISK</th></tr>' + tr + '</table>';
      };
      const banks = scope && scope.bank ? [scope.bank] : this.banks();
      const bankSections = banks.slice(0, scope && scope.bank ? 1 : 6).map(b => bankSec(b)).join('');

      return '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>BANKRISK Report</title><style>' +
        'body{font-family:"Segoe UI",Arial,sans-serif;color:#1a1a1a;font-size:11.5pt;margin:2cm 1.8cm;line-height:1.5}' +
        'h1{color:#0d2f5c;border-bottom:3px solid #1a4d8f;padding-bottom:6px;font-size:19pt}' +
        'h2{color:#0d2f5c;font-size:14pt;border-bottom:1px solid #ccc;padding-bottom:3px;margin-top:22px}' +
        'table{border-collapse:collapse;width:100%;font-size:9.5pt;margin:10px 0}' +
        'th,td{border:1px solid #999;padding:4px 7px;text-align:left}th{background:#1a4d8f;color:#fff}' +
        '.disc{border:2px solid #b3261e;background:#fde7e5;padding:10px 14px;border-radius:8px;font-size:10pt}' +
        '.meta{color:#5b6472;font-size:9.5pt;font-family:Consolas,monospace}' +
        '.pagebreak{page-break-before:always}' +
        '</style></head><body>' +
        '<h1>BANKRISK Intelligence — Báo cáo rủi ro ngân hàng</h1>' +
        '<p class="meta">' + this.reportMetaLine() + '</p>' +
        '<div class="disc"><b>Tuyên bố miễn trừ trách nhiệm (bắt buộc — SEC-13):</b><br>' + esc(DISCLAIMER) + '</div>' +
        '<h2>1. Tổng quan hệ thống — kỳ ' + year + '</h2>' +
        '<p>Số ngân hàng trong mẫu: <b>' + inYear.length + '</b>. Phân loại: Ổn định ' + groups.stable + ' · Theo dõi ' + groups.watch +
        ' · Cảnh báo cao ' + groups.high + ' · Nghiêm trọng ' + groups.critical + '.</p>' +
        (sri ? '<p>Systemic Risk Index (SRI) [GIẢ ĐỊNH HỌC THUẬT]: <b>' + sri.value + '/100</b>' + (sri.lowReliability ? ' (độ tin cậy thấp — ít hơn 5 ngân hàng)' : '') + '.</p>' : '') +
        (alerts.length ? '<h3>Top cảnh báo ưu tiên</h3><table><tr><th>Ngân hàng</th><th>Nhóm</th><th>Điểm</th><th>Tín hiệu chính</th></tr>' +
          alerts.map(a => '<tr><td>' + esc(a.bank_code) + '</td><td>' + UI.groupLabel(a.group) + '</td><td>' + a.severity.score100 + '/100</td><td>' +
            a.reasons.slice(0, 3).map(r => esc(r.rule) + ' (' + (r.var === 'CAR' || r.var === 'NPL' ? BR.fmtPct(r.value) : BR.fmtNum(r.value, 1)) + ')').join('; ') + '</td></tr>').join('') + '</table>' : '') +
        '<div class="pagebreak"></div>' + bankSections +
        '<h2>3. Phương pháp &amp; hạn chế</h2>' +
        '<p><b>Chỉ tiêu:</b> SIZE = ln(total_assets); CAR = vốn tự có/RWA; ROA = LNST/tài sản bình quân; NIIR, NPL, DPRR, CIR theo công thức chuẩn (PRD Mục 7.3). Nhãn RISK = 1 nếu NPL &gt; 3% hoặc CAR &lt; 8% — quy tắc gán nhãn nghiên cứu, không phải chuẩn pháp lý.</p>' +
        '<p><b>Hạn chế:</b> cỡ mẫu nhỏ; lớp mất cân bằng; NPL và CAR có quan hệ định nghĩa với nhãn; stress test dùng hệ số truyền dẫn giả định; dự báo là ngoại suy xu hướng. Mô hình demo (v' + MODEL_VERSION + ') là cây dựng thủ công minh hoạ, chưa huấn luyện trên dữ liệu thật.</p>' +
        '<p class="meta">Sinh bởi BANKRISK Intelligence ' + APP_VERSION + ' — tính toán hoàn toàn phía trình duyệt (Chế độ phân tích riêng tư).</p>' +
        '</body></html>';
    },
    exportReport(kind, scope) {
      const html = this.buildReportHTML(scope || {});
      if (kind === 'pdf') {
        const w = window.open('', '_blank');
        if (!w) { UI.toast('Trình duyệt đã chặn cửa sổ in — hãy cho phép popup.', 'err'); return; }
        w.document.write(html);
        w.document.close();
        setTimeout(() => { try { w.focus(); w.print(); } catch (e) { } }, 350);
      } else {
        UI.downloadText('BANKRISK_Report_' + new Date().toISOString().slice(0, 10) + '.doc', html, 'application/msword');
      }
    }
  };

  /* ---------- Khởi tạo khung giao diện ---------- */
  const NAV = [
    { group: 'Phân tích' },
    { id: 'overview', label: 'Tổng quan hệ thống' },
    { id: 'bank', label: 'Hồ sơ ngân hàng' },
    { id: 'alerts', label: 'Cảnh báo sớm' },
    { id: 'modellab', label: 'Model Lab' },
    { group: 'Mô phỏng' },
    { id: 'stress', label: 'Stress Test' },
    { id: 'forecast', label: 'Dự báo' },
    { id: 'map', label: 'Bản đồ hệ thống' },
    { id: 'cockpit', label: 'Giám sát' },
    { group: 'Dữ liệu' },
    { id: 'data', label: 'Dữ liệu & Kiểm tra' }
  ];

  function buildShell() {
    const side = UI.h('aside', { class: 'sidebar' });
    side.append(UI.h('div', { class: 'brand' },
      UI.h('div', { class: 'logo' }, 'BR'),
      UI.h('div', {}, UI.h('b', {}, 'BANKRISK'), UI.h('small', {}, 'Intelligence · v' + APP_VERSION))));
    NAV.forEach(n => {
      if (n.group) { side.append(UI.h('div', { class: 'nav-group-label' }, n.group)); return; }
      side.append(UI.h('button', { class: 'nav-item', 'data-view': n.id, onclick: () => APP.setHash({}, n.id) }, n.label));
    });
    side.append(UI.h('div', { class: 'foot' },
      UI.h('div', {}, 'Tính toán hoàn toàn trong trình duyệt.'),
      UI.h('div', { style: { marginTop: '6px' } }, 'Hệ hỗ trợ ra quyết định.')));

    const fileInputTop = UI.h('input', {
      type: 'file', accept: '.xlsx,.csv', style: { display: 'none' },
      onchange: e => { if (e.target.files && e.target.files[0]) APP.handleFile(e.target.files[0]); }
    });
    const topbar = UI.h('div', { class: 'topbar' },
      UI.h('h1', { id: 'page-title' }, 'BANKRISK'),
      UI.h('div', { class: 'controls' },
        UI.h('span', { id: 'source-chip' }),
        UI.h('select', { class: 'sel', id: 'year-select', disabled: true, onchange: e => APP.setHash({ year: e.target.value || null }) }),
        fileInputTop,
        UI.h('button', { class: 'btn', onclick: () => fileInputTop.click() }, '📁 Tải tệp lên'),
        UI.h('button', { class: 'btn primary', onclick: () => APP.state.source ? APP.exportReport('pdf') : APP.setHash({}, 'data') }, '🖨 Xuất báo cáo')));

    const main = UI.h('div', { class: 'main' }, topbar, UI.h('div', { class: 'content', id: 'view-root' }),
      UI.h('div', { class: 'footer' },
        UI.h('div', {}, UI.h('b', {}, 'Tuyên bố miễn trừ trách nhiệm: '), DISCLAIMER),
        UI.h('div', { style: { marginTop: '4px', fontSize: '11px' } },
          'app v' + APP_VERSION + ' · model v' + MODEL_VERSION + ' · Chạy trên Cloudflare Pages · ' + 'Không gửi dữ liệu ra ngoài trình duyệt khi chưa có sự đồng ý (P-04).')));

    const app = document.getElementById('app');
    app.append(side, main);

    // Vùng kéo-thả upload toàn cục
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) APP.handleFile(e.dataTransfer.files[0]);
    });
    window.addEventListener('hashchange', () => APP.render());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { buildShell(); APP.render(); });
  } else {
    buildShell(); APP.render();
  }
})();
