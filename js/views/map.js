/* ============================================================
   Module 8.7 — Banking System Map (Bản đồ hệ thống)
   PRD: X = Financial Stability Score (0–100), Y = Distress
   Probability, kích thước bong bóng = tổng tài sản (căn bậc hai
   theo diện tích), màu = nhóm rủi ro, tooltip chi tiết, click →
   8.2. Thiếu giá trị → liệt kê (AC-8.7-1). Không dùng màu làm
   kênh duy nhất — viền theo nhóm (khả năng tiếp cận).
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
      UI.h('h2', { style: { margin: 0, fontSize: '16px', color: 'var(--navy)' } }, 'Bản đồ hệ thống — kỳ ' + st.year),
      UI.badge(UI.srcType(st)),
      st.modelRun ? null : UI.h('span', { class: 'chip neutral', title: 'Chưa chấm điểm' }, 'Y đang dùng điểm nghiêm trọng thay vì xác suất'),
      UI.h('span', { class: 'spacer' }),
      UI.h('button', { class: 'btn small', onclick: () => APP.runModel() }, st.modelRun ? '↻ Chạy lại chấm điểm' : '⚡ Chạy chấm điểm')));

    if (!st.modelRun) {
      wrap.append(UI.h('div', { class: 'banner info' }, 'ℹ ', UI.h('span', {}, 'Trục Y theo PRD là Distress Probability. Vì chưa chấm điểm, bản đồ đang dùng điểm nghiêm trọng (0–100) làm trục Y. Chạy chấm điểm để có xác suất mô hình.')));
    }

    const inYear = st.indicators.filter(i => i.year === st.year);
    const fhs = BR.fhs(st.indicators, st.year, st.weights);
    const drawn = [], skipped = [];
    const maxAsset = Math.max(...inYear.map(i => i._total_assets || 0));
    const data = [];
    inYear.forEach(i => {
      const x = fhs.scores.get(i.bank_code);
      const y = st.modelRun && i.prob && i.prob.ensemble !== null ? i.prob.ensemble * 100 : (i.severity ? i.severity.score100 : null);
      const a = i._total_assets;
      if (x === null || x === undefined || y === null || !a) { skipped.push(i); return; }
      drawn.push(i);
      data.push({
        name: i.bank_code,
        value: [x, y],
        r: Math.sqrt(a / maxAsset) * 30 + 6,
        grp: i.group,
        assets: a,
        car: i.car, npl: i.npl, roa: i.roa,
        prob: i.prob ? i.prob.ensemble : null
      });
    });

    const card = UI.h('div', { class: 'card' });
    wrap.append(card);
    UI.chart(card, {
      title: 'Ổn định tài chính (X) vs. Rủi ro (Y) — kích thước = tổng tài sản (√ diện tích)',
      option: {
        grid: { left: 50, right: 30, top: 40, bottom: 60, containLabel: true },
        tooltip: {
          formatter: p => UI.h ? undefined : '',
          formatterFn: undefined,
          formatter: function (p) {
            const d = p.data;
            return '<b>' + d.name + '</b><br>FHS: ' + d.value[0].toFixed(0) + '/100<br>' +
              (st.modelRun ? 'Xác suất kiệt quệ: ' + BR.fmtPct(d.prob, 1) + '<br>' : 'Điểm nghiêm trọng: ' + d.value[1].toFixed(0) + '/100<br>') +
              'CAR: ' + BR.fmtPct(d.car) + '<br>NPL: ' + BR.fmtPct(d.npl) + '<br>ROA: ' + BR.fmtPct(d.roa) +
              '<br>Tổng tài sản: ' + BR.fmtMoney(d.assets) + '<br>Nhóm: ' + UI.groupLabel(d.grp);
          }
        },
        xAxis: { type: 'value', name: 'Financial Stability Score →', min: 0, max: 100, nameLocation: 'middle', nameGap: 26 },
        yAxis: { type: 'value', name: st.modelRun ? 'Distress Probability (%)' : 'Điểm nghiêm trọng (fallback)', max: 100 },
        series: [{
          type: 'scatter',
          data,
          emphasis: { focus: 'series' },
          itemStyle: d => ({
            color: UI.GROUP_COLOR[d.data.grp], opacity: 0.82,
            borderColor: UI.GROUP_COLOR[d.data.grp], borderWidth: d.data.grp === 'stable' ? 1 : 2.5,
            borderType: d.data.grp === 'critical' ? 'dotted' : 'solid'
          }),
          label: { show: data.length <= 30, formatter: p => p.data.name, position: 'top', fontSize: 9, color: '#5b6472' },
          // click → 8.2
          selectedMode: false
        }]
      },
      csv: [['bank', 'fhs', 'y_risk', 'total_assets', 'group']].concat(
        drawn.map(i => [i.bank_code, fhs.scores.get(i.bank_code), i.prob ? i.prob.ensemble : i.severity.score100 / 100, i._total_assets, i.group])),
      name: 'system_map', height: 480
    });
    // click điều hướng
    const inst = card.querySelector('[_echarts_instance_]') ? echarts.getInstanceByDom(card.querySelector('div[_echarts_instance_]')) : null;
    if (inst) inst.on('click', p => { if (p.data && p.data.name) APP.setHash({ bank: p.data.name }, 'bank'); });

    wrap.append(UI.h('p', { class: 'muted', style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' } },
      'Kích thước bong bóng = tổng tài sản · Màu nhóm: ',
      UI.h('span', { class: 'legend-dot', style: { background: UI.GROUP_COLOR.stable } }, ''),
      'Ổn định · ',
      UI.h('span', { class: 'legend-dot', style: { background: UI.GROUP_COLOR.watch } }, ''),
      'Theo dõi · ',
      UI.h('span', { class: 'legend-dot', style: { background: UI.GROUP_COLOR.high } }, ''),
      'Cảnh báo cao · ',
      UI.h('span', { class: 'legend-dot', style: { background: UI.GROUP_COLOR.critical } }, ''),
      'Nghiêm trọng · Bấm vào bong bóng để mở hồ sơ ngân hàng.'));

    if (skipped.length) {
      const skCard = UI.h('div', { class: 'card mt' },
        UI.h('h3', {}, 'Không đủ dữ liệu để hiển thị (' + skipped.length + ' ngân hàng)'));
      skCard.append(UI.table(['Ngân hàng', 'Lý do'],
        skipped.map(i => ({
          cells: [UI.h('b', {}, i.bank_code),
          i._total_assets === null ? 'Thiếu tổng tài sản' : i.severity === null ? 'Thiếu điểm rủi ro' : 'Thiếu FHS']
        }))));
      wrap.append(skCard);
    }
  }

  APP.registerView('map', { title: 'Bản đồ hệ thống', render });
})();
