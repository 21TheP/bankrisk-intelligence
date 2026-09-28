/* ============================================================
   BANKRISK Intelligence — UI helpers
   Huy hiệu nguồn A/B/C/D (FR-MAP-01), panel "Cách tính số này"
   (FR-CALC-01), modal, toast, biểu đồ ECharts + xuất PNG/CSV
   (FR-DASH-00b), thẻ số liệu.
   ============================================================ */
(function (global) {
  'use strict';
  const BR = global.BRCORE;
  const UI = global.BRUI = {};

  /* ---------- DOM builder ---------- */
  UI.h = function (tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v; // chỉ dùng với chuỗi tin cậy
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat(9)) {
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return el;
  };

  /* ---------- Dropdown tự vẽ (thay <select> native — popup native của OS
     không mở được trong một số webview nhúng; component này chạy bằng DOM thuần) ---------- */
  UI.closeDropdowns = function () {
    document.querySelectorAll('.dd.open').forEach(d => d.classList.remove('open'));
  };
  document.addEventListener('click', () => UI.closeDropdowns());

  UI.dropdown = function (opts) {
    const find = v => opts.options.find(o => String(o.value) === String(v));
    const cur = find(opts.value) || opts.options[0] || { label: '—' };
    const dd = UI.h('div', { class: 'dd' });
    const label = UI.h('span', { class: 'dd-label' }, cur.label);
    const btn = UI.h('button', { class: 'dd-btn', type: 'button', title: cur.label }, label,
      UI.h('span', { class: 'dd-arrow' }, '▾'));
    const menu = UI.h('div', { class: 'dd-menu' },
      opts.options.map(o => UI.h('div', {
        class: 'dd-item' + (String(o.value) === String(opts.value) ? ' active' : ''),
        'data-value': o.value
      }, o.label)));
    dd.append(btn, menu);
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const wasOpen = dd.classList.contains('open');
      UI.closeDropdowns();
      if (!wasOpen && opts.options.length) dd.classList.add('open');
    });
    menu.addEventListener('click', e => {
      const item = e.target.closest('.dd-item');
      if (!item) return;
      e.stopPropagation();
      UI.closeDropdowns();
      menu.querySelectorAll('.dd-item').forEach(i => i.classList.toggle('active', i === item));
      const opt = find(item.dataset.value);
      label.textContent = opt ? opt.label : item.textContent;
      btn.title = label.textContent;
      if (opts.onChange) opts.onChange(item.dataset.value);
    });
    return dd;
  };

  /* ---------- Huy hiệu nguồn (PRD 2.2) ---------- */
  const BADGE_META = {
    A: { cls: 'src-A', label: 'Kết quả nghiên cứu' },
    B: { cls: 'src-B', label: 'Mô hình v1.0.0-demo' },
    C: { cls: 'src-C', label: 'Dữ liệu của bạn' },
    D: { cls: 'src-D', label: 'DEMO' }
  };
  UI.badge = function (type, overrideLabel) {
    const m = BADGE_META[type] || BADGE_META.D;
    const title = {
      A: 'Số liệu nguyên văn từ báo cáo NCKH gốc — cố định, chỉ để đối chiếu',
      B: 'Chỉ số của mô hình demo dựng thủ công (không phải mô hình thật của nghiên cứu)',
      C: 'Tính trực tiếp trong trình duyệt từ dữ liệu bạn upload',
      D: 'Tính từ bộ dữ liệu demo dựng lại theo cấu trúc báo cáo NCKH gốc'
    }[type] || '';
    return UI.h('span', { class: 'src-badge ' + m.cls, title }, overrideLabel || m.label);
  };
  // Huy hiệu theo nguồn dữ liệu hiện tại: demo → D, upload → C
  UI.srcType = function (state) { return state.source === 'demo' ? 'D' : 'C'; };

  /* ---------- Chip mức độ rủi ro ---------- */
  const GROUP_META = {
    critical: { cls: 'critical', label: 'Nghiêm trọng' },
    high: { cls: 'high', label: 'Cảnh báo cao' },
    watch: { cls: 'watch', label: 'Theo dõi' },
    stable: { cls: 'stable', label: 'Ổn định' }
  };
  UI.groupChip = function (group) {
    const m = GROUP_META[group] || { cls: 'neutral', label: 'Chưa phân loại' };
    return UI.h('span', { class: 'chip ' + m.cls }, m.label);
  };
  UI.groupLabel = g => (GROUP_META[g] || { label: g }).label;

  // Nhãn RISK + tooltip giới hạn pháp lý (PRD 2.3 — bắt buộc cạnh mọi nhãn RISK)
  UI.riskLabel = function (ind) {
    const tip = 'Quy tắc gán nhãn nghiên cứu: RISK = 1 ⟺ (NPL > 3%) ∨ (CAR < 8%). Đây KHÔNG phải chuẩn phân loại pháp lý hay kết luận giám sát — một ngân hàng RISK=1 không đồng nghĩa vi phạm quy định hay đang kiệt quệ (PRD Mục 2.3).';
    let content;
    if (ind.risk_label === null) content = UI.h('span', { class: 'chip neutral' }, 'RISK: N/A');
    else content = UI.h('span', { class: 'chip ' + (ind.risk_label === 1 ? 'high' : 'stable') },
      'RISK = ' + ind.risk_label, ind.risk_partial ? ' (một phần)' : '');
    return UI.h('span', { class: 'risk-wrap', tabindex: '0' }, content, UI.h('span', { class: 'risk-tip' }, tip));
  };

  /* ---------- Panel "Cách tính số này" (FR-CALC-01) ---------- */
  // 5 phần: công thức, đầu vào, phép tính, kết quả, nguồn & trạng thái
  const FORMULA_INPUTS = {
    size: [['total_assets', 'Tổng tài sản', BR.fmtMoney]],
    car: [['regulatory_capital', 'Vốn tự có', BR.fmtMoney], ['risk_weighted_assets', 'Tài sản có rủi ro (RWA)', BR.fmtMoney]],
    roa: [['profit_after_tax', 'LNST', BR.fmtMoney], ['total_assets', 'Tổng tài sản', BR.fmtMoney]],
    niir: [['total_operating_income', 'Tổng thu nhập hoạt động', BR.fmtMoney], ['net_interest_income', 'Thu nhập lãi thuần', BR.fmtMoney]],
    npl: [['group_3_loans', 'Nợ nhóm 3', BR.fmtMoney], ['group_4_loans', 'Nợ nhóm 4', BR.fmtMoney], ['group_5_loans', 'Nợ nhóm 5', BR.fmtMoney], ['gross_loans', 'Dư nợ', BR.fmtMoney]],
    dprr: [['credit_risk_provision_expense', 'Chi phí DPRR tín dụng', BR.fmtMoney], ['total_operating_income', 'Tổng thu nhập hoạt động', BR.fmtMoney]],
    cir: [['operating_expenses', 'Chi phí hoạt động', BR.fmtMoney], ['total_operating_income', 'Tổng thu nhập hoạt động', BR.fmtMoney]],
    inf: [['inflation', 'Lạm phát (%)', x => BR.fmtNum(x, 2) + ' %']]
  };
  UI.howPanel = function (indKey, ind, rawRow, meta, fileName) {
    const metaI = BR.INDICATORS[indKey];
    if (!metaI) return null;
    const rows = [];
    rows.push(['Công thức', UI.h('code', {}, metaI.formula)]);
    const inputs = UI.h('span');
    const rawMap = rawRow || {};
    (FORMULA_INPUTS[indKey] || []).forEach(([col, label, fmt], idx) => {
      if (idx) inputs.append(' ; ');
      inputs.append(label + ' = ');
      inputs.append(UI.h('code', {}, fmt(rawMap[col] === undefined ? null : rawMap[col])));
    });
    rows.push(['Giá trị đầu vào', inputs]);
    // Phép tính
    let calc = '—';
    const v = ind[indKey];
    if (indKey === 'car' && ind.car_source === 'reported') calc = 'Dùng CAR công bố (car_reported), nguồn: reported';
    else if (v !== null && indKey !== 'inf') {
      const nums = FORMULA_INPUTS[indKey].map(([col]) => rawMap[col]).filter(x => typeof x === 'number');
      if (nums.length >= 2) calc = nums.slice(0, nums.length - 1).map(x => BR.fmtNum(x)).join(' ÷ ') + ' ÷ ' + BR.fmtNum(nums[nums.length - 1]) + ' = ' + BR.fmtNum(v, 6);
      else calc = 'ln(' + BR.fmtNum(nums[0]) + ') = ' + BR.fmtNum(v, 5);
    } else if (v !== null) calc = BR.fmtNum(rawMap.inflation, 2) + ' % / 100 = ' + BR.fmtNum(v, 5);
    rows.push(['Phép tính', calc]);
    rows.push(['Kết quả hiển thị', metaI.isPct ? BR.fmtPct(v) : (v === null ? 'N/A' : BR.fmtNum(v, metaI.decimals))]);
    const src = [];
    if (rawRow && rawRow._rowIdx !== undefined) src.push('Dòng ' + (rawRow._rowIdx + 1) + (fileName ? ' tệp ' + fileName : ''));
    if (indKey === 'car') src.push('nguồn CAR: ' + (ind.car_source || 'N/A'));
    if (rawRow && rawRow.audited_status) src.push(rawRow.audited_status);
    if (meta && meta.winsorized) src.push('Đã Winsorize');
    src.push('calc v' + (meta ? meta.calc_version : '?'));
    rows.push(['Nguồn & trạng thái', src.join(' ; ')]);
    if (ind.naReasons && ind.naReasons[indKey]) rows.push(['Lý do N/A', ind.naReasons[indKey]]);
    const tbl = UI.h('table');
    rows.forEach(([k, val]) => tbl.append(UI.h('tr', {}, UI.h('td', {}, k), UI.h('td', {}, val))));
    return UI.h('div', { class: 'how-panel' }, tbl);
  };

  // Nút ⓘ mở panel trong modal
  UI.infoBtn = function (title, contentFactory) {
    return UI.h('button', {
      class: 'info-btn', title: 'Cách tính số này', 'aria-label': 'Cách tính số này: ' + title,
      onclick: () => UI.modal({
        title: 'ⓘ Cách tính số này — ' + title,
        body: contentFactory(),
        footer: [UI.h('button', { class: 'btn primary', onclick: function () { this.closest('.modal-back').remove(); } }, 'Đã hiểu')]
      })
    }, 'ⓘ');
  };

  /* ---------- Thẻ số liệu ---------- */
  UI.metric = function (opts) {
    const m = UI.h('div', { class: 'metric' },
      UI.h('div', { class: 'label' }, opts.label, opts.info ? UI.infoBtn(opts.label, opts.info) : null, opts.badge ? UI.badge(opts.badgeType || UI.srcType(global.BRAPP.state), opts.badge) : null),
      UI.h('div', { class: 'value', html: opts.value })
    );
    if (opts.extra) m.append(UI.h('div', { style: { marginTop: '6px' } }, opts.extra));
    if (opts.delta !== undefined && opts.delta !== null) m.append(UI.h('div', { class: 'delta ' + opts.delta.cls }, opts.delta.text));
    if (opts.info2) m.append(UI.h('div', { style: { marginTop: '2px' } }, opts.info2));
    if (opts.note) m.append(UI.h('div', { class: 'muted', style: { marginTop: '2px' } }, opts.note));
    return m;
  };

  /* ---------- Modal & toast ---------- */
  UI.modal = function (opts) {
    const back = UI.h('div', { class: 'modal-back', onclick: e => { if (e.target === back) back.remove(); } },
      UI.h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        UI.h('header', {}, UI.h('h3', {}, opts.title),
          UI.h('button', { class: 'btn subtle', 'aria-label': 'Đóng', onclick: () => back.remove() }, '✕')),
        UI.h('div', { class: 'body' }, opts.body),
        opts.footer ? UI.h('footer', {}, opts.footer) : null));
    document.body.append(back);
    return { close: () => back.remove(), el: back };
  };

  UI.toast = function (msg, type) {
    const t = UI.h('div', {
      style: {
        position: 'fixed', bottom: '18px', right: '18px', zIndex: 200,
        background: type === 'err' ? 'var(--red)' : type === 'warn' ? '#8a6d00' : 'var(--navy)',
        color: '#fff', padding: '10px 16px', borderRadius: '10px', fontSize: '13px',
        boxShadow: '0 8px 30px rgba(0,0,0,.25)', maxWidth: '380px'
      }
    }, msg);
    document.body.append(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 3800);
  };

  /* ---------- Tải tệp ---------- */
  UI.downloadText = function (name, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const a = UI.h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  /* ---------- Biểu đồ ECharts + xuất PNG/CSV (FR-DASH-00b) ---------- */
  const charts = [];
  UI.chart = function (parent, opts) {
    const head = UI.h('div', { class: 'chart-head' },
      UI.h('div', {}, UI.h('h3', { style: { margin: '0', fontSize: '14px', color: 'var(--navy)' } }, opts.title),
        opts.sub ? UI.h('div', { class: 'muted' }, opts.sub) : null),
      UI.h('div', { class: 'chart-actions no-print' },
        UI.h('button', { class: 'btn small', title: 'Xuất PNG', onclick: () => {
          const url = box.querySelector('div[_echarts_instance_]') ? inst.getDataURL({ pixelRatio: 2, backgroundColor: '#fff' }) : null;
          if (url) { const a = UI.h('a', { href: url, download: opts.name + '.png' }); document.body.append(a); a.click(); a.remove(); }
        } }, 'PNG'),
        UI.h('button', { class: 'btn small', title: 'Xuất dữ liệu CSV', onclick: () => {
          if (opts.csv) UI.downloadText(opts.name + '.csv', BR.toCSV(opts.csv), 'text/csv;charset=utf-8');
        } }, 'CSV')));
    const box = UI.h('div', { class: 'chart-box' + (opts.small ? ' small' : '') });
    if (opts.height) box.style.height = opts.height + 'px';

    if (parent.classList && parent.classList.contains('card')) {
      if (opts.title) parent.append(head);
      parent.append(box);
    } else {
      const wrap = UI.h('div', { class: 'card' }, head, box);
      parent.append(wrap);
    }

    const inst = echarts.init(box);
    inst.setOption(opts.option);
    charts.push(inst);

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        if (box.clientWidth > 0 && box.clientHeight > 0) {
          inst.resize();
        }
      });
      ro.observe(box);
    }
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        inst.resize();
        setTimeout(() => inst.resize(), 80);
        setTimeout(() => inst.resize(), 250);
      });
    }
    return inst;
  };
  UI.clearCharts = () => {
    while (charts.length) {
      const c = charts.pop();
      try { c.dispose(); } catch (e) { }
    }
  };
  UI.resizeCharts = () => charts.forEach(c => { try { c.resize(); } catch (e) { } });
  window.addEventListener('resize', UI.resizeCharts);

  /* ---------- Tuỳ chọn biểu đồ chung ---------- */
  UI.baseGrid = { left: 46, right: 16, top: 30, bottom: 26, containLabel: true };
  UI.PALETTE = ['#2264c0', '#1e7d3c', '#b45309', '#b3261e', '#7a5d00', '#5b6472', '#1a4d8f', '#8e44ad'];
  UI.GROUP_COLOR = { stable: '#1e7d3c', watch: '#d9a400', high: '#d97b0d', critical: '#c62828' };

  UI.tooltipAxis = { trigger: 'axis' };

  /* ---------- Số liệu biểu đồ trung vị + dải phân vị ---------- */
  UI.medianBandSeries = function (years, stats /* {year: {p25,p50,p75}} */) {
    const p25 = years.map(y => stats[y] ? stats[y].p25 : null);
    const p50 = years.map(y => stats[y] ? stats[y].p50 : null);
    const p75 = years.map(y => stats[y] ? stats[y].p75 : null);
    return [
      { name: 'P75', type: 'line', data: p75, lineStyle: { opacity: 0 }, stack: 'band', symbol: 'none', silent: true },
      { name: 'Dải 25–75%', type: 'line', data: p25.map((v, i) => p75[i] !== null && v !== null ? v - p75[i] : null), lineStyle: { opacity: 0 }, areaStyle: { color: '#2264c033' }, stack: 'band', symbol: 'none', silent: true },
      { name: 'Trung vị', type: 'line', data: p50, lineStyle: { width: 2.5, color: '#1a4d8f' }, itemStyle: { color: '#1a4d8f' }, z: 5 }
    ];
  };

  /* ---------- Bảng tiện dụng ---------- */
  UI.table = function (headers, rows, opts) {
    opts = opts || {};
    const tbl = UI.h('table', { class: 'tbl' });
    tbl.append(UI.h('thead', {}, UI.h('tr', {}, headers.map(hh => UI.h('th', { class: hh.cls || '' }, hh.label || hh)))));
    const tb = UI.h('tbody');
    rows.forEach(r => tb.append(UI.h('tr', r.trClass ? { class: r.trClass } : {}, r.cells.map(c => UI.h('td', { class: c.cls || '' }, c.content !== undefined ? c.content : c)))));
    tbl.append(tb);
    return UI.h('div', { class: 'tbl-wrap', style: opts.maxHeight ? { maxHeight: opts.maxHeight, overflow: 'auto' } : {} }, tbl);
  };

  /* ---------- Empty state (FR-DASH-00d) ---------- */
  UI.emptyState = function (msg, big) {
    return UI.h('div', { class: 'empty-state' }, UI.h('div', { class: 'big' }, big || '📭'), msg);
  };
})(window);
