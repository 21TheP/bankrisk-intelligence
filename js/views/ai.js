/* ============================================================
   BANKRISK Intelligence — L6 AI Engine view
   1) Trích xuất BCTC từ văn bản PDF/copy-paste → raw rows (ghép dataset)
   2) Kiểm tra bất thường dataset (anomaly detection)
   3) Nhận xét phân tích ngân hàng đang chọn (gap analysis)
   ============================================================ */
(function () {
  'use strict';
  const BR = window.BRCORE, UI = window.BRUI, APP = window.APP, GFAI = window.GFAI;

  function render(root) {
    const st = APP.state;
    const wrap = UI.h('div');
    root.append(wrap);
    wrap.append(UI.h('div', { class: 'flex mb' },
      UI.h('h2', { style: { margin: 0, fontSize: '16px', color: 'var(--navy)' } }, 'AI Engine — phân tích bằng Gemini'),
      UI.h('span', { id: 'ai-mode-badge' })));
    const modeBadge = wrap.querySelector('#ai-mode-badge');
    GFAI.check().then(hasAI => {
      modeBadge.append(UI.badge(hasAI ? 'gemini' : 'offline',
        hasAI ? 'Gemini API (free tier)' : 'Rule-based — chưa cấu hình GEMINI_API_KEY trên Worker'));
    });

    /* ---- 1) Trích xuất BCTC (L3 + L6) ---- */
    const exCard = UI.h('div', { class: 'card mb' },
      UI.h('h3', {}, '① Trích xuất Báo cáo tài chính → dữ liệu thô'),
      UI.h('p', { class: 'muted' }, 'Copy nội dung bảng số liệu từ PDF BCTC (hoặc text OCR) rồi dán vào dưới. AI nhận diện năm và các khoản mục, trả về dòng dữ liệu chuẩn schema — bạn duyệt rồi mới ghép vào bộ dữ liệu.'));
    const exBank = UI.h('input', { class: 'inp', placeholder: 'Mã ngân hàng (VD: CTG)', value: st.bank || '', style: { minWidth: '140px' } });
    const exText = UI.h('textarea', { class: 'inp', rows: 7, style: { width: '100%', fontFamily: 'monospace', fontSize: '12px' },
      placeholder: 'Dán văn bản BCTC ở đây… (VD: "31/12/2023 Tổng tài sản 1.912.345 Chỉ tiêu... 2.024.567")' });
    const exResult = UI.h('div');
    exCard.append(UI.h('div', { class: 'flex mb', style: { alignItems: 'flex-end', gap: '8px' } },
      UI.h('div', {}, UI.h('label', { class: 'lbl' }, 'Mã ngân hàng'), exBank)));
    exCard.append(exText);
    const previewHost = UI.h('div');
    exCard.append(UI.h('div', { class: 'flex mt', style: { gap: '8px' } },
      UI.h('button', { class: 'btn primary', onclick: async () => {
        if (!exText.value.trim()) { UI.toast('Chưa dán văn bản BCTC.', 'warn'); return; }
        out.textContent = '⏳ Đang trích xuất…';
        const r = await GFAI.extractBCTC(exBank.value.trim() || 'BANK', exText.value);
        renderPreview(r);
      } }, '🤖 Trích xuất bằng AI')));
    const out = UI.h('div', { class: 'mt' });
    exCard.append(out, previewHost);

    function renderPreview(r) {
      out.innerHTML = '';
      out.append(UI.h('p', { class: 'muted' }, 'Nguồn: ' + r.source +
        (r.data.confidence !== undefined ? ' · độ tin cậy ~' + (r.data.confidence * 100).toFixed(0) + '%' : '') +
        (r.data.notes ? ' · ' + r.data.notes : '')));
      const rows = r.data.rows || [];
      if (!rows.length) { out.append(UI.h('div', { class: 'banner warn' }, '⚠ ', UI.h('span', {}, 'AI không nhận diện được dòng số liệu. Với bản rule-based, hãy cấu hình GEMINI_API_KEY trên Worker để trích xuất đầy đủ.'))); return; }
      previewHost.innerHTML = '';
      previewHost.append(UI.h('h4', { style: { margin: '8px 0 6px' } }, 'Xem trước dòng dữ liệu (' + rows.length + ')'));
      previewHost.append(UI.table(['Năm', 'Tổng TS', 'VCSH', 'Dư nợ', 'Nợ xấu (3+4+5)', 'Tiền gửi', 'LNST'],
        rows.map(row => ({
          cells: [
            UI.h('b', {}, String(row.year)),
            fmtNullable(row.total_assets), fmtNullable(row.equity), fmtNullable(row.gross_loans),
            sumNullable(row.group_3_loans, row.group_4_loans, row.group_5_loans),
            fmtNullable(row.total_deposits), fmtNullable(row.profit_after_tax)
          ]
        }))));
      previewHost.append(UI.h('div', { class: 'flex mt' },
        UI.h('button', { class: 'btn primary', onclick: () => {
          if (!st.source) { UI.toast('Hãy nạp bộ dữ liệu hiện có trước (demo hoặc upload) để ghép dòng mới vào.', 'warn'); return; }
          const existing = st.rows.map(r0 => Object.assign({}, r0));
          const mapped = rows.map(r0 => {
            const o = {};
            BR.REQUIRED_COLS.forEach(c => o[c] = r0[c] !== undefined ? r0[c] : null);
            o.bank_code = (r0.bank_code || exBank.value || 'BANK').toUpperCase();
            o.bank_name = r0.bank_name || o.bank_code;
            o.year = r0.year;
            return o;
          });
          const merged = existing.concat(mapped);
          APP.state._pendingSource = st.source; APP.state._pendingFileName = (st.fileName || 'dataset') + ' + AI';
          APP.runAnalysis(merged, st.columns).then(() => {
            UI.toast('Đã ghép ' + mapped.length + ' dòng AI-trích xuất vào bộ dữ liệu. Kiểm tra ở Dữ liệu & Kiểm tra rồi chấm điểm lại.', 'ok');
            APP.render();
          });
        } }, '✓ Ghép vào bộ dữ liệu'),
        UI.h('span', { class: 'muted' }, 'Dòng trùng bank_code|year sẽ được giữ cả hai — xử lý ở bước làm sạch (C-06).')));
    }
    exCard.append(UI.h('div', { id: 'gf-ex-out' }));
    wrap.append(exCard);

    /* ---- 2) Kiểm tra bất thường (L6) ---- */
    const anCard = UI.h('div', { class: 'card mb' }, UI.h('h3', {}, '② Kiểm tra bất thường dữ liệu (Anomaly Detection)'));
    if (!st.indicators.length) {
      anCard.append(UI.emptyState('Chưa có dữ liệu.'));
    } else {
      const anHost = UI.h('div');
      anCard.append(UI.h('button', { class: 'btn primary', onclick: async () => {
        out2.textContent = '⏳ Đang kiểm tra…';
        const payload = st.indicators.map(i => ({ bank_code: i.bank_code, year: i.year, npl: i.npl, car: i.car, roa: i.roa, cir: i.cir, dprr: i.dprr, niir: i.niir, size: i.size }));
        const r = await GFAI.anomaly(payload);
        renderAnomalies(r);
      } }, '⚡ Kiểm tra toàn bộ dataset'));
      const out2 = UI.h('div', { class: 'mt' });
      anCard.append(out2, anHost);
      function renderAnomalies(r) {
        out2.innerHTML = '';
        const box = UI.h('div', { class: 'ai-panel' });
        box.append(UI.h('h4', {}, 'Kết quả kiểm tra (nguồn: ' + r.source + ')'));
        if (r.data.summary) box.append(UI.h('p', { style: { fontSize: '13px' } }, r.data.summary));
        if (r.data.anomalies && r.data.anomalies.length) {
          box.append(UI.table(['Ngân hàng', 'Kỳ', 'Trường', 'Vấn đề', 'Mức độ'],
            r.data.anomalies.map(a => ({ cells: [a.bank_code, String(a.year), a.field, a.issue, a.severity] }))));
        } else {
          box.append(UI.h('p', { class: 'muted' }, 'Không phát hiện bất thường trong biên hợp lý.'));
        }
        anHost.append(box);
      }
    }
    wrap.append(anCard);

    /* ---- 3) Nhận xét ngân hàng (L6) ---- */
    const cmCard = UI.h('div', { class: 'card mb' },
      UI.h('h3', {}, '③ Nhận xét phân tích ngân hàng (Gap analysis)'),
      UI.h('p', { class: 'muted' }, 'Dựa trên chỉ tiêu + cảnh báo sớm của ngân hàng đang chọn ở Hồ sơ ngân hàng. Cần Gemini API key.'));
    if (!st.indicators.length) {
      cmCard.append(UI.emptyState('Chưa có dữ liệu.'));
    } else {
      const banks = APP.banks();
      const cur = banks.some(b => b.bank_code === st.bank) ? st.bank : banks[0].bank_code;
      const selBank = UI.dropdown({
        options: banks.map(b => ({ value: b.bank_code, label: b.bank_code + ' — ' + b.bank_name })),
        value: cur, onChange: v => { st.bank = v; }
      });
      const out3 = UI.h('div', { class: 'mt' });
      cmCard.append(UI.h('div', { class: 'flex mb', style: { gap: '8px', alignItems: 'flex-end' } },
        UI.h('div', {}, UI.h('label', { class: 'lbl' }, 'Ngân hàng'), selBank),
        UI.h('button', { class: 'btn primary', onclick: async () => {
          out3.textContent = '⏳ Đang phân tích…';
          const inds = st.indicators.filter(i => i.bank_code === cur).slice(-6);
          const payload = inds.map(i => ({
            year: i.year, car: i.car, npl: i.npl, roa: i.roa, cir: i.cir, dprr: i.dprr,
            niir: i.niir, size: i.size, equity_to_assets: i.equity_to_assets,
            risk_label: i.risk_label, group: i.group,
            reasons: i.reasons ? i.reasons.map(r => r.rule) : []
          }));
          try {
            const r = await GFAI.commentary(cur, payload);
            out3.innerHTML = '';
            const box = UI.h('div', { class: 'ai-panel' });
            box.append(UI.h('h4', {}, 'Nhận xét AI (' + r.source + ')'));
            String(r.data).split(/\n+/).filter(p => p.trim()).forEach(p =>
              box.append(UI.h('p', { style: { margin: '4px 0', fontSize: '13.5px' } }, p.trim())));
            out3.append(box);
          } catch (e) {
            out3.innerHTML = '';
            out3.append(UI.h('div', { class: 'banner warn' }, '⚠ ', UI.h('span', {}, e.message)));
          }
        } }, '🤖 Viết nhận xét')));
      cmCard.append(out3);
    }
    wrap.append(cmCard);

    function fmtNullable(v) { return v === null || v === undefined ? '—' : Number(v).toLocaleString('vi-VN'); }
    function sumNullable(a, b, c) {
      const s = [a, b, c].every(v => v === null || v === undefined) ? null : [a, b, c].reduce((x, y) => x + (y || 0), 0);
      return fmtNullable(s);
    }
  }

  APP.registerView('ai', { title: 'AI Engine', render });
})();
