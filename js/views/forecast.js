/* ============================================================
   Forecasting Engine (Dự báo chỉ tiêu)
   Xu hướng tuyến tính OLS hoặc trung bình trượt (FR-FCST-01),
   kỳ dự báo 1–5 năm, dải bất định mở rộng theo kỳ, bảng dự báo,
   panel giả định (R², n). Khoá nếu < 5 năm liên tục (FR-FCST-02).
   LDR/NIM ẩn nếu thiếu trường mở rộng. Chặn NPL/CAR ≥ 0 (AC-8.6-2).
   Lựa chọn của người dùng được lưu trong APP.state.forecast.
   ============================================================ */
(function () {
  'use strict';
  const BR = window.BRCORE, UI = window.BRUI, APP = window.APP;

  const IND_OPTS = [
    { key: 'car', label: 'CAR' }, { key: 'npl', label: 'NPL' }, { key: 'roa', label: 'ROA' },
    { key: 'ldr', label: 'LDR' }, { key: 'nim', label: 'NIM' }, { key: 'assets', label: 'Tổng tài sản' }
  ];

  function render(root) {
    const st = APP.state;
    const wrap = UI.h('div');
    root.append(wrap);
    if (!st.indicators.length) { wrap.append(UI.emptyState('Chưa có dữ liệu.')); return; }

    if (!st.forecast) st.forecast = { ind: 'car', h: 3, method: 'ols' };

    const banks = APP.banks();
    const bankCode = (st.bank && banks.some(b => b.bank_code === st.bank)) ? st.bank : banks[0].bank_code;
    st.bank = bankCode;
    const inds = st.indicators.filter(i => i.bank_code === bankCode).sort((a, b) => a.year - b.year);
    const hasLdr = inds.some(i => i.ldr !== null), hasNim = inds.some(i => i.nim !== null);
    const getVal = (ind, key) => key === 'assets' ? ind._total_assets : ind[key];
    const avail = IND_OPTS.filter(o => o.key === 'assets' || o.key === 'car' || o.key === 'npl' || o.key === 'roa' || (o.key === 'ldr' ? hasLdr : o.key === 'nim' ? hasNim : false));
    if (!avail.some(o => o.key === st.forecast.ind)) st.forecast.ind = 'car';

    /* ---- Hàng điều khiển: ngân hàng · kỳ · phương pháp (giữ nguyên khi đổi chỉ tiêu) ---- */
    const selBank = UI.h('select', { class: 'sel', onchange: e => { st.bank = e.target.value; APP.setHash({ bank: e.target.value }); APP.render(); } },
      banks.map(b => UI.h('option', { value: b.bank_code, selected: b.bank_code === bankCode }, b.bank_code + ' — ' + b.bank_name)));
    const selH = UI.h('select', { class: 'sel', onchange: e => { st.forecast.h = +e.target.value; renderPanel(); } },
      [1, 2, 3, 4, 5].map(h => UI.h('option', { value: h, selected: st.forecast.h === h }, h + ' năm')));
    const selMethod = UI.h('select', { class: 'sel', onchange: e => { st.forecast.method = e.target.value; renderPanel(); } },
      UI.h('option', { value: 'ols', selected: st.forecast.method === 'ols' }, 'Xu hướng tuyến tính (OLS)'),
      UI.h('option', { value: 'ma', selected: st.forecast.method === 'ma' }, 'Trung bình trượt 3 kỳ'));
    wrap.append(UI.h('div', { class: 'card mb' },
      UI.h('div', { class: 'flex', style: { flexWrap: 'wrap', gap: '10px' } },
        UI.h('div', {}, UI.h('label', { class: 'lbl' }, 'Ngân hàng'), selBank),
        UI.h('div', {}, UI.h('label', { class: 'lbl' }, 'Kỳ dự báo'), selH),
        UI.h('div', {}, UI.h('label', { class: 'lbl' }, 'Phương pháp'), selMethod),
        UI.h('span', { class: 'spacer' }),
        UI.badge(UI.srcType(st)))));

    const panel = UI.h('div');
    wrap.append(panel);

    function renderPanel() {
      UI.clearCharts();
      panel.innerHTML = '';

      /* ---- Chips chọn chỉ tiêu ---- */
      const chipRow = UI.h('div', { class: 'seg mb' },
        avail.map(o => UI.h('button', {
          class: 'seg-btn' + (st.forecast.ind === o.key ? ' active' : ''),
          onclick: () => { st.forecast.ind = o.key; renderPanel(); }
        }, o.label)));
      panel.append(UI.h('div', { class: 'flex mb', style: { alignItems: 'center' } }, chipRow));

      const card = UI.h('div', { class: 'card mb' });
      panel.append(card);

      const key = st.forecast.ind;
      const years = inds.map(i => i.year);
      const values = inds.map(i => getVal(i, key));
      const consecutive = (() => { let n = 0; for (let k = years.length - 1; k >= 0; k--) { if (values[k] === null) break; n++; } return n; })();

      if (consecutive < 5) {
        card.append(UI.emptyState('Cần tối thiểu 5 năm dữ liệu liên tục của chỉ tiêu này ở ngân hàng đã chọn để dự báo. Hiện có ' + consecutive + ' năm.', '🔒'));
        return;
      }

      let fc;
      if (st.forecast.method === 'ols') fc = BR.forecastOls(years, values, st.forecast.h);
      else fc = BR.forecastMa(years, values, st.forecast.h, 3);
      BR.clampForecast(fc, key);
      if (fc.error) { card.append(UI.emptyState(fc.error)); return; }

      const isPct = key !== 'assets';
      const fmt = v => isPct ? BR.fmtPct(v) : BR.fmtMoney(v);
      const histYears = fc.history.map(p => p[0]);
      const histVals = fc.history.map(p => p[1]);
      const fcYears = fc.forecast.map(f => f.year);
      const line = {
        name: 'Lịch sử', type: 'line', data: histVals, lineStyle: { width: 2.5, color: '#1a4d8f' },
        itemStyle: { color: '#1a4d8f' }, symbolSize: 7
      };
      // đường dự báo đứt, nối liền mạch từ điểm cuối lịch sử
      const fcLine = {
        name: 'Dự báo', type: 'line',
        data: [histVals[histVals.length - 1], ...fc.forecast.map(f => f.point)],
        lineStyle: { type: 'dashed', width: 2.5, color: '#d97b0d' }, itemStyle: { color: '#d97b0d' }, symbolSize: 7
      };
      const band = {
        name: 'Dải bất định 80%', type: 'line', data: [histVals[histVals.length - 1], ...fc.forecast.map(f => f.hi)],
        lineStyle: { opacity: 0 }, stack: 'band', symbol: 'none', silent: true,
        areaStyle: { color: '#d97b0d22' }
      };
      const band2 = {
        name: '_lo', type: 'line', data: [histVals[histVals.length - 1], ...fc.forecast.map(f => f.lo - f.hi)],
        lineStyle: { opacity: 0 }, stack: 'band', symbol: 'none', silent: true
      };
      const option = {
        grid: { left: 56, right: 20, top: 36, bottom: 28, containLabel: true },
        tooltip: { trigger: 'axis', valueFormatter: v => v === null || v === undefined ? 'N/A' : fmt(v) },
        legend: { top: 0, left: 'center', textStyle: { fontSize: 11 } },
        xAxis: { type: 'category', data: [...histYears, ...fcYears] },
        yAxis: { type: 'value', scale: true, axisLabel: { formatter: v => isPct ? (v * 100).toFixed(0) + '%' : BR.fmtNum(v) } },
        series: [line, fcLine, band, band2]
      };
      if (key === 'npl') option.series.push({
        type: 'line', data: [], markLine: {
          silent: true, symbol: 'none', data: [{ yAxis: BR.THRESHOLDS.riskNpl }],
          lineStyle: { color: '#c62828', type: 'dashed' }, label: { formatter: 'ngưỡng 3%', color: '#c62828' }
        }
      });
      if (key === 'car') option.series.push({
        type: 'line', data: [], markLine: {
          silent: true, symbol: 'none', data: [{ yAxis: BR.THRESHOLDS.riskCar }],
          lineStyle: { color: '#c62828', type: 'dashed' }, label: { formatter: '8%', color: '#c62828' }
        }
      });
      const csv = [['year', 'actual', 'forecast', 'lo', 'hi']].concat(
        histYears.map((y, i) => [y, histVals[i], '', '', ''])).concat(
          fc.forecast.map(f => [f.year, '', f.point, f.lo, f.hi]));

      // Chart trái + panel kết quả phải (chart cần mount vào DOM đã gắn trước khi init)
      const grid2 = UI.h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)', gap: '14px', alignItems: 'start' } });
      card.append(grid2);
      const chartBox = UI.h('div');
      grid2.append(chartBox);
      UI.chart(chartBox, {
        title: 'Dự báo ' + (IND_OPTS.find(o => o.key === key) || {}).label + ' — ' + bankCode,
        sub: (st.forecast.method === 'ols' ? 'Xu hướng tuyến tính' : 'Trung bình trượt 3 kỳ') + ' · dải bất định 80% mở rộng theo kỳ',
        option, csv, name: 'forecast_' + key + '_' + bankCode, height: 300
      });
      const resultCard = UI.h('div', { class: 'card', style: { margin: 0 } },
        UI.h('h3', { style: { margin: '0 0 8px' } }, 'Kết quả dự báo'));
      fc.forecast.forEach(f => {
        resultCard.append(UI.h('div', { class: 'flex', style: { justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #eef0f4' } },
          UI.h('span', { class: 'muted' }, String(f.year)),
          UI.h('b', {}, fmt(f.point))));
      });
      grid2.append(resultCard);

      if (fc.clamped) card.append(UI.h('div', { class: 'banner warn mt' }, '⚠ ', UI.h('span', {}, 'Xu hướng ngoại suy cho giá trị âm — đã chặn trong miền hợp lý (NPL ≥ 0; CAR ≥ 0).')));

      card.append(UI.h('h4', { style: { margin: '10px 0 6px' } }, 'Bảng dự báo chi tiết'));
      card.append(UI.table(['Năm', { label: 'Giá trị điểm', cls: 'num' }, { label: 'Cận dưới (80%)', cls: 'num' }, { label: 'Cận trên (80%)', cls: 'num' }],
        fc.forecast.map(f => ({
          cells: [f.year, { content: fmt(f.point), cls: 'num' }, { content: fmt(f.lo), cls: 'num' }, { content: fmt(f.hi), cls: 'num' }]
        }))));

      card.append(UI.h('div', { class: 'banner info mt' }, 'ℹ ',
        UI.h('span', {},
          UI.h('b', {}, 'Giả định: '), 'phương pháp ' + (fc.method === 'ols' ? 'OLS tuyến tính' : 'trung bình trượt ' + fc.window + ' kỳ') +
          '; số quan sát dùng: ' + fc.n + '; ' + (fc.r2 !== undefined && fc.r2 !== null ? 'R² = ' + fc.r2.toFixed(3) + '; ' : '') +
          'SE phần dư = ' + (fc.se ? BR.fmtNum(fc.se, 5) : 'n/a') + '. Dự báo ngoại suy xu hướng lịch sử; không tính đến cú sốc chính sách, sáp nhập hay thay đổi cấu trúc.')));
      if (!hasLdr || !hasNim) card.append(UI.h('p', { class: 'muted' }, 'Ghi chú: LDR cần trường total_deposits và NIM cần earning_assets — nếu thiếu, chỉ tiêu bị ẩn thay vì xấp xỉ không có cơ sở.'));
    }

    renderPanel();
  }

  APP.registerView('forecast', { title: 'Dự báo chỉ tiêu', render });
})();
