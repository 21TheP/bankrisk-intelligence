/* ============================================================
   Trang Dữ liệu & Kiểm tra — upload (V-01..V-14), bảng lỗi có
   lọc/tải CSV/nhảy tới ô, preview sửa trực tiếp (7.1.3), DQ score
   (7.2.1), tuỳ chọn CAR/Winsorize, metadata phân tích (M-07).
   ============================================================ */
(function () {
  'use strict';
  const BR = window.BRCORE, UI = window.BRUI, APP = window.APP;

  const state = { level: 'all' };

  function render(root) {
    const st = APP.state;
    const wrap = UI.h('div');
    root.append(wrap);

    /* ---- Upload zone ---- */
    const dz = UI.h('div', {
      class: 'dropzone mb', role: 'button', tabindex: '0',
      onclick: () => fileInput.click(),
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); }
    },
      UI.h('div', { style: { fontSize: '28px' } }, '📤'),
      UI.h('p', { style: { margin: '6px 0 2px' } }, UI.h('b', {}, 'Kéo tệp .csv hoặc .xlsx vào đây'), ' hoặc bấm để chọn (tối đa 10 MB)'),
      UI.h('p', { class: 'muted', style: { margin: 0 } }, '🔒 Tệp gốc không rời khỏi máy bạn — đọc bằng SheetJS ngay trong trình duyệt (Chế độ phân tích riêng tư, P-01–P-06).'));
    const fileInput = UI.h('input', { type: 'file', accept: '.csv,.xlsx', class: 'hidden', onchange: e => { if (e.target.files[0]) APP.handleFile(e.target.files[0]); e.target.value = ''; } });
    dz.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) APP.handleFile(e.dataTransfer.files[0]);
    });
    wrap.append(UI.h('div', { class: 'card mb' },
      UI.h('div', { class: 'flex mb' }, UI.h('h3', { style: { margin: 0 } }, 'Nạp dữ liệu'),
        UI.h('span', { class: 'spacer' }),
        UI.h('button', { class: 'btn small', onclick: () => APP.downloadTemplate('xlsx') }, '⬇ Mẫu XLSX (3 sheet)'),
        UI.h('button', { class: 'btn small', onclick: () => APP.downloadTemplate('csv') }, '⬇ Mẫu CSV'),
        UI.h('button', { class: 'btn small', onclick: () => APP.loadDemo() }, '🧪 Dùng bộ demo')),
      dz, fileInput,
      UI.h('p', { class: 'muted', style: { margin: '10px 0 0' } },
        'Cấu trúc bắt buộc: 16 cột (bank_code … inflation) + 4 cột kiểm toán tuỳ chọn + 5 cột mở rộng. Đơn vị tiền tệ: một đơn vị thống nhất trong cả tệp (khuyến nghị triệu VND — FR-DATA-01; hệ thống không tự suy đoán đơn vị).')));

    if (!st.source || !st.validation) {
      wrap.append(UI.emptyState('Chưa có dữ liệu để kiểm tra. Nạp tệp hoặc dùng bộ demo để bắt đầu.', '🗃️'));
      return;
    }

    /* ---- Trạng thái dữ liệu hiện tại ---- */
    const v = st.validation;
    const dq = v.dq;
    wrap.append(UI.h('div', { class: 'card mb' },
      UI.h('div', { class: 'flex mb' },
        UI.h('h3', { style: { margin: 0 } }, 'Trạng thái dữ liệu: ' + (st.fileName || '—')),
        st.source === 'demo' ? UI.h('span', { class: 'chip demo' }, 'DỮ LIỆU DEMO') : UI.h('span', { class: 'chip neutral' }, 'Dữ liệu của bạn'),
        UI.h('span', { class: 'spacer' }),
        UI.h('button', { class: 'btn small danger', onclick: resetData }, '🗑 Xoá dữ liệu hiện tại')),
      UI.h('div', { class: 'kpi-row' },
        UI.metric({ label: 'Dòng dữ liệu (n_after_cleaning)', value: String(st.rows.length), badge: UI.srcType(st), badgeType: UI.srcType(st) }),
        UI.metric({ label: 'Số ngân hàng', value: String(new Set(st.rows.map(r => r.bank_code)).size), badge: UI.srcType(st), badgeType: UI.srcType(st) }),
        UI.metric({ label: 'Lỗi nghiêm trọng (chặn)', value: String(v.blocks.length), note: v.blocks.length ? 'Cần sửa trước khi tin cậy kết quả' : 'Không có' }),
        UI.metric({ label: 'Cảnh báo', value: String(v.warns.length) }),
        UI.metric({
          label: 'Điểm chất lượng dữ liệu (DQ)', value: String(dq.score) + '<small>/100</small>',
          note: dq.label + ' [GIẢ ĐỊNH HỌC THUẬT – PRD 7.2.1]' + (dq.score < 50 ? ' · ⚠ Khoá chấm điểm mô hình, chỉ xem thống kê mô tả' : dq.score < 70 ? ' · kết quả mô hình gắn cờ độ tin cậy hạn chế' : ''),
          info: () => UI.h('div', { class: 'how-panel' },
            UI.h('p', {}, UI.h('code', {}, 'DQ = 100 − 2,0×% ô bắt buộc thiếu − 1,5×% dòng cảnh báo − 1,0×% ngân hàng đứt chuỗi − 0,5×% thiếu trường kiểm toán')),
            UI.h('table', {},
              UI.h('tr', {}, UI.h('td', {}, 'Ô bắt buộc bị thiếu'), UI.h('td', {}, String(dq.missingCells))),
              UI.h('tr', {}, UI.h('td', {}, 'Dòng có cảnh báo'), UI.h('td', {}, String(dq.warnRows))),
              UI.h('tr', {}, UI.h('td', {}, 'Ngân hàng đứt chuỗi năm'), UI.h('td', {}, String(dq.banksWithGaps))),
              UI.h('tr', {}, UI.h('td', {}, 'Dải điểm'), UI.h('td', {}, '≥90 Tốt · 70–89 Khá · 50–69 Cần xem lại · <50 Kém'))))
        }))));

    /* ---- Tuỳ chọn phân tích ---- */
    wrap.append(UI.h('div', { class: 'card mb' },
      UI.h('h3', { style: { margin: '0 0 8px' } }, 'Tuỳ chọn phân tích (ghi vào metadata — M-07)'),
      UI.h('div', { class: 'flex' },
        UI.h('label', { class: 'lbl' }, 'Cách lấy CAR khi thiếu RWA (7.3.3):'),
        UI.h('select', { class: 'sel', onchange: e => { st.carMode = e.target.value; reanalyze(); } },
          UI.h('option', { value: 'computed', selected: st.carMode === 'computed' }, 'Chỉ dùng RWA (mặc định)'),
          UI.h('option', { value: 'reported', selected: st.carMode === 'reported' }, 'Dùng car_reported khi thiếu'),
          UI.h('option', { value: 'derive', selected: st.carMode === 'derive' }, 'Suy ra RWA từ car_reported')),
        UI.h('span', { class: 'spacer' }),
        UI.h('label', { class: 'flex', style: { gap: '6px' } },
          UI.h('input', { type: 'checkbox', checked: st.winsorized, onchange: e => { st.winsorized = e.target.checked; reanalyze(); } }),
          UI.h('span', {}, 'Winsorization 1%/99% (C-09 — mặc định TẮT)'))),
      UI.h('p', { class: 'muted', style: { margin: '8px 0 0' } },
        'Metadata hiện tại: calc v' + (st.meta.calc_version || '?') + ' · car_mode=' + (st.meta.car_mode || 'computed') +
        ' · winsorized=' + (st.meta.winsorized ? 'true' : 'false') + ' · unit=' + (st.meta.unit || 'million_vnd') +
        ' · dataset=' + (st.datasetHash ? st.datasetHash.slice(0, 24) + '…' : 'n/a'))));

    /* ---- Bảng lỗi ---- */
    const errCard = UI.h('div', { class: 'card mb' },
      UI.h('div', { class: 'flex mb' },
        UI.h('h3', { style: { margin: 0 } }, 'Bảng kiểm tra (V-01…V-14)'),
        UI.h('select', { class: 'sel', onchange: e => { state.level = e.target.value; renderIssues(); } },
          UI.h('option', { value: 'all' }, 'Tất cả (' + v.issues.length + ')'),
          UI.h('option', { value: 'block' }, 'Chặn (' + v.blocks.length + ')'),
          UI.h('option', { value: 'warn' }, 'Cảnh báo (' + v.warns.length + ')')),
        UI.h('span', { class: 'spacer' }),
        UI.h('button', { class: 'btn small', onclick: exportIssues }, '⬇ Tải danh sách lỗi (CSV)')));
    const issueHost = UI.h('div');
    errCard.append(issueHost);
    wrap.append(errCard);

    function renderIssues() {
      issueHost.innerHTML = '';
      const list = v.issues.filter(x => state.level === 'all' || x.level === state.level);
      if (!list.length) {
        issueHost.append(UI.emptyState(v.blocks.length === 0 && v.warns.length === 0
          ? 'Dữ liệu hợp lệ. 0 lỗi nghiêm trọng, 0 cảnh báo.'
          : 'Không có mục nào ở mức này.', '✅'));
        return;
      }
      issueHost.append(UI.table(
        [{ label: 'Dòng', cls: 'num' }, 'Cột', 'Giá trị', 'Mức', 'Quy tắc', 'Lý do', 'Gợi ý sửa', ''],
        list.slice(0, 400).map(x => ({
          trClass: x.level === 'block' ? 'rowflag' : '',
          cells: [
            { content: x.row === null ? '—' : String(x.row + 1), cls: 'num' },
            { content: UI.h('code', {}, String(x.col)) },
            { content: x.value === null ? '(rỗng)' : String(x.value) },
            { content: UI.h('span', { class: 'chip ' + (x.level === 'block' ? 'critical' : 'watch') }, x.level === 'block' ? 'Chặn' : 'Cảnh báo') },
            { content: UI.h('b', {}, x.rule) },
            x.message,
            { content: UI.h('span', { class: 'muted' }, x.suggestion) },
            { content: x.row === null ? '' : UI.h('button', { class: 'btn small', title: 'Nhảy tới ô trong bảng preview', onclick: () => { APP.setHash({ focus: x.row + '_' + x.col, level: state.level }, 'data'); } }, '→ Ô') }
          ]
        })), { maxHeight: '360px' }));
    }
    renderIssues();

    function exportIssues() {
      const matrix = [['level', 'rule', 'row', 'col', 'value', 'message', 'suggestion']];
      v.issues.forEach(x => matrix.push([x.level, x.rule, x.row === null ? '' : x.row + 1, x.col, x.value, x.message, x.suggestion]));
      UI.downloadText('bankrisk_issues.csv', BR.toCSV(matrix), 'text/csv;charset=utf-8');
    }

    /* ---- Preview + sửa trực tiếp ---- */
    const prevCard = UI.h('div', { class: 'card' },
      UI.h('div', { class: 'flex mb' },
        UI.h('h3', { style: { margin: 0 } }, 'Bản xem trước & sửa trực tiếp (C-05, bước 5)'),
        UI.h('span', { class: 'muted' }, 'Bấm vào ô số để sửa — kiểm tra lại sau khi sửa'),
        UI.h('span', { class: 'spacer' }),
        UI.h('button', { class: 'btn small', onclick: exportRows }, '⬇ Tải dữ liệu đã làm sạch (CSV)')));
    const cols = ['bank_code', 'year', 'total_assets', 'risk_weighted_assets', 'regulatory_capital', 'total_operating_income', 'gross_loans', 'inflation'];
    const tbl = UI.h('table', { class: 'tbl' });
    tbl.append(UI.h('thead', {}, UI.h('tr', {},
      UI.h('th', {}, 'Dòng'),
      cols.map(c => UI.h('th', {}, c)))));
    const tb = UI.h('tbody');
    st.rows.slice(0, 300).forEach(r => {
      const tr = UI.h('tr');
      tr.append(UI.h('td', { class: 'muted' }, String(r._rowIdx + 1)));
      cols.forEach(c => {
        let td;
        if (c === 'bank_code') {
          td = UI.h('td', {}, String(r[c]));
        } else {
          td = UI.h('td', { class: 'num', title: 'Gốc: ' + (r._raw[c] !== undefined && r._raw[c] !== null ? String(r._raw[c]) : String(r[c])) },
            UI.h('input', {
              class: 'inp', value: r[c] === null ? '' : String(r[c]),
              style: { width: Math.max(60, Math.min(130, (r[c] === null ? 6 : String(r[c]).length) * 8 + 20)) + 'px', fontSize: '12px', padding: '2px 6px', textAlign: 'right' },
              onchange: async e => {
                await APP.updateCell(r._rowIdx, c, e.target.value);
                UI.toast('Đã cập nhật ô ' + c + ' dòng ' + (r._rowIdx + 1) + '. Đang kiểm tra lại…', 'ok');
              }
            }));
        }
        tr.append(td);
      });
      tb.append(tr);
    });
    tbl.append(tb);
    prevCard.append(UI.h('div', { class: 'tbl-wrap', style: { maxHeight: '420px', overflow: 'auto' } }, tbl));
    if (st.rows.length > 300) prevCard.append(UI.h('p', { class: 'muted' }, 'Hiển thị 300/' + st.rows.length + ' dòng đầu (tải CSV để có toàn bộ).'));
    prevCard.append(UI.h('p', { class: 'muted' }, 'Mỗi ô giữ song song giá trị gốc (value_raw) và giá trị đã làm sạch (value_clean) — di chuột để xem giá trị gốc. Hệ thống không bao giờ tự sửa giá trị bất thường, chỉ gắn cờ (C-08).'));
    wrap.append(prevCard);

    function exportRows() {
      const allCols = BR.REQUIRED_COLS.concat(BR.AUDIT_COLS, BR.EXTENSION_COLS);
      const matrix = [allCols].concat(st.rows.map(r => allCols.map(c => r[c])));
      UI.downloadText('bankrisk_cleaned.csv', BR.toCSV(matrix), 'text/csv;charset=utf-8');
    }

    async function reanalyze() {
      const raws = st.rows.map(r => {
        const o = {}; for (const c of BR.REQUIRED_COLS.concat(BR.AUDIT_COLS, BR.EXTENSION_COLS)) o[c] = r[c]; return o;
      });
      st._pendingSource = st.source; st._pendingFileName = st.fileName;
      await APP.runAnalysis(raws, st.columns);
      if (st.winsorized) {
        BR.winsorizeIndicators(st.indicators);
        st.meta.winsorized = true;
        APP.computeGroups();
      }
      APP.render();
    }

    function resetData() {
      const m = UI.modal({
        title: 'Xoá dữ liệu hiện tại?',
        body: UI.h('p', {}, 'Toàn bộ dữ liệu đang phân tích (nằm trong bộ nhớ trình duyệt) sẽ bị xoá. Tệp gốc trên máy bạn không bị ảnh hưởng.'),
        footer: [
          UI.h('button', { class: 'btn', onclick: () => m.close() }, 'Huỷ'),
          UI.h('button', {
            class: 'btn danger', onclick: () => {
              Object.assign(APP.state, { source: null, fileName: null, rows: [], columns: [], validation: null, indicators: [], meta: {}, dq: null, modelRun: null, stress: { params: {}, assumptions: {}, scenarios: [] } });
              m.close();
              APP.setHash({}, 'overview');
              APP.render();
            }
          }, 'Xoá')]
      });
    }
  }

  APP.registerView('data', { title: 'Dữ liệu & Kiểm tra', render });
})();
