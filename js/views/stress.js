/* ============================================================
   Module 8.5 — Stress Test (Kiểm định sức chịu đựng)
   PRD: 6 tham số kịch bản, cơ chế truyền dẫn tuyến tính minh bạch
   (FR-STRESS-01 — toàn bộ hệ số [GIẢ ĐỊNH HỌC THUẬT]), bảng Cơ sở
   vs Căng thẳng, danh sách ngân hàng vượt ngưỡng, so sánh tối đa
   3 kịch bản đã lưu. Mặc định Δ=0 → đúng giá trị cơ sở (AC-8.5-1).
   ============================================================ */
(function () {
  'use strict';
  const BR = window.BRCORE, UI = window.BRUI, APP = window.APP;

  const PARAMS = [
    { key: 'dGdp', label: 'Δ Tăng trưởng GDP', min: -5, max: 10, step: 0.5, unit: ' điểm %' },
    { key: 'dInfl', label: 'Δ Lạm phát', min: 0, max: 25, step: 0.5, unit: ' điểm %' },
    { key: 'dRate', label: 'Δ Lãi suất', min: -3, max: 8, step: 0.5, unit: ' điểm %' },
    { key: 'dNpl', label: 'Mức tăng NPL', min: 0, max: 10, step: 0.5, unit: ' điểm %' },
    { key: 'dCredit', label: 'Δ Tăng trưởng tín dụng', min: -10, max: 30, step: 1, unit: ' %' },
    { key: 'dFx', label: 'Δ Tỷ giá', min: -10, max: 25, step: 1, unit: ' %' }
  ];
  const PRESETS = {
    base: { name: 'Cơ sở (Δ=0)', params: { dGdp: 0, dInfl: 0, dRate: 0, dNpl: 0, dCredit: 0, dFx: 0 } },
    mild: { name: 'Xấu đi vừa phải', params: { dGdp: -2, dInfl: 4, dRate: 2, dNpl: 2, dCredit: 5, dFx: 5 } },
    crisis: { name: 'Khủng hoảng', params: { dGdp: -5, dInfl: 10, dRate: 5, dNpl: 5, dCredit: 15, dFx: 15 } }
  };

  function render(root) {
    const st = APP.state;
    const wrap = UI.h('div');
    root.append(wrap);
    if (!st.indicators.length) { wrap.append(UI.emptyState('Chưa có dữ liệu.')); return; }

    const P = st.stress.params = Object.assign({ dGdp: 0, dInfl: 0, dRate: 0, dNpl: 0, dCredit: 0, dFx: 0 }, st.stress.params);
    const A = st.stress.assumptions = Object.assign({}, BR.STRESS_ASSUMPTIONS_DEFAULT, st.stress.assumptions);

    /* ---- Tham số & giả định ---- */
    const paramCard = UI.h('div', { class: 'card mb' }, UI.h('div', { class: 'flex mb' },
      UI.h('h3', { style: { margin: 0 } }, 'Tham số kịch bản — kỳ ' + st.year), UI.badge(UI.srcType(st)),
      UI.h('span', { class: 'spacer' }),
      ...Object.entries(PRESETS).map(([k, p]) => UI.h('button', { class: 'btn small' + (k === 'base' ? ' primary' : ''), onclick: () => { Object.assign(P, p.params); APP.render(); } }, p.name))));
    PARAMS.forEach(pd => {
      const val = UI.h('span', { class: 'val' }, (P[pd.key] > 0 ? '+' : '') + P[pd.key] + pd.unit);
      const s = UI.h('input', { type: 'range', min: pd.min, max: pd.max, step: pd.step, value: P[pd.key] });
      s.addEventListener('input', () => { P[pd.key] = +s.value; val.textContent = (P[pd.key] > 0 ? '+' : '') + P[pd.key] + pd.unit; P._dirty = true; });
      s.addEventListener('change', () => APP.render());
      paramCard.append(UI.h('div', { class: 'slider-row' }, UI.h('span', {}, pd.label), s, val));
    });
    const assump = UI.h('details', { style: { marginTop: '10px' } }, UI.h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, '⚙ Panel giả định — toàn bộ hệ số truyền dẫn đang dùng (bắt buộc hiển thị — FR-STRESS-01)'));
    const aBody = UI.h('div', { style: { paddingTop: '8px' } });
    const formulaNote = UI.h('p', { class: 'mono', style: { fontSize: '11.5px' } },
      'NPL_stress = NPL_base + Δ_NPL + macroAdd\nmacroAdd = max(0, 0.15×Δlãi suất) + max(0, 0.10×Δtỷ giá) + max(0, 0.12×(−ΔGDP)) + max(0, 0.05×Δlạm phát)\ntổn thất tín dụng ước tính = Δ_NPL × gross_loans × LGD\nCAR_stress = (vốn tự có − tổn thất) / (RWA × hệ số nở RWA)\nROA_stress = ROA_base − tổn thất / tài sản bình quân');
    aBody.append(formulaNote);
    [['lgd', 'LGD giả định (0–1)'], ['rwaExpansion', 'Hệ số nở RWA (khi Δ tín dụng ≠ 0)'], ['coefRate', 'Coef: lãi suất → NPL'], ['coefFx', 'Coef: tỷ giá → NPL'], ['coefGdp', 'Coef: GDP → NPL'], ['coefInfl', 'Coef: lạm phát → NPL'], ['cirRate', 'Coef: lãi suất → CIR']].forEach(([k, label]) => {
      const inp = UI.h('input', { class: 'inp', type: 'number', step: 0.01, value: A[k], style: { width: '90px' }, onchange: e => { A[k] = +e.target.value; APP.render(); } });
      aBody.append(UI.h('div', { class: 'flex', style: { margin: '4px 0' } }, UI.h('span', { style: { minWidth: '250px' } }, label), inp));
    });
    assump.append(aBody);
    paramCard.append(assump);
    wrap.append(paramCard);

    /* ---- Tính toán ---- */
    const inYear = st.indicators.filter(i => i.year === st.year);
    const rawMap = new Map(st.rows.map(r => [r.bank_code + '|' + r.year, r]));
    const results = inYear.map(ind => {
      const raw = rawMap.get(ind.bank_code + '|' + ind.year);
      const s = BR.stressApply(ind, raw, ind._avg_assets, P, A);
      const stressInd = Object.assign({}, ind, s);
      const logitS = BR.logitProb(stressInd), xgbS = BR.evalXgb(window.BRMODEL.artifact, stressInd);
      const probS = BR.ensembleProb(logitS, xgbS, st.ensembleWeights.logit, st.ensembleWeights.xgb);
      const sevS = BR.severityScore(stressInd, null, probS);
      // phân loại lại theo chỉ tiêu căng thẳng (không áp dải trễ)
      const grpS = BR.classify(stressInd, null, null, probS).group;
      return { ind, s, probS, grpS, sevS: sevS.score100 };
    });
    const hasProb = st.modelRun !== null;

    const stat = (arr, f) => {
      const vals = arr.map(f).filter(Number.isFinite);
      return { median: BR.median(vals), count: vals.length };
    };
    const base = {
      car: stat(inYear, i => i.car), npl: stat(inYear, i => i.npl), roa: stat(inYear, i => i.roa),
      prob: stat(inYear, i => i.prob ? i.prob.ensemble : null)
    };
    const stressed = {
      car: stat(results, r => r.s.car), npl: stat(results, r => r.s.npl), roa: stat(results, r => r.s.roa),
      prob: stat(results, r => r.probS)
    };

    /* ---- Bảng Cơ sở vs Căng thẳng ---- */
    const resCard = UI.h('div', { class: 'card mb' }, UI.h('div', { class: 'flex mb' },
      UI.h('h3', { style: { margin: 0 } }, 'Bảng Cơ sở vs. Căng thẳng (trung vị hệ thống)'), UI.badge(UI.srcType(st)),
      UI.h('span', { class: 'spacer' }),
      UI.h('button', { class: 'btn small', onclick: saveScenario, disabled: Object.keys(P).length === 0 }, '💾 Lưu kịch bản')));
    const cmpRow = (label, key, isPct) => ({
      cells: [label,
        { content: isPct ? BR.fmtPct(base[key].median) : BR.fmtNum(base[key].median, 4), cls: 'num' },
        { content: isPct ? BR.fmtPct(stressed[key].median) : BR.fmtNum(stressed[key].median, 4), cls: 'num' },
        { content: isPct ? BR.fmtPct((stressed[key].median - base[key].median), 2) : BR.fmtNum(stressed[key].median - base[key].median, 4), cls: 'num' }]
    });
    resCard.append(UI.table(['Chỉ tiêu (trung vị)', 'Cơ sở', 'Căng thẳng', 'Δ'], [
      cmpRow('CAR', 'car', true), cmpRow('NPL', 'npl', true), cmpRow('ROA', 'roa', true),
      {
        cells: ['Distress Probability', { content: base.prob.median === null ? 'chưa chấm điểm' : BR.fmtPct(base.prob.median, 1), cls: 'num' },
        { content: stressed.prob.median === null ? '—' : BR.fmtPct(stressed.prob.median, 1), cls: 'num' },
        { content: (base.prob.median !== null && stressed.prob.median !== null) ? BR.fmtPct(stressed.prob.median - base.prob.median, 1) : '—', cls: 'num' }]
      }
    ]));
    // Ngân hàng vượt ngưỡng — chuyển sang nhóm xấu hơn
    const ORDER = { stable: 0, watch: 1, high: 2, critical: 3 };
    const crossed = results.filter(r => (ORDER[r.grpS] || 0) > (ORDER[r.ind.group] || 0))
      .sort((a, b) => (ORDER[b.grpS]) - (ORDER[a.grpS]));
    resCard.append(UI.h('h4', { style: { margin: '12px 0 6px' } }, 'Ngân hàng chuyển sang nhóm xấu hơn (' + crossed.length + ')'));
    if (!crossed.length) resCard.append(UI.h('p', { class: 'muted' }, 'Không có ngân hàng nào chuyển nhóm dưới kịch bản hiện tại.'));
    else resCard.append(UI.table(['Ngân hàng', 'Cơ sở', 'Căng thẳng', 'NPL (→)', 'CAR (→)'],
      crossed.slice(0, 12).map(r => ({
        cells: [UI.h('b', {}, r.ind.bank_code), UI.groupChip(r.ind.group), UI.groupChip(r.grpS),
        { content: BR.fmtPct(r.ind.npl) + ' → ' + BR.fmtPct(r.s.npl), cls: 'num' },
        { content: BR.fmtPct(r.ind.car) + ' → ' + BR.fmtPct(r.s.car), cls: 'num' }]
      }))));
    wrap.append(resCard);

    /* ---- Bảng chi tiết từng ngân hàng ---- */
    const detailCard = UI.h('div', { class: 'card mb' }, UI.h('div', { class: 'flex mb' },
      UI.h('h3', { style: { margin: 0 } }, 'Chi tiết từng ngân hàng'), UI.badge(UI.srcType(st))));
    detailCard.append(UI.table(
      ['Ngân hàng', { label: 'CAR cơ sở', cls: 'num' }, { label: 'CAR căng thẳng', cls: 'num' }, { label: 'NPL cơ sở', cls: 'num' }, { label: 'NPL căng thẳng', cls: 'num' }, { label: 'ROA căng thẳng', cls: 'num' }, { label: 'Tổn thất ước tính', cls: 'num' }],
      results.map(r => ({
        cells: [UI.h('b', {}, r.ind.bank_code),
        { content: BR.fmtPct(r.ind.car), cls: 'num' }, { content: BR.fmtPct(r.s.car), cls: 'num' },
        { content: BR.fmtPct(r.ind.npl), cls: 'num' }, { content: BR.fmtPct(r.s.npl), cls: 'num' },
        { content: BR.fmtPct(r.s.roa), cls: 'num' },
        { content: r.s._creditLoss === null ? 'N/A' : BR.fmtMoney(r.s._creditLoss), cls: 'num' }]
      })), { maxHeight: '340px' }));
    wrap.append(detailCard);

    /* ---- Kịch bản đã lưu (tối đa 3, tái tạo được — AC-8.5-2) ---- */
    const scCard = UI.h('div', { class: 'card' }, UI.h('div', { class: 'flex mb' },
      UI.h('h3', { style: { margin: 0 } }, 'Kịch bản đã lưu (so sánh tối đa 3)'), UI.badge(UI.srcType(st))));
    if (!st.stress.scenarios.length) scCard.append(UI.emptyState('Chưa có kịch bản nào. Chỉnh tham số rồi bấm "Lưu kịch bản".', '📊'));
    else {
      const scs = st.stress.scenarios.slice(0, 3);
      const seriesData = ['NPL trung vị', 'CAR trung vị'].map((label, idx) => ({
        name: label, type: 'bar',
        data: scs.map(sc => +(idx === 0 ? sc.results.npl : sc.results.car).toFixed(4)),
        itemStyle: { color: UI.PALETTE[idx] }
      }));
      UI.chart(scCard, {
        title: 'So sánh kịch bản (trung vị, kỳ ' + st.year + ')',
        option: {
          grid: { left: 46, right: 16, top: 34, bottom: 30, containLabel: true },
          tooltip: { trigger: 'axis', valueFormatter: v => BR.fmtPct(v) },
          legend: { top: 0, left: 'center', textStyle: { fontSize: 11 } },
          xAxis: { type: 'category', data: scs.map(s => s.name) },
          yAxis: { type: 'value', axisLabel: { formatter: v => (v * 100).toFixed(0) + '%' } },
          series: seriesData
        },
        csv: [['scenario', 'params', 'median_npl', 'median_car']].concat(
          scs.map(s => [s.name, JSON.stringify(s.params), s.results.npl, s.results.car])),
        name: 'stress_scenarios', height: 250
      });
      scCard.append(UI.table(['Kịch bản', 'Tham số', ''], scs.map((s, i) => ({
        cells: [UI.h('b', {}, s.name),
        { content: UI.h('span', { class: 'mono' }, Object.entries(s.params).map(([k, v]) => k + '=' + v).join(', ')), cls: '' },
        { content: UI.h('button', { class: 'btn small danger', onclick: () => { st.stress.scenarios.splice(i, 1); APP.render(); } }, 'Xoá') }]
      }))));
      scCard.append(UI.h('p', { class: 'muted' }, 'Kịch bản lưu kèm đầy đủ tham số và tái tạo được (AC-8.5-2).'));
    }
    wrap.append(scCard);

    function saveScenario() {
      if (st.stress.scenarios.length >= 3) { UI.toast('Đã đạt tối đa 3 kịch bản so sánh — xoá bớt trước khi lưu.', 'warn'); return; }
      const name = 'Kịch bản ' + (st.stress.scenarios.length + 1) + ' (' + new Date().toLocaleTimeString('vi-VN') + ')';
      st.stress.scenarios.push({
        name, params: Object.assign({}, P), assumptions: Object.assign({}, A),
        results: { npl: stressed.npl.median, car: stressed.car.median, roa: stressed.roa.median },
        runAt: new Date().toISOString()
      });
      UI.toast('Đã lưu "' + name + '"', 'ok');
      APP.render();
    }
  }

  APP.registerView('stress', { title: 'Stress Test', render });
})();
