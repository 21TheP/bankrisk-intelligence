/* ============================================================
   Module 8.1 — System Dashboard (Tổng quan hệ thống)
   PRD: SRI, đếm 4 nhóm, xu hướng CAR/NPL/ROA (trung vị + dải
   25–75%), phân phối chỉ tiêu, top 5 cảnh báo. Trung vị thay
   trung bình (mẫu nhỏ, phân phối lệch — PRD 8.1).
   ============================================================ */
(function () {
  'use strict';
  const BR = window.BRCORE, UI = window.BRUI, APP = window.APP;

  function yearlyStats(inds, key) {
    const byYear = {};
    inds.forEach(i => {
      if (i[key] === null || i[key] === undefined) return;
      (byYear[i.year] = byYear[i.year] || []).push(i[key]);
    });
    const out = {};
    for (const [y, v] of Object.entries(byYear)) {
      out[y] = { p25: BR.quantile(v, 0.25), p50: BR.median(v), p75: BR.quantile(v, 0.75), n: v.length };
    }
    return out;
  }

  APP.registerView('overview', {
    title: 'Tổng quan hệ thống',
    render(root) {
      const st = APP.state;
      const year = st.year;
      const inYear = st.indicators.filter(i => i.year === year && i._total_assets !== null);
      const sri = BR.sri(st.indicators, year);
      const wrap = UI.h('div');
      root.append(wrap);

      if (!inYear.length) {
        wrap.append(UI.emptyState('Chưa có dữ liệu cho năm đã chọn. Chọn năm khác hoặc tải bộ dữ liệu demo.'));
        return;
      }

      // 1) SRI + 2) số ngân hàng + 3) đếm 4 nhóm
      const groups = { stable: 0, watch: 0, high: 0, critical: 0 };
      inYear.forEach(i => { if (i.group) groups[i.group]++; });
      const sriInfo = () => {
        if (!sri) return UI.h('div');
        const c = sri.components;
        return UI.h('div', { class: 'how-panel' },
          UI.h('p', {}, UI.h('code', {}, 'SRI = 0,40 × tỷ trọng tài sản nhóm Cảnh báo cao + Nghiêm trọng + 0,30 × tỷ lệ ngân hàng RISK=1 + 0,20 × chênh NPL trung vị vs 3% (chuẩn hoá) + 0,10 × chênh CAR trung vị vs 8% (đảo dấu) → thang 0–100')),
          UI.h('table', {},
            UI.h('tr', {}, UI.h('td', {}, 'Tỷ trọng tài sản nhóm xấu'), UI.h('td', {}, BR.fmtPct(c.assetShareBad, 1))),
            UI.h('tr', {}, UI.h('td', {}, 'Tỷ lệ RISK = 1'), UI.h('td', {}, BR.fmtPct(c.riskShare, 1))),
            UI.h('tr', {}, UI.h('td', {}, 'NPL trung vị'), UI.h('td', {}, BR.fmtPct(c.medianNpl))),
            UI.h('tr', {}, UI.h('td', {}, 'CAR trung vị'), UI.h('td', {}, BR.fmtPct(c.medianCar))),
            UI.h('tr', {}, UI.h('td', {}, 'Số ngân hàng tham gia'), UI.h('td', {}, String(sri.nBanks) + (sri.lowReliability ? ' ⚠ độ tin cậy thấp (<5)' : ''))),
            UI.h('tr', {}, UI.h('td', {}, 'Nguồn'), UI.h('td', {}, 'Công thức [GIẢ ĐỊNH HỌC THUẬT – PRD 9.3]; số liệu ' + (st.source === 'demo' ? '[DỮ LIỆU DEMO]' : 'từ dữ liệu bạn upload')))));
      };
      const gSum = groups.stable + groups.watch + groups.high + groups.critical;
      const kpis = UI.h('div', { class: 'kpi-row' },
        UI.metric({
          label: 'Systemic Risk Index (SRI)', badge: UI.srcType(st), badgeType: UI.srcType(st),
          value: sri ? sri.value + '<small>/100</small>' : 'N/A',
          note: sri && sri.lowReliability ? '⚠ Độ tin cậy thấp (<5 ngân hàng)' : 'Giả định học thuật — PRD 9.3',
          info: sriInfo
        }),
        UI.metric({ label: 'Số ngân hàng trong mẫu', badge: UI.srcType(st), badgeType: UI.srcType(st), value: String(inYear.length) }),
        UI.metric({ label: 'Ổn định', badge: UI.srcType(st), badgeType: UI.srcType(st), value: String(groups.stable), note: gSum === inYear.length ? null : '⚠ tổng nhóm không khớp' }),
        UI.metric({ label: 'Theo dõi', badge: UI.srcType(st), badgeType: UI.srcType(st), value: String(groups.watch) }),
        UI.metric({ label: 'Cảnh báo cao', badge: UI.srcType(st), badgeType: UI.srcType(st), value: String(groups.high) }),
        UI.metric({ label: 'Nghiêm trọng', badge: UI.srcType(st), badgeType: UI.srcType(st), value: String(groups.critical) })
      );
      wrap.append(kpis);

      // 4–6) Xu hướng trung vị + dải phân vị (CAR / NPL / ROA)
      const years = APP.years();
      const trendGrid = UI.h('div', { class: 'grid c3' });
      wrap.append(trendGrid);
      mkTrendInto(trendGrid, 'car', 'Xu hướng CAR');
      mkTrendInto(trendGrid, 'npl', 'Xu hướng NPL');
      mkTrendInto(trendGrid, 'roa', 'Xu hướng ROA');

      function mkTrendInto(parent, key, title) {
        const stats = yearlyStats(st.indicators, key);
        const series = UI.medianBandSeries(years, stats);
        const option = {
          grid: { left: 46, right: 12, top: 28, bottom: 26, containLabel: true },
          tooltip: Object.assign({}, UI.tooltipAxis, { valueFormatter: v => v === null || v === undefined ? 'N/A' : BR.fmtPct(v) }),
          legend: { top: 0, left: 'center', data: ['Trung vị'], itemWidth: 14, itemHeight: 8, textStyle: { fontSize: 11 } },
          xAxis: { type: 'category', data: years },
          yAxis: { type: 'value', axisLabel: { formatter: v => (v * 100).toFixed(0) + '%' } },
          series
        };
        if (key === 'npl') option.series.push({
          name: 'Ngưỡng 3%', type: 'line', data: [], markLine: {
            silent: true, symbol: 'none', data: [{ yAxis: BR.THRESHOLDS.riskNpl }],
            lineStyle: { color: '#c62828', type: 'dashed', width: 2 }, label: { formatter: '3%', color: '#c62828' }
          }
        });
        const csv = [['year', 'p25', 'median', 'p75']].concat(years.map(y => [y,
          stats[y] ? stats[y].p25.toFixed(5) : '', stats[y] ? stats[y].p50.toFixed(5) : '', stats[y] ? stats[y].p75.toFixed(5) : '']));
        UI.chart(parent, { title, sub: 'Trung vị + dải phân vị 25–75%' + (key === 'npl' ? ' — ngưỡng 3% nét đứt đỏ' : ''), option, csv, name: 'trend_' + key });
      }

      // 7) Phân phối chỉ tiêu + 8) Top cảnh báo
      const bottom = UI.h('div', { class: 'grid c2 mt' });
      wrap.append(bottom);
      const distCard = UI.h('div', { class: 'card' });
      const selIndicator = UI.h('select', { class: 'sel', onchange: () => renderDist() },
        ['npl', 'car', 'roa', 'cir', 'dprr', 'niir'].map(k => UI.h('option', { value: k }, BR.INDICATORS[k].label + ' — ' + BR.INDICATORS[k].vi)));
      distCard.append(UI.h('div', { class: 'flex mb' }, UI.h('h3', { style: { margin: 0 } }, 'Phân phối chỉ tiêu'), selIndicator, UI.badge(UI.srcType(st))));
      const distBox = UI.h('div');
      distCard.append(distBox);
      bottom.append(distCard);

      function renderDist() {
        const key = selIndicator.value;
        distBox.innerHTML = '';
        const vals = inYear.map(i => i[key]).filter(Number.isFinite);
        if (vals.length < 3) { distBox.append(UI.emptyState('Chưa đủ dữ liệu để vẽ phân phối cho kỳ này.')); return; }
        const min = Math.min(...vals), max = Math.max(...vals);
        const bins = Math.min(16, Math.max(6, Math.round(Math.sqrt(vals.length))));
        const w = (max - min) / bins || 1;
        const counts = new Array(bins).fill(0);
        vals.forEach(v => counts[Math.min(bins - 1, Math.floor((v - min) / w))]++);
        const cats = counts.map((_, i) => BR.fmtPct(min + i * w, 1));
        const option = {
          grid: { left: 46, right: 12, top: 28, bottom: 40, containLabel: true },
          tooltip: {},
          xAxis: { type: 'category', data: cats, axisLabel: { rotate: 40, fontSize: 10 } },
          yAxis: { type: 'value', name: 'số ngân hàng' },
          series: [{ type: 'bar', data: counts, itemStyle: { color: '#2264c0' }, barCategoryGap: '18%' }]
        };
        if (BR.INDICATORS[key].threshold) option.series.push({
          type: 'line', data: [], markLine: {
            silent: true, symbol: 'none',
            data: [{ xAxis: Math.min(bins - 1, Math.floor((BR.INDICATORS[key].threshold - min) / w)) }],
            lineStyle: { color: '#c62828', type: 'dashed' }, label: { formatter: 'ngưỡng', color: '#c62828' }
          }
        });
        const csv = [['bin_start', 'count']].concat(counts.map((c, i) => [(min + i * w).toFixed(5), c]));
        UI.chart(distBox, { title: 'Histogram ' + BR.INDICATORS[key].label + ' năm ' + year, sub: 'n = ' + vals.length, option, csv, name: 'dist_' + key, height: 250 });
      }
      renderDist();

      // 8) Top 5 cảnh báo
      const alerts = inYear.filter(i => i.group === 'critical' || i.group === 'high')
        .sort((a, b) => b.severity.score100 - a.severity.score100).slice(0, 5);
      const alertCard = UI.h('div', { class: 'card' },
        UI.h('div', { class: 'flex mb' }, UI.h('h3', { style: { margin: 0 } }, 'Cảnh báo mới nhất (Top 5)'), UI.badge(UI.srcType(st)),
          UI.h('span', { class: 'spacer' }),
          UI.h('button', { class: 'btn small', onclick: () => APP.setHash({}, 'alerts') }, 'Xem tất cả →')));
      if (!alerts.length) alertCard.append(UI.emptyState('Không có ngân hàng nào vượt ngưỡng cảnh báo trong kỳ này.'));
      else alertCard.append(UI.table(['Ngân hàng', 'Mức độ', 'Điểm /100', 'Tín hiệu chính'],
        alerts.map(a => ({
          cells: [
            { content: UI.h('b', {}, a.bank_code), cls: '' },
            { content: UI.groupChip(a.group) },
            { content: String(a.severity.score100), cls: 'num' },
            { content: a.reasons.slice(0, 2).map(r => r.rule + ' (' + (r.var === 'CAR' || r.var === 'NPL' ? BR.fmtPct(r.value) : BR.fmtNum(r.value, 1)) + ')').join('; ') }
          ]
        }))));
      bottom.append(alertCard);

      // Ghi chú phương pháp
      wrap.append(UI.h('p', { class: 'muted mt' },
        'Ghi chú phương pháp: thống kê hệ thống dùng trung vị (không phải trung bình) vì mẫu nhỏ ≈23 ngân hàng và phân phối lệch. Ngân hàng có chỉ tiêu null không được tính vào trung vị (F-04). Bốn nhóm phân loại luôn cộng đúng bằng số ngân hàng trong mẫu (AC-8.1-1).'));
    }
  });
})();
