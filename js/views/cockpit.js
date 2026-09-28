/* ============================================================
   Supervisory Cockpit (Bảng điều khiển giám sát)
   Hero KPI: SRI + đếm nhóm (Δ so với kỳ trước), xu hướng hệ
   thống, tổng hợp nhóm + tỷ trọng tài sản, top yếu tố dẫn dắt
   rủi ro, dòng thời gian sự kiện, cảnh báo ưu tiên cao.
   Xuất tóm tắt giám sát (FR-COCKPIT-01).
   ============================================================ */
(function () {
  'use strict';
  const BR = window.BRCORE, UI = window.BRUI, APP = window.APP;

  function render(root) {
    const st = APP.state;
    const wrap = UI.h('div');
    root.append(wrap);
    if (!st.indicators.length) { wrap.append(UI.emptyState('Chưa có dữ liệu.')); return; }

    wrap.append(UI.h('div', { class: 'flex mb' },
      UI.h('h2', { style: { margin: 0, fontSize: '17px', color: 'var(--navy)' } }, 'Bảng điều khiển giám sát — kỳ ' + st.year),
      UI.badge(UI.srcType(st)),
      UI.h('span', { class: 'spacer' }),
      UI.h('button', { class: 'btn small', onclick: () => APP.exportReport('pdf') }, '🖨 Xuất tóm tắt giám sát')));

    const inYear = st.indicators.filter(i => i.year === st.year);
    const sri = BR.sri(st.indicators, st.year);
    const years = APP.years();
    const idx = years.indexOf(st.year);
    const prevYear = idx > 0 ? years[idx - 1] : null;
    const sriSeries = years.map(y => { const s = BR.sri(st.indicators, y); return s ? s.value : null; });

    const groups = { stable: 0, watch: 0, high: 0, critical: 0 };
    inYear.forEach(i => { if (i.group) groups[i.group]++; });
    const prevGroups = { stable: 0, watch: 0, high: 0, critical: 0 };
    if (prevYear) st.indicators.filter(i => i.year === prevYear).forEach(i => { if (i.group) prevGroups[i.group]++; });
    const deltaText = g => {
      if (!prevYear) return null;
      const d = groups[g] - prevGroups[g];
      return UI.h('span', { class: 'muted', style: { fontSize: '12px', marginTop: '2px' } }, d === 0 ? '— không đổi' : (d > 0 ? '▲ +' + d : '▼ ' + d) + ' vs ' + prevYear);
    };

    /* 1) Hero KPI row */
    const sriLevel = !sri ? null : sri.value >= 60 ? 'critical' : sri.value >= 40 ? 'high' : sri.value >= 25 ? 'watch' : 'stable';
    const sriLabel = !sri ? 'N/A' : sri.value >= 60 ? 'RỦI RO CAO' : sri.value >= 40 ? 'CẢNH BÁO' : sri.value >= 25 ? 'THEO DÕI' : 'BÌNH THƯỜNG';
    const sriDelta = idx > 0 && sriSeries[idx - 1] !== null && sriSeries[idx - 1] !== undefined
      ? (() => { const d = sri.value - sriSeries[idx - 1]; return UI.h('span', { class: 'muted', style: { fontSize: '12px', marginTop: '2px' } }, (d >= 0 ? '▲ +' : '▼ ') + d.toFixed(1) + ' vs ' + years[idx - 1]); })()
      : null;
    wrap.append(UI.h('div', { class: 'kpi-row' },
      UI.metric({
        label: 'Systemic Risk (SRI)', value: sri ? sri.value + '<small>/100</small>' : 'N/A',
        extra: sriLevel ? UI.h('span', { class: 'chip ' + sriLevel }, sriLabel) : null, info2: sriDelta
      }),
      UI.metric({ label: 'Cần theo dõi', value: String(groups.watch), extra: UI.h('span', { class: 'chip watch' }, 'Theo dõi'), info2: deltaText('watch') }),
      UI.metric({ label: 'Rủi ro cao', value: String(groups.high), extra: UI.h('span', { class: 'chip high' }, 'Cảnh báo cao'), info2: deltaText('high') }),
      UI.metric({ label: 'Nghiêm trọng', value: String(groups.critical), extra: UI.h('span', { class: 'chip critical' }, 'Nghiêm trọng'), info2: deltaText('critical') })));

    /* 2) Xu hướng hệ thống + tổng hợp nhóm */
    const trendsCard = UI.h('div', { class: 'card' }, UI.h('h3', {}, 'Xu hướng hệ thống (trung vị)'));
    const yearsAll = years;
    const medByKey = k => yearsAll.map(y => BR.median(st.indicators.filter(i => i.year === y).map(i => i[k])));
    const riskShare = yearsAll.map(y => {
      const list = st.indicators.filter(i => i.year === y && i.risk_label !== null);
      return list.length ? list.filter(i => i.risk_label === 1).length / list.length : null;
    });
    UI.chart(trendsCard, {
      title: 'CAR / NPL / ROA trung vị + tỷ lệ RISK=1',
      option: {
        grid: { left: 46, right: 56, top: 36, bottom: 26, containLabel: true },
        tooltip: { trigger: 'axis' },
        legend: { top: 0, left: 'center', textStyle: { fontSize: 11 } },
        xAxis: { type: 'category', data: yearsAll },
        yAxis: [{ type: 'value', axisLabel: { formatter: v => (v * 100).toFixed(0) + '%' } },
        { type: 'value', name: 'RISK=1', max: 1, axisLabel: { formatter: v => (v * 100).toFixed(0) + '%' }, splitLine: { show: false } }],
        series: [
          { name: 'CAR', type: 'line', data: medByKey('car'), lineStyle: { width: 2, color: UI.PALETTE[0] }, itemStyle: { color: UI.PALETTE[0] } },
          { name: 'NPL', type: 'line', data: medByKey('npl'), lineStyle: { width: 2, color: '#c62828' }, itemStyle: { color: '#c62828' } },
          { name: 'ROA', type: 'line', data: medByKey('roa'), lineStyle: { width: 2, color: UI.PALETTE[1] }, itemStyle: { color: UI.PALETTE[1] } },
          { name: 'Tỷ lệ RISK=1', type: 'line', yAxisIndex: 1, data: riskShare, lineStyle: { width: 2, type: 'dashed', color: '#8a6d00' }, itemStyle: { color: '#8a6d00' } }
        ]
      },
      csv: [['year', 'median_car', 'median_npl', 'median_roa', 'risk1_share']].concat(
        yearsAll.map((y, i) => [y, medByKey('car')[i], medByKey('npl')[i], medByKey('roa')[i], riskShare[i]])),
      name: 'system_trends', height: 280
    });

    /* Tổng hợp nhóm + tỷ trọng tài sản */
    const assetByGroup = { stable: 0, watch: 0, high: 0, critical: 0 };
    let totalAsset = 0;
    inYear.forEach(i => { const a = i._total_assets || 0; assetByGroup[i.group || 'stable'] += a; totalAsset += a; });
    const shares = {}; for (const g of Object.keys(assetByGroup)) shares[g] = totalAsset ? assetByGroup[g] / totalAsset : 0;
    const grpCard = UI.h('div', { class: 'card' }, UI.h('h3', {}, 'Tổng hợp theo nhóm rủi ro'));
    const total = Object.values(groups).reduce((s, x) => s + x, 0);
    grpCard.append(UI.table(['Nhóm', { label: 'Số ngân hàng', cls: 'num' }, { label: 'Tỷ trọng tài sản', cls: 'num' }],
      Object.keys(groups).map(g => ({
        cells: [UI.groupChip(g), { content: groups[g] + ' (' + (total ? (groups[g] / total * 100).toFixed(0) : 0) + '%)', cls: 'num' },
        { content: BR.fmtPct(shares[g], 1), cls: 'num' }]
      }))));
    grpCard.append(UI.h('p', { class: 'muted' }, 'Tỷ trọng tài sản phản ánh mức độ tập trung rủi ro — nhóm xấu chiếm nhiều tài sản thì ưu tiên giám sát cao hơn.'));

    wrap.append(UI.h('div', { class: 'grid c2 mt' }, trendsCard, grpCard));

    /* 3) Top yếu tố dẫn dắt rủi ro + dòng thời gian sự kiện */
    const ruleFreq = {};
    inYear.forEach(i => (i.reasons || []).forEach(r => { const k = r.rule; ruleFreq[k] = (ruleFreq[k] || 0) + 1; }));
    const ruleRows = Object.entries(ruleFreq).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const driverCard = UI.h('div', { class: 'card' }, UI.h('h3', {}, 'Top Risk Drivers (tần suất quy tắc kích hoạt)'));
    if (!ruleRows.length) driverCard.append(UI.emptyState('Không có quy tắc nào được kích hoạt trong kỳ này.', '✅'));
    else UI.chart(driverCard, {
      option: {
        grid: { left: 60, right: 40, top: 10, bottom: 24, containLabel: true },
        tooltip: {},
        xAxis: { type: 'value', minInterval: 1 },
        yAxis: { type: 'category', data: ruleRows.map(r => r[0]).reverse(), axisLabel: { fontSize: 10 } },
        series: [{ type: 'bar', data: ruleRows.map(r => r[1]).reverse(), itemStyle: { color: '#b45309' }, label: { show: true, position: 'right', fontSize: 10 } }]
      },
      csv: [['rule', 'count']].concat(ruleRows),
      name: 'risk_drivers', height: 230
    });

    /* Dòng thời gian sự kiện thay đổi nhóm */
    const events = [];
    const byBank = new Map();
    st.indicators.forEach(i => {
      if (!byBank.has(i.bank_code)) byBank.set(i.bank_code, []);
      byBank.get(i.bank_code).push(i);
    });
    byBank.forEach(arr => arr.sort((a, b) => a.year - b.year));
    byBank.forEach((arr, code) => {
      for (let k = 1; k < arr.length; k++) {
        if (arr[k].group !== arr[k - 1].group) {
          events.push({ bank: code, year: arr[k].year, from: arr[k - 1].group, to: arr[k].group });
        }
      }
    });
    events.sort((a, b) => b.year - a.year || a.bank.localeCompare(b.bank));
    const tlCard = UI.h('div', { class: 'card' }, UI.h('h3', {}, 'Risk Event Timeline (thay đổi nhóm)'));
    if (!events.length) tlCard.append(UI.emptyState('Không có sự kiện thay đổi nhóm rủi ro nào trong dữ liệu.'));
    else tlCard.append(UI.h('ul', { class: 'timeline', style: { maxHeight: '280px', overflow: 'auto' } },
      events.slice(0, 30).map(e => UI.h('li', {},
        UI.h('span', { class: 't' }, e.bank + ' · ' + e.year),
        UI.groupChip(e.from), UI.h('span', {}, '→'), UI.groupChip(e.to)))));
    wrap.append(UI.h('div', { class: 'grid c2 mt' }, driverCard, tlCard));

    /* 4) Cảnh báo ưu tiên cao */
    const top = inYear.filter(i => i.group === 'critical' || i.group === 'high')
      .sort((a, b) => b.severity.score100 - a.severity.score100);
    const topCard = UI.h('div', { class: 'card mt' }, UI.h('div', { class: 'flex mb' },
      UI.h('h3', { style: { margin: 0 } }, 'Cảnh báo ưu tiên cao'),
      UI.h('span', { class: 'spacer' }),
      UI.h('button', { class: 'btn small', onclick: () => APP.setHash({}, 'alerts') }, 'Mở trung tâm cảnh báo →')));
    if (!top.length) topCard.append(UI.emptyState('Không có cảnh báo ưu tiên cao trong kỳ này.', '✅'));
    else topCard.append(UI.table(['Hạng', 'Ngân hàng', 'Mức', { label: 'Điểm /100', cls: 'num' }, 'Tín hiệu chính'],
      top.map((i, idx2) => ({
        cells: [String(idx2 + 1), UI.h('b', {}, i.bank_code), UI.groupChip(i.group),
        { content: String(i.severity.score100), cls: 'num' },
        (i.reasons || []).slice(0, 3).map(r => UI.h('span', { class: 'chip neutral', style: { margin: '1px 4px 1px 0', fontSize: '11px' } }, r.rule))]
      }))));
    wrap.append(topCard);
  }

  APP.registerView('cockpit', { title: 'Bảng điều khiển giám sát', render });
})();
