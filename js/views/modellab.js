/* ============================================================
   Model Lab (Phòng thí nghiệm mô hình)
   Đánh giá mô hình TRÊN BỘ DỮ LIỆU NGƯỜI DÙNG ĐANG TẢI:
   chấm điểm Logit + XGBoost + Ensemble trong trình duyệt,
   phân phối xác suất, tỷ lệ phân loại rủi ro, feature
   importance, Z-score. Số liệu nghiên cứu gốc chỉ làm tham chiếu.
   ============================================================ */
(function () {
  'use strict';
  const BR = window.BRCORE, UI = window.BRUI, APP = window.APP;
  const MC = window.BRMODEL.modelCard;

  function render(root) {
    const st = APP.state;
    const wrap = UI.h('div');
    root.append(wrap);
    if (!st.indicators.length) { wrap.append(UI.emptyState('Chưa có dữ liệu. Hãy dùng bộ demo hoặc upload tệp.')); return; }

    /* ---- Tóm tắt bộ dữ liệu đang chấm ---- */
    const years = [...new Set(st.indicators.map(i => i.year))].filter(y => y !== null).sort((a, b) => a - b);
    const nBanks = new Set(st.rows.map(r => r.bank_code)).size;
    const risk1 = st.indicators.filter(i => i.risk_label === 1).length;
    const riskLabeled = st.indicators.filter(i => i.risk_label !== null).length;

    const runCard = UI.h('div', { class: 'card mb' },
      UI.h('div', { class: 'flex' },
        UI.h('h3', { style: { margin: 0 } }, 'Chấm điểm mô hình trên dữ liệu hiện tại'),
        st.modelRun ? UI.badge('v' + st.modelRun.version, 'Mô hình') : null,
        UI.h('span', { class: 'spacer' }),
        UI.h('button', { class: 'btn primary', onclick: () => APP.runModel() }, st.modelRun ? '↻ Chạy lại chấm điểm' : '⚡ Chạy chấm điểm')));
    runCard.append(UI.h('p', { class: 'muted', style: { margin: '8px 0 0' } },
      'Bộ dữ liệu: ' + st.rows.length + ' quan sát · ' + nBanks + ' ngân hàng · ' + years.length + ' năm (' + (years[0] || '—') + '–' + (years[years.length - 1] || '—') + ')' +
      (riskLabeled ? ' · tỷ lệ RISK=1: ' + BR.fmtPct(risk1 / riskLabeled, 1) : '') +
      (st.modelRun ? ' · đã chấm ' + st.modelRun.nScored + ' quan sát' + (st.modelRun.nSkipped ? ' (bỏ qua ' + st.modelRun.nSkipped + ' thiếu biến đầu vào)' : '') : '')));
    wrap.append(runCard);

    /* ---- KPI kết quả trên dữ liệu hiện tại ---- */
    if (st.modelRun) {
      const scored = st.indicators.filter(i => i.prob && i.prob.ensemble !== null);
      const latest = st.indicators.filter(i => i.year === st.year && i.prob && i.prob.ensemble !== null);
      const highRisk = latest.filter(i => i.prob.ensemble >= 0.5).length;
      const medPD = latest.length ? BR.median(latest.map(i => i.prob.ensemble)) : null;
      const kpis = UI.h('div', { class: 'kpi-row mb' },
        UI.metric({ label: 'Quan sát đã chấm', value: String(st.modelRun.nScored), note: 'toàn bộ giai đoạn dữ liệu' }),
        UI.metric({ label: 'PD trung vị (kỳ ' + st.year + ')', value: medPD === null ? '—' : BR.fmtPct(medPD, 1), note: 'Ensemble trên các ngân hàng kỳ này' }),
        UI.metric({ label: 'Ngân hàng PD ≥ 50%', value: String(highRisk), note: 'kỳ ' + st.year + ' — vùng nguy cơ cao' }),
        UI.metric({ label: 'Kiểm chứng artefact', value: st.modelRun.verified.results.filter(x => x.pass).length + '/' + st.modelRun.verified.results.length, note: 'test_vectors PASS (dung sai 1e-6)' }));
      wrap.append(kpis);
    }

    /* ---- Xác suất kiệt quệ trên dữ liệu hiện tại ---- */
    const pdCard = UI.h('div', { class: 'card mb' },
      UI.h('div', { class: 'flex mb' },
        UI.h('h3', { style: { margin: 0 } }, 'Xác suất kiệt quệ (Ensemble) — kỳ ' + st.year),
        st.modelRun ? UI.badge(UI.srcType(st)) : UI.h('span', { class: 'chip neutral' }, 'chưa chạy')));
    if (!st.modelRun) {
      pdCard.append(UI.emptyState('Chưa có kết quả chấm điểm. Bấm "Chạy chấm điểm" ở trên — suy luận chạy hoàn toàn trong trình duyệt.'));
    } else {
      const list = st.indicators.filter(i => i.year === st.year && i.prob && i.prob.ensemble !== null)
        .sort((a, b) => b.prob.ensemble - a.prob.ensemble);
      UI.chart(pdCard, {
        title: 'Phân phối xác suất kiệt quệ (Ensemble)',
        option: {
          grid: { left: 40, right: 14, top: 30, bottom: 40, containLabel: true },
          tooltip: { trigger: 'axis', formatter: p => p.map(x => x.axisValue + ': ' + x.data + ' ngân hàng').join('<br>') },
          xAxis: { type: 'category', data: ['0–10%', '10–20%', '20–30%', '30–40%', '40–50%', '50–60%', '60–70%', '70–80%', '80–90%', '90–100%'], axisLabel: { rotate: 40, fontSize: 10 } },
          yAxis: { type: 'value', name: 'số ngân hàng', minInterval: 1 },
          series: [{
            type: 'bar', barCategoryGap: '15%',
            data: new Array(10).fill(0).map((_, b) => list.filter(i => i.prob.ensemble >= b / 10 && i.prob.ensemble < (b + 1) / 10 || (b === 9 && i.prob.ensemble >= 0.99)).length),
            itemStyle: { color: '#2264c0' }
          }]
        },
        csv: [['bank', 'logit', 'xgb', 'ensemble']].concat(list.map(i => [i.bank_code, i.prob.logit, i.prob.xgb, i.prob.ensemble])),
        name: 'prob_dist', height: 230
      });
      pdCard.append(UI.table(['Ngân hàng', { label: 'Logit', cls: 'num' }, { label: 'XGBoost', cls: 'num' }, { label: 'Ensemble', cls: 'num' }, 'Nhóm'],
        list.slice(0, 12).map(i => ({
          cells: [UI.h('b', {}, i.bank_code),
          { content: BR.fmtPct(i.prob.logit, 1), cls: 'num' },
          { content: BR.fmtPct(i.prob.xgb, 1), cls: 'num' },
          { content: UI.h('b', {}, BR.fmtPct(i.prob.ensemble, 1)), cls: 'num' },
          { content: UI.groupChip(i.group) }]
        })), { maxHeight: '320px' }));
      // Trọng số Ensemble chỉnh được
      pdCard.append(UI.h('div', { class: 'flex mt' },
        UI.h('label', { class: 'lbl' }, 'Trọng số Ensemble:'),
        UI.h('input', { class: 'inp', type: 'number', min: 0, max: 1, step: 0.05, value: st.ensembleWeights.logit, style: { width: '80px' }, onchange: e => { st.ensembleWeights.logit = +e.target.value; st.ensembleWeights.xgb = 1 - +e.target.value; APP.runModel(); } }),
        UI.h('span', {}, 'Logit'), UI.h('span', { class: 'muted' }, '· còn lại → XGBoost (' + st.ensembleWeights.xgb + ')')));
    }
    wrap.append(pdCard);

    /* ---- Feature importance ---- */
    const fiCard = UI.h('div', { class: 'card mb' },
      UI.h('div', { class: 'flex mb' }, UI.h('h3', { style: { margin: 0 } }, 'Feature importance (gain)'), UI.badge('v' + MC.model_version, 'Mô hình')));
    const fi = Object.entries(window.BRMODEL.artifact.feature_importance_gain).sort((a, b) => b[1] - a[1]);
    UI.chart(fiCard, {
      option: {
        grid: { left: 60, right: 40, top: 10, bottom: 24, containLabel: true },
        tooltip: {},
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: fi.map(x => x[0]).reverse() },
        series: [{ type: 'bar', data: fi.map(x => x[1]).reverse(), itemStyle: { color: '#1a4d8f' }, label: { show: true, position: 'right', fontSize: 10 } }]
      },
      csv: [['feature', 'gain']].concat(fi),
      name: 'feature_importance', height: 230
    });
    fiCard.append(UI.h('p', { class: 'muted' }, 'Mức độ quan trọng của từng biến trong cây XGBoost (tổng gain) — dùng để đọc nhanh biến nào dẫn dắt xác suất kiệt quệ.'));
    wrap.append(fiCard);

    /* ---- Z-score (tính trực tiếp trên dữ liệu) ---- */
    const zList = st.indicators.filter(i => i.year === st.year && i.zscore !== null);
    const zCard = UI.h('div', { class: 'card mb' },
      UI.h('div', { class: 'flex mb' }, UI.h('h3', { style: { margin: 0 } }, 'Z-score (ổn định ngân hàng)'), UI.badge(UI.srcType(st)),
        UI.h('span', { class: 'muted' }, 'Kỳ ' + st.year)));
    if (!zList.length) {
      zCard.append(UI.emptyState('Không tính được Z-score kỳ này: cần ≥ 3 năm dữ liệu liên tục cho mỗi ngân hàng và trường equity (vốn chủ sở hữu).'));
    } else {
      zCard.append(UI.table(['Ngân hàng', { label: 'Z-score', cls: 'num' }, { label: 'ROA', cls: 'num' }, { label: 'Equity/TA', cls: 'num' }, { label: 'Cửa sổ (năm)', cls: 'num' }],
        zList.sort((a, b) => a.zscore - b.zscore).map(i => ({
          cells: [UI.h('b', {}, i.bank_code), { content: BR.fmtNum(i.zscore, 2), cls: 'num' },
          { content: BR.fmtPct(i.roa), cls: 'num' }, { content: BR.fmtPct(i.equity_to_assets), cls: 'num' },
          { content: String(i.zscore_n), cls: 'num' }]
        })), { maxHeight: '300px' }));
      zCard.append(UI.h('p', { class: 'muted' }, 'Z = (ROA + equity/tài sản) / sd(ROA); sd tính trên cửa sổ ≥ 3 năm của chính ngân hàng. Cao hơn = ổn định hơn.'));
    }
    wrap.append(zCard);

    /* ---- Logit coefficients (tham chiếu) ---- */
    const c = BR.LOGIT_COEFS;
    const logitCard = UI.h('div', { class: 'card mb' },
      UI.h('div', { class: 'flex mb' }, UI.h('h3', { style: { margin: 0 } }, 'Logistic Regression — hệ số'), UI.badge('Tham chiếu', 'Hệ số')));
    logitCard.append(UI.table(['Biến', { label: 'Hệ số β', cls: 'num' }],
      [['Hằng số', c.intercept], ['SIZE', c.SIZE], ['CAR', c.CAR], ['ROA', c.ROA], ['NIIR', c.NIIR], ['NPL', c.NPL], ['DPRR', c.DPRR], ['CIR', c.CIR]]
        .map(([k, cv]) => ({ cells: [k, { content: BR.fmtNum(cv, 3), cls: 'num' }] }))));
    logitCard.append(UI.h('p', { class: 'muted' }, 'p = 1/(1+e^(−Xβ)) tính trong trình duyệt trên dữ liệu hiện tại. Biến dương đẩy xác suất kiệt quệ lên.'));
    wrap.append(logitCard);

    /* ---- Tham chiếu hiệu năng nghiên cứu gốc (gọn, thu được) ---- */
    const refCard = UI.h('div', { class: 'card mb' },
      UI.h('div', { class: 'flex mb' }, UI.h('h3', { style: { margin: 0 } }, 'Hiệu năng tham chiếu (nghiên cứu gốc)'), UI.badge('Tham chiếu', 'Bảng 4.4')));
    refCard.append(UI.table(['Mô hình', { label: 'Accuracy', cls: 'num' }, { label: 'Sensitivity', cls: 'num' }, { label: 'Specificity', cls: 'num' }, { label: 'AUC', cls: 'num' }],
      MC.research_reported_metrics.models.map(m => ({
        cells: [UI.h('b', {}, m.name),
        { content: BR.fmtPct(m.accuracy, 2), cls: 'num' },
        { content: BR.fmtPct(m.sensitivity, 2), cls: 'num' },
        { content: BR.fmtPct(m.specificity, 2), cls: 'num' },
        { content: m.auc.toFixed(3), cls: 'num' }]
      }))));
    refCard.append(UI.h('p', { class: 'muted' }, 'Số liệu công bố trong nghiên cứu gốc trên bộ dữ liệu của nghiên cứu — chỉ mang tính đối chiếu, không phải kết quả trên dữ liệu bạn đang tải.'));
    wrap.append(refCard);

    /* ---- Model card ---- */
    wrap.append(UI.h('div', { class: 'card' },
      UI.h('div', { class: 'flex mb' }, UI.h('h3', { style: { margin: 0 } }, 'Model card'), UI.badge('v' + MC.model_version, 'Mô hình')),
      UI.table(['Trường', 'Giá trị'], [
        { cells: ['model_version', MC.model_version] },
        { cells: ['training_date', MC.training_date] },
        { cells: ['input_schema', MC.input_schema.join(', ')] },
        { cells: ['split_strategy', MC.split_strategy] },
        { cells: ['dataset_version', MC.dataset_version] }
      ])));
  }

  APP.registerView('modellab', { title: 'Model Lab', render });
})();
