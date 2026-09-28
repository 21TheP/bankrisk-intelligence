/* ============================================================
   Forecasting Engine (Dự báo chỉ tiêu)
   Xu hướng tuyến tính OLS hoặc trung bình trượt (FR-FCST-01),
   kỳ dự báo 1–5 năm, CHỌN ĐƯỢC NĂM GỐC dự báo, dải bất định mở
   rộng theo kỳ, bảng dự báo, panel giả định (R², n).
   Khoá nếu < 5 năm liên tục (FR-FCST-02). LDR/NIM ẩn nếu thiếu
   trường mở rộng. Chặn NPL/CAR ≥ 0 (AC-8.6-2).
   Lựa chọn của người dùng được lưu trong APP.state.forecast.
   Lưu ý ECharts: mọi series trên trục category phải null-pad đủ
   độ dài, nếu không đường bị lệch năm (theo index từ đầu trục).
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

    if (!st.forecast) st.forecast = { ind: 'car', h: 3, method: 'ols', baseYear: null };

    const banks = APP.banks();
    const bankCode = (st.bank && banks.some(b => b.bank_code === st.bank)) ? st.bank : banks[0].bank_code;
    st.bank = bankCode;
    const inds = st.indicators.filter(i => i.bank_code === bankCode).sort((a, b) => a.year - b.year);
    const hasLdr = inds.some(i => i.ldr !== null), hasNim = inds.some(i => i.nim !== null);
    const getVal = (ind, key) => key === 'assets' ? ind._total_assets : ind[key];
    const valByYear = new Map(inds.map(i => [i.year, getVal(i, st.forecast.ind)]));
    const avail = IND_OPTS.filter(o => o.key === 'assets' || o.key === 'car' || o.key === 'npl' || o.key === 'roa' || (o.key === 'ldr' ? hasLdr : o.key === 'nim' ? hasNim : false));
    if (!avail.some(o => o.key === st.forecast.ind)) st.forecast.ind = 'car';

    /* ---- Hàng điều khiển: ngân hàng · năm gốc · kỳ · phương pháp ---- */
    const selBank = UI.dropdown({
      options: banks.map(b => ({ value: b.bank_code, label: b.bank_code + ' — ' + b.bank_name })),
      value: bankCode,
      onChange: v => { st.bank = v; APP.setHash({ bank: v }); APP.render(); }
    });
    const selBase = UI.dropdown({
      options: inds.map(i => ({ value: String(i.year), label: 'từ ' + i.year })),
      value: st.forecast.baseYear,
      onChange: v => { st.forecast.baseYear = +v; renderPanel(); }
    });
    const selH = UI.dropdown({
      options: [1, 2, 3, 4, 5].map(h => ({ value: String(h), label: h + ' năm' })),
      value: st.forecast.h,
      onChange: v => { st.forecast.h = +v; renderPanel(); }
    });
    const selMethod = UI.dropdown({
      options: [{ value: 'ols', label: 'Xu hướng tuyến tính (OLS)' }, { value: 'ma', label: 'Trung bình trượt 3 kỳ' }],
      value: st.forecast.method,
      onChange: v => { st.forecast.method = v; renderPanel(); }
    });
    wrap.append(UI.h('div', { class: 'card mb' },
      UI.h('div', { class: 'flex', style: { flexWrap: 'wrap', gap: '10px' } },
        UI.h('div', {}, UI.h('label', { class: 'lbl' }, 'Ngân hàng'), selBank),
        UI.h('div', {}, UI.h('label', { class: 'lbl' }, 'Dự báo từ năm'), selBase),
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
      // Năm gốc phải có giá trị của chỉ tiêu hiện tại; nếu không thì rơi về năm có dữ liệu gần nhất
      const baseCandidates = inds.filter(i => getVal(i, key) !== null).map(i => i.year);
      if (!baseCandidates.length) { card.append(UI.emptyState('Chỉ tiêu này không có dữ liệu ở ngân hàng đã chọn.')); return; }
      if (!baseCandidates.includes(st.forecast.baseYear)) st.forecast.baseYear = baseCandidates[baseCandidates.length - 1];
      const baseYear = st.forecast.baseYear;
      // Đồng bộ dropdown năm gốc với state (năm gốc phụ thuộc chỉ tiêu đang chọn)
      selBase.querySelectorAll('.dd-item').forEach(i =>
        i.classList.toggle('active', i.dataset.value === String(baseYear)));
      const baseLabel = selBase.querySelector('.dd-label');
      if (baseLabel && baseLabel.textContent !== 'từ ' + baseYear) baseLabel.textContent = 'từ ' + baseYear;

      // Fit chỉ trên dữ liệu ≤ năm gốc
      const fit = inds.filter(i => i.year <= baseYear);
      const years = fit.map(i => i.year);
      const values = fit.map(i => getVal(i, key));
      const consecutive = (() => { let n = 0; for (let k = values.length - 1; k >= 0; k--) { if (values[k] === null) break; n++; } return n; })();

      if (consecutive < 5) {
        card.append(UI.emptyState('Cần tối thiểu 5 năm dữ liệu liên tục tính đến năm gốc ' + baseYear + ' để dự báo. Hiện có ' + consecutive + ' năm.', '🔒'));
        return;
      }

      let fc;
      if (st.forecast.method === 'ols') fc = BR.forecastOls(years, values, st.forecast.h);
      else fc = BR.forecastMa(years, values, st.forecast.h, 3);
      BR.clampForecast(fc, key);
      if (fc.error) { card.append(UI.emptyState(fc.error)); return; }

      const isPct = key !== 'assets';
      const fmt = v => isPct ? BR.fmtPct(v) : BR.fmtMoney(v);

      /* ---- Căn trục: category axis dựng từ TOÀN BỘ năm lịch sử + năm dự báo;
              mọi series phải null-pad đủ độ dài, nếu không ECharts căn theo index
              và vẽ lệch năm. ---- */
      const allYears = inds.map(i => i.year);
      const histData = allYears.map(y => getVal(inds.find(i => i.year === y), key));
      const fcYears = fc.forecast.map(f => f.year);
      // Trục gộp: năm dự báo trùng năm lịch sử (dự báo giữa chuỗi) nằm CHUNG cột
      const extraFcYears = fcYears.filter(y => !allYears.includes(y));
      const cats = [...allYears, ...extraFcYears];
      const anchorYear = years[years.length - 1 - values.slice().reverse().findIndex(v => v !== null)];
      const anchorIdx = cats.indexOf(anchorYear);
      const anchorVal = getVal(inds.find(i => i.year === anchorYear), key);
      const pad = n => Array.from({ length: n }, () => null);
      // Mỗi điểm dự báo đặt đúng cột năm của nó (nếu trùng năm lịch sử thì chồng cột đó)
      const place = fill => { const d = pad(cats.length); d[anchorIdx] = anchorVal; fc.forecast.forEach((f, i) => { d[cats.indexOf(f.year)] = fill(f, i); }); return d; };

      const line = {
        name: 'Lịch sử', type: 'line', data: histData, lineStyle: { width: 2.5, color: '#1a4d8f' },
        itemStyle: { color: '#1a4d8f' }, symbolSize: 7,
        connectNulls: false
      };
      // Thực tế SAU năm gốc (nếu có) — để đối chiếu dự báo với thực tế
      const postActual = allYears.map((y, i) => y > baseYear ? histData[i] : null);
      const hasPost = postActual.some(v => v !== null);
      const postSeries = {
        name: 'Thực tế sau năm gốc', type: 'line', data: postActual,
        lineStyle: { width: 2, color: '#1e7d3c', type: 'dotted' }, itemStyle: { color: '#1e7d3c' }, symbolSize: 6
      };
      // Đường dự báo đứt, nối liền mạch từ điểm gốc — null-pad trước anchor
      const fcLine = {
        name: 'Dự báo', type: 'line',
        data: place(f => f.point),
        lineStyle: { type: 'dashed', width: 2.5, color: '#d97b0d' }, itemStyle: { color: '#d97b0d' }, symbolSize: 7
      };
      const band = {
        name: 'Dải bất định 80%', type: 'line', data: place(f => f.hi),
        lineStyle: { opacity: 0 }, stack: 'band', symbol: 'none', silent: true,
        areaStyle: { color: '#d97b0d22' }
      };
      const band2 = {
        name: '_lo', type: 'line', data: place(f => f.lo - f.hi),
        lineStyle: { opacity: 0 }, stack: 'band', symbol: 'none', silent: true
      };
      const option = {
        grid: { left: 56, right: 20, top: 36, bottom: 28, containLabel: true },
        tooltip: { trigger: 'axis', valueFormatter: v => v === null || v === undefined ? 'N/A' : fmt(v) },
        legend: { top: 0, left: 'center', textStyle: { fontSize: 11 } },
        xAxis: { type: 'category', data: cats },
        yAxis: { type: 'value', scale: true, axisLabel: { formatter: v => isPct ? (v * 100).toFixed(0) + '%' : BR.fmtNum(v) } },
        series: [line, ...(hasPost ? [postSeries] : []), fcLine, band, band2]
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
        allYears.map((y, i) => [y, histData[i], '', '', ''])).concat(
          fc.forecast.map(f => [f.year, '', f.point, f.lo, f.hi]));

      // Chart trái + panel kết quả phải
      const grid2 = UI.h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)', gap: '14px', alignItems: 'start' } });
      card.append(grid2);
      const chartBox = UI.h('div');
      grid2.append(chartBox);
      UI.chart(chartBox, {
        title: 'Dự báo ' + (IND_OPTS.find(o => o.key === key) || {}).label + ' — ' + bankCode + ' (gốc ' + baseYear + ')',
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
          '; fit trên dữ liệu đến năm gốc ' + baseYear + '; số quan sát dùng: ' + fc.n + '; ' + (fc.r2 !== undefined && fc.r2 !== null ? 'R² = ' + fc.r2.toFixed(3) + '; ' : '') +
          'SE phần dư = ' + (fc.se ? BR.fmtNum(fc.se, 5) : 'n/a') + '. Dự báo ngoại suy xu hướng lịch sử; không tính đến cú sốc chính sách, sáp nhập hay thay đổi cấu trúc.')));
      if (!hasLdr || !hasNim) card.append(UI.h('p', { class: 'muted' }, 'Ghi chú: LDR cần trường total_deposits và NIM cần earning_assets — nếu thiếu, chỉ tiêu bị ẩn thay vì xấp xỉ không có cơ sở.'));
    }

    renderPanel();
  }

  APP.registerView('forecast', { title: 'Dự báo chỉ tiêu', render });
})();
