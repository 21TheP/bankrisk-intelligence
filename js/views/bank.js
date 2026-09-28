/* ============================================================
   Module 8.2 — Bank Profile (Hồ sơ ngân hàng)
   PRD: FHS 0–100 (trọng số chỉnh được), xác suất kiệt quệ,
   Z-score, nhãn RISK + nhóm cảnh báo (hai nhãn tách biệt),
   6 biểu đồ nhỏ, bảng chỉ tiêu có "so với năm trước", so sánh
   nhóm ngang hàng, panel XAI (đóng góp theo hệ số Logit).
   URL ?bank=VCB (AC-8.2-1).
   ============================================================ */
(function () {
  'use strict';
  const BR = window.BRCORE, UI = window.BRUI, APP = window.APP;

  function render(root, params) {
    params = params || {};
    const st = APP.state;
    const banks = APP.banks();
    const wrap = UI.h('div');
    root.append(wrap);
    if (!banks.length) { wrap.append(UI.emptyState('Chưa có dữ liệu. Hãy dùng bộ demo hoặc upload tệp.')); return; }

    const bankCode = params.bank && banks.some(b => b.bank_code === params.bank) ? params.bank : (st.bank && banks.some(b => b.bank_code === st.bank) ? st.bank : banks[0].bank_code);
    st.bank = bankCode;
    const latestY = APP.latestYearOf(bankCode);
    const inds = st.indicators.filter(i => i.bank_code === bankCode).sort((a, b) => a.year - b.year);
    const cur = APP.ind(bankCode, latestY);
    const prev = APP.ind(bankCode, latestY - 1);
    const rawRow = st.rows.find(r => r.bank_code === bankCode && r.year === latestY);

    /* ---- 1) Bộ chọn ngân hàng ---- */
    const sel = UI.h('input', { class: 'inp', list: 'bank-list', value: bankCode, style: { minWidth: '300px' } });
    const dl = UI.h('datalist', { id: 'bank-list' }, banks.map(b => UI.h('option', { value: b.bank_code }, b.bank_name)));
    sel.addEventListener('change', () => {
      const code = sel.value.trim().toUpperCase();
      if (banks.some(b => b.bank_code === code)) APP.setHash({ bank: code });
      else UI.toast('Không tìm thấy mã ngân hàng: ' + code, 'warn');
    });
    wrap.append(UI.h('div', { class: 'flex mb' }, sel, dl,
      UI.h('span', { class: 'muted' }, cur ? (cur._total_assets ? 'Tổng tài sản ' + BR.fmtMoney(cur._total_assets) + ' (' + latestY + ')' : '') : ''),
      UI.badge(UI.srcType(st)),
      UI.h('span', { class: 'spacer' }),
      UI.h('button', { class: 'btn', onclick: () => APP.exportReport('pdf', { bank: { code: bankCode, name: cur ? cur.bank_name : bankCode } }) }, '🖨 Báo cáo ngân hàng')));

    if (!cur) { wrap.append(UI.emptyState('Không có dữ liệu cho ngân hàng này.')); return; }

    /* ---- Điểm & trạng thái ---- */
    const fhsRes = BR.fhs(st.indicators, latestY, st.weights);
    const fhsVal = fhsRes.scores.get(bankCode);
    const prob = st.modelRun && cur.prob ? cur.prob.ensemble : null;
    const zInfo = cur.zscore === null ? (cur.zscore_n < 3 ? 'Cần ≥ 3 năm dữ liệu (hiện ' + cur.zscore_n + ' năm)' : 'Cần trường equity (vốn chủ sở hữu)') : null;

    const top = UI.h('div', { class: 'kpi-row' });
    wrap.append(top);
    top.append(UI.metric({
      label: 'Financial Health Score', badge: UI.srcType(st), badgeType: UI.srcType(st),
      value: fhsVal === null ? 'N/A' : String(fhsVal) + '<small>/100</small>',
      note: 'Percentile trong mẫu năm ' + latestY + ' — PRD 9.2',
      info: () => UI.h('div', { class: 'how-panel' },
        UI.h('p', {}, 'Điểm tổng hợp từ 7 chỉ tiêu chuẩn hoá theo phân vị trong mẫu, trung bình có trọng số:'),
        UI.h('table', {}, ...Object.entries(st.weights).map(([k, w]) =>
          UI.h('tr', {}, UI.h('td', {}, BR.INDICATORS[k].label + ' — ' + BR.INDICATORS[k].vi), UI.h('td', {}, w + '%')))),
        UI.h('p', { class: 'muted' }, '⚠ Trọng số là lựa chọn của nhóm dự án nhằm minh hoạ, không được ước lượng từ dữ liệu. Thay đổi trọng số sẽ thay đổi thứ hạng.')),
      extra: UI.h('button', { class: 'btn small', onclick: openWeights }, '⚖ Chỉnh trọng số')
    }));

    top.append(UI.metric({
      label: 'Distress Probability', badgeType: UI.srcType(st), badge: UI.srcType(st),
      value: prob === null ? '—' : BR.fmtPct(prob, 1),
      note: st.modelRun ? 'Ensemble v' + st.modelRun.version + ' (Logit + XGBoost)' : 'Chưa chấm điểm',
      info: prob === null ? null : () => {
        const p = cur.prob;
        return UI.h('div', { class: 'how-panel' },
          UI.h('table', {},
            UI.h('tr', {}, UI.h('td', {}, 'Logistic Regression'), UI.h('td', {}, BR.fmtPct(p.logit, 2))),
            UI.h('tr', {}, UI.h('td', {}, 'XGBoost (demo)'), UI.h('td', {}, BR.fmtPct(p.xgb, 2))),
            UI.h('tr', {}, UI.h('td', {}, 'Ensemble'), UI.h('td', {}, BR.fmtPct(p.ensemble, 2))),
            UI.h('tr', {}, UI.h('td', {}, 'Trọng số'), UI.h('td', {}, 'Logit ' + st.ensembleWeights.logit + ' / XGB ' + st.ensembleWeights.xgb)),
            UI.h('tr', {}, UI.h('td', {}, 'Miễn trừ'), UI.h('td', {}, 'Kết quả chỉ mang tính hỗ trợ ra quyết định học thuật (SEC-13)'))));
      }
    }));

    top.append(UI.metric({
      label: 'Z-score (ổn định)', badge: UI.srcType(st), badgeType: UI.srcType(st),
      value: cur.zscore === null ? 'N/A' : BR.fmtNum(cur.zscore, 2),
      note: zInfo || '(ROA + equity/tài sản) / sd(ROA) — cửa sổ ' + cur.zscore_n + ' năm',
      info: cur.zscore === null ? null : () => UI.howPanel('size', cur, rawRow, st.meta, st.fileName)
    }));

    const statusCard = UI.h('div', { class: 'card mb' });
    statusCard.append(UI.h('div', { class: 'flex' },
      UI.h('h3', { style: { margin: 0 } }, 'Trạng thái cảnh báo kỳ ' + latestY),
      UI.riskLabel(cur), UI.groupChip(cur.group),
      cur.hysteresisApplied ? UI.h('span', { class: 'chip neutral', title: 'Dải trễ ±0,1 điểm % (PRD 9.5)' }, 'dải trễ áp dụng') : null,
      cur.risk_partial ? UI.h('span', { class: 'chip neutral' }, 'đánh giá một phần — thiếu CAR hoặc NPL') : null));
    statusCard.append(UI.h('div', { class: 'muted mt' }, 'Nhãn RISK là quy tắc nghiên cứu; nhóm cảnh báo theo ngưỡng cấu hình (PRD 9.1) — hai nhãn tách biệt theo yêu cầu 8.2.5.'));
    statusCard.append(UI.h('div', { class: 'mt' }, UI.h('b', {}, 'Điểm nghiêm trọng: ' + cur.severity.score100 + '/100 '),
      UI.h('span', { class: 'muted' }, '— quy tắc kích hoạt: ' + (cur.severity.rules.length ? '' : 'không có'))));
    cur.severity.rules.forEach(r => statusCard.append(UI.h('div', { class: 'muted' }, '• ' + r.msg + ' — ' + (r.var === 'CAR' || r.var === 'NPL' ? BR.fmtPct(r.value) : BR.fmtNum(r.value, 2)) + ' (+' + r.points + ' điểm)')));
    wrap.append(statusCard);

    /* ---- 6) Small multiples 6 chỉ tiêu ---- */
    const smGrid = UI.h('div', { class: 'grid c3' });
    wrap.append(smGrid);
    ['car', 'npl', 'roa', 'cir', 'dprr', 'niir'].forEach(key => {
      const years = inds.map(i => i.year).filter(y => inds.find(x => x.year === y)[key] !== null);
      const data = inds.map(i => i[key]);
      if (years.length < 2) {
        const emptyCard = UI.h('div', { class: 'card' });
        emptyCard.append(UI.emptyState(BR.INDICATORS[key].label + ': ngân hàng này chỉ có ' + inds.length + ' năm dữ liệu — biểu đồ xu hướng cần tối thiểu 2 năm (FR 8.2).', '📉'));
        smGrid.append(emptyCard);
        return;
      }
      const option = {
        grid: { left: 40, right: 10, top: 26, bottom: 24, containLabel: true },
        tooltip: { trigger: 'axis', valueFormatter: v => BR.fmtPct(v) },
        xAxis: { type: 'category', data: inds.map(i => i.year), axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', axisLabel: { formatter: v => (v * 100).toFixed(0) + '%' } },
        series: [{
          name: BR.INDICATORS[key].label, type: 'line', data,
          lineStyle: { width: 2, color: UI.PALETTE[0] }, itemStyle: { color: UI.PALETTE[0] },
          areaStyle: { color: '#2264c018' }, connectNulls: false
        }]
      };
      if (BR.INDICATORS[key].threshold) option.series.push({
        type: 'line', data: [], markLine: {
          silent: true, symbol: 'none', data: [{ yAxis: BR.INDICATORS[key].threshold }],
          lineStyle: { color: '#c62828', type: 'dashed' }, label: { formatter: 'ngưỡng', fontSize: 9, color: '#c62828' }
        }
      });
      UI.chart(smGrid, {
        title: BR.INDICATORS[key].label + ' — ' + BR.INDICATORS[key].vi,
        sub: UI.infoBtn ? '' : '',
        option, csv: [['year', key]].concat(inds.map(i => [i.year, i[key] === null ? '' : i[key].toFixed(5)])),
        name: 'profile_' + key + '_' + bankCode, height: 180
      });
    });

    /* ---- 7) Bảng chỉ tiêu có "so với năm trước" ---- */
    const tblCard = UI.h('div', { class: 'card mt' }, UI.h('div', { class: 'flex mb' }, UI.h('h3', { style: { margin: 0 } }, 'Bảng chỉ tiêu tài chính'), UI.badge(UI.srcType(st))));
    const rowsTable = inds.slice().reverse().map(r => {
      const p = APP.ind(bankCode, r.year - 1);
      const cell = (key, isPct) => {
        const v = r[key], pv = p ? p[key] : null;
        const delta = (v !== null && pv !== null) ? (isPct ? ((v - pv) * 100) : (v - pv)) : null;
        const good = delta === null ? null : (BR.INDICATORS[key].dir === 1 ? delta > 0 : delta < 0);
        return {
          content: UI.h('span', {},
            isPct ? BR.fmtPct(v) : BR.fmtNum(v, 3),
            delta !== null ? UI.h('span', { class: 'muted', style: { marginLeft: '6px', fontSize: '11px' } }, 'Δ ' + (delta >= 0 ? '+' : '') + (isPct ? BR.fmtPct(delta, 2).replace('%', ' đ %') : BR.fmtNum(delta, 3))) : null,
            r.roa_flag === 'roa_end_of_period' && key === 'roa' ? UI.h('span', { title: 'F-01: ROA tính trên tài sản cuối kỳ (thiếu năm t−1)', style: { marginLeft: '4px' } }, '⚠') : null,
            UI.infoBtn(BR.INDICATORS[key].label + ' ' + bankCode + ' ' + r.year, () => UI.howPanel(key, r, st.rows.find(x => x.bank_code === bankCode && x.year === r.year), st.meta, st.fileName))),
          cls: 'num'
        };
      };
      return {
        cells: [r.year, cell('car', true), cell('npl', true), cell('roa', true), cell('cir', true), cell('dprr', true), cell('niir', true),
        { content: UI.riskLabel(r), cls: '' }],
        trClass: r.risk_label === 1 ? 'rowflag' : ''
      };
    });
    tblCard.append(UI.table([{ label: 'Năm' }, { label: 'CAR ⓘ', cls: 'num' }, { label: 'NPL ⓘ', cls: 'num' }, { label: 'ROA ⓘ', cls: 'num' }, { label: 'CIR ⓘ', cls: 'num' }, { label: 'DPRR ⓘ', cls: 'num' }, { label: 'NIIR ⓘ', cls: 'num' }, { label: 'RISK' }], rowsTable, { maxHeight: '420px' }));
    wrap.append(tblCard);

    /* ---- 8) So sánh nhóm ngang hàng ---- */
    const peerCard = UI.h('div', { class: 'card mt' }, UI.h('div', { class: 'flex mb' },
      UI.h('h3', { style: { margin: 0 } }, 'So sánh nhóm ngang hàng — năm ' + latestY), UI.badge(UI.srcType(st)),
      UI.h('span', { class: 'muted' }, 'Ngân hàng vs. trung vị toàn mẫu [GIẢ ĐỊNH]')));
    wrap.append(peerCard);
    const peerKeys = ['car', 'npl', 'roa', 'cir', 'dprr', 'niir'];
    const inYearAll = st.indicators.filter(i => i.year === latestY);
    const bankVals = peerKeys.map(k => cur[k]);
    const medVals = peerKeys.map(k => BR.median(inYearAll.map(i => i[k])));
    UI.chart(peerCard, {
      title: '', option: {
        grid: { left: 60, right: 20, top: 30, bottom: 26, containLabel: true },
        tooltip: { valueFormatter: v => BR.fmtPct(v) },
        legend: { top: 0, left: 'center', textStyle: { fontSize: 11 } },
        xAxis: { type: 'value', axisLabel: { formatter: v => (v * 100).toFixed(0) + '%' } },
        yAxis: { type: 'category', data: peerKeys.map(k => BR.INDICATORS[k].label) },
        series: [
          { name: bankCode, type: 'bar', data: bankVals, itemStyle: { color: '#2264c0' } },
          { name: 'Trung vị hệ thống', type: 'bar', data: medVals, itemStyle: { color: '#9db1d4' } }
        ]
      },
      csv: [['indicator', bankCode, 'median']].concat(peerKeys.map((k, i) => [k, bankVals[i], medVals[i]])),
      name: 'peer_' + bankCode, height: 240
    });
    wrap.append(peerCard);

    /* ---- 9) Panel XAI ---- */
    const xaiCard = UI.h('div', { class: 'card mt' });
    xaiCard.append(UI.h('div', { class: 'flex mb' }, UI.h('h3', { style: { margin: 0 } }, 'Yếu tố dẫn dắt rủi ro (XAI)'), UI.badge('B', 'Mô hình v' + (st.modelRun ? st.modelRun.version : '—'))));
    if (!st.modelRun) {
      xaiCard.append(UI.emptyState('Panel chỉ hiện khi mô hình đã chạy (AC-8.2-3).'),
        UI.h('div', { style: { textAlign: 'center' } }, UI.h('button', { class: 'btn primary', onclick: () => APP.runModel() }, '⚡ Chạy chấm điểm')));
    } else {
      const c = BR.LOGIT_COEFS;
      const contribs = ['SIZE', 'CAR', 'ROA', 'NIIR', 'NPL', 'DPRR', 'CIR'].map(k => ({
        k, val: c[k] * cur[k.toLowerCase()], coef: c[k], x: cur[k.toLowerCase()]
      })).filter(x => Number.isFinite(x.val)).sort((a, b) => Math.abs(b.val) - Math.abs(a.val)).slice(0, 5);
      xaiCard.append(UI.h('p', { class: 'muted' }, 'Đóng góp từng biến lên điểm Logit (βᵢ·xᵢ) từ hệ số Logit công bố — biến dương đẩy xác suất kiệt quệ lên. Đây là giải thích theo hệ số tuyến tính, không phải SHAP đầy đủ.'));
      UI.chart(xaiCard, {
        title: 'Top 5 yếu tố — kỳ ' + latestY,
        option: {
          grid: { left: 60, right: 30, top: 30, bottom: 24, containLabel: true },
          tooltip: { formatter: p => p.name + ': ' + BR.fmtNum(p.value, 3) },
          xAxis: { type: 'value', axisLabel: { formatter: v => v.toFixed(1) } },
          yAxis: { type: 'category', data: contribs.map(x => x.k).reverse(), inverse: false },
          series: [{
            type: 'bar', data: contribs.map(x => ({ value: x.val, itemStyle: { color: x.val >= 0 ? '#c62828' : '#1e7d3c' } })).reverse(),
            label: { show: true, position: 'right', formatter: p => p.value.toFixed(2), fontSize: 10 }
          }]
        },
        csv: [['variable', 'coef', 'value', 'contribution']].concat(contribs.map(x => [x.k, x.coef, x.x, x.val])),
        name: 'xai_' + bankCode, height: 220
      });
    }
    wrap.append(xaiCard);

    /* ---- Modal chỉnh trọng số FHS (sensitivity view) ---- */
    function openWeights() {
      const sliders = {};
      const body = UI.h('div');
      body.append(UI.h('p', { class: 'muted' }, '⚠ Trọng số là giả định học thuật nhằm minh hoạ, không ước lượng từ dữ liệu. Thay đổi trọng số sẽ thay đổi thứ hạng ngân hàng (PRD 9.2).'));
      for (const k of Object.keys(st.weights)) {
        const val = UI.h('span', { class: 'val' }, st.weights[k] + '%');
        const s = UI.h('input', { type: 'range', min: 0, max: 50, value: st.weights[k] });
        s.addEventListener('input', () => { sliders[k] = +s.value; val.textContent = s.value + '%'; });
        body.append(UI.h('div', { class: 'slider-row' }, UI.h('span', {}, BR.INDICATORS[k].label + ' — ' + BR.INDICATORS[k].vi), s, val));
      }
      UI.modal({
        title: 'Trọng số Financial Health Score',
        body,
        footer: [
          UI.h('button', { class: 'btn', onclick: function () { this.closest('.modal-back').remove(); } }, 'Huỷ'),
          UI.h('button', {
            class: 'btn primary', onclick: function () {
              Object.assign(st.weights, sliders);
              this.closest('.modal-back').remove();
              APP.render();
            }
          }, 'Áp dụng')
        ]
      });
    }
  }

  APP.registerView('bank', { title: 'Hồ sơ ngân hàng', render });
})();
