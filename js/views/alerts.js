/* ============================================================
   Module 8.3 — Early Warning Center (Trung tâm cảnh báo sớm)
   PRD: xếp hạng theo mức nghiêm trọng, tín hiệu chính (≤3 chip),
   Δ so kỳ trước, chiều hướng 3 kỳ, panel giải thích từng quy tắc,
   biểu đồ NPL lịch sử có ngưỡng 3%. Sắp xếp mọi cột, null xuống
   cuối (AC-8.3-2); xuất CSV giữ bộ lọc (AC-8.3-3).
   ============================================================ */
(function () {
  'use strict';
  const BR = window.BRCORE, UI = window.BRUI, APP = window.APP;

  const GROUP_ORDER = { critical: 3, high: 2, watch: 1, stable: 0 };

  function render(root) {
    const st = APP.state;
    const wrap = UI.h('div');
    root.append(wrap);
    if (!st.indicators.length) { wrap.append(UI.emptyState('Chưa có dữ liệu. Hãy dùng bộ demo hoặc upload tệp.')); return; }

    const state = { group: 'all', sortKey: 'score', sortDir: -1 };

    const controls = UI.h('div', { class: 'flex mb' },
      UI.h('label', { class: 'lbl' }, 'Nhóm rủi ro:'),
      UI.dropdown({
        options: [
          { value: 'all', label: 'Tất cả' },
          { value: 'critical', label: 'Nghiêm trọng' },
          { value: 'high', label: 'Cảnh báo cao' },
          { value: 'watch', label: 'Theo dõi' },
          { value: 'stable', label: 'Ổn định' }
        ],
        value: state.group,
        onChange: v => { state.group = v; renderTable(); }
      }),
      UI.h('span', { class: 'muted' }, 'Kỳ: ' + st.year),
      UI.badge(UI.srcType(st)),
      UI.h('span', { class: 'spacer' }),
      UI.h('button', { class: 'btn small', onclick: exportCsv, title: 'AC-8.3-3: xuất CSV giữ nguyên bộ lọc' }, '⬇ CSV bảng cảnh báo'));
    wrap.append(controls);
    const tableHost = UI.h('div');
    wrap.append(tableHost);
    const noteHost = UI.h('div');
    wrap.append(noteHost);

    function signals(ind, max) {
      const sigs = [];
      ind.reasons.forEach(r => sigs.push(r.rule + ' (' + (r.var === 'CAR' || r.var === 'NPL' ? BR.fmtPct(r.value) : BR.fmtNum(r.value, 1)) + ')'));
      if (ind.car !== null && ind.car < BR.THRESHOLDS.riskCar && !ind.reasons.some(r => r.rule.startsWith('CAR < 8'))) sigs.push('CAR ' + BR.fmtPct(ind.car) + ' (<8%)');
      return sigs.slice(0, max || 3);
    }
    function trend3(bank, year) {
      const rows = [year - 2, year - 1, year].map(y => APP.ind(bank, y)).filter(Boolean)
        .map(i => i.severity ? i.severity.score100 : null);
      if (rows.length < 3) return { label: '▬', cls: 'flat', title: 'Chưa đủ 3 kỳ' };
      const [a, b, c] = rows;
      if (c > b && b > a) return { label: '▲ xấu đi', cls: 'down', title: 'Điểm nghiêm trọng tăng 3 kỳ liên tiếp' };
      if (c < b && b < a) return { label: '▼ cải thiện', cls: 'up', title: 'Điểm nghiêm trọng giảm 3 kỳ liên tiếp' };
      return { label: '▬ đi ngang', cls: 'flat', title: 'Không có xu hướng rõ' };
    }

    function dataRows() {
      let list = st.indicators.filter(i => i.year === st.year).map(i => {
        const prev = APP.ind(i.bank_code, i.year - 1);
        return {
          ind: i, prev,
          delta: (prev && prev.severity && i.severity) ? i.severity.score100 - prev.severity.score100 : null
        };
      });
      if (state.group !== 'all') list = list.filter(x => x.ind.group === state.group);
      const val = (x) => {
        switch (state.sortKey) {
          case 'score': return x.ind.severity ? x.ind.severity.score100 : null;
          case 'delta': return x.delta;
          case 'npl': return x.ind.npl;
          case 'car': return x.ind.car;
          case 'group': return GROUP_ORDER[x.ind.group] || 0;
          case 'code': return x.ind.bank_code;
          default: return null;
        }
      };
      list.sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va === null && vb === null) return 0;
        if (va === null) return 1;  // null xuống cuối (AC-8.3-2)
        if (vb === null) return -1;
        if (typeof va === 'string') return state.sortDir * va.localeCompare(vb);
        return state.sortDir * (va - vb);
      });
      return list;
    }

    function headerDef() {
      const mk = (key, label, num) => ({
        label: UI.h('span', { style: { cursor: 'pointer' }, title: 'Bấm để sắp xếp' }, label + (state.sortKey === key ? (state.sortDir === 1 ? ' ▲' : ' ▼') : '')),
        cls: num ? 'num' : '',
        onclick: () => { if (state.sortKey === key) state.sortDir *= -1; else { state.sortKey = key; state.sortDir = key === 'code' ? 1 : -1; } renderTable(); }
      });
      return [
        mk('score', 'Hạng (điểm)'), mk('code', 'Ngân hàng'), mk('group', 'Mức nghiêm trọng'),
        mk('delta', 'Δ so kỳ trước', true), { label: 'Chiều hướng (3 kỳ)' }, { label: 'Tín hiệu rủi ro chính' }, { label: 'Hành động' }
      ];
    }

    function renderTable() {
      tableHost.innerHTML = '';
      const list = dataRows();
      if (!list.length) {
        tableHost.append(UI.emptyState('Không có ngân hàng nào vượt ngưỡng cảnh báo trong kỳ này. Gợi ý: chuyển bộ lọc nhóm về "Tất cả".', '✅'));
        return;
      }
      const rows = list.map((x, idx) => {
        const i = x.ind;
        const delta = x.delta;
        const d = delta === null ? { content: '—', cls: 'num' } : {
          content: UI.h('span', { class: delta > 0 ? 'delta down' : delta < 0 ? 'delta up' : 'delta flat' }, (delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '▬ ') + delta),
          cls: 'num'
        };
        const t = trend3(i.bank_code, i.year);
        return {
          trClass: i.group === 'critical' ? 'rowflag' : '',
          cells: [
            { content: String(idx + 1), cls: 'num' },
            { content: UI.h('b', {}, i.bank_code), },
            { content: UI.groupChip(i.group) },
            d,
            { content: UI.h('span', { class: t.cls, title: t.title }, t.label) },
            { content: signals(i).map(s => UI.h('span', { class: 'chip neutral', style: { margin: '1px 4px 1px 0', fontSize: '11px' } }, s)) },
            { content: UI.h('button', { class: 'btn small', onclick: () => openDetail(i) }, 'Giải thích') }
          ]
        };
      });
      tableHost.append(UI.table(headerDef(), rows, { maxHeight: '560px' }));
    }

    function exportCsv() {
      const list = dataRows();
      const matrix = [['rank', 'bank_code', 'bank_name', 'year', 'group', 'severity_score', 'delta_vs_prev', 'signals']];
      list.forEach((x, idx) => matrix.push([
        idx + 1, x.ind.bank_code, x.ind.bank_name, x.ind.year, UI.groupLabel(x.ind.group),
        x.ind.severity ? x.ind.severity.score100 : '',
        x.delta === null ? '' : x.delta,
        signals(x.ind).join(' | ')
      ]));
      UI.downloadText('bankrisk_alerts_' + st.year + '.csv', BR.toCSV(matrix), 'text/csv;charset=utf-8');
    }

    function openDetail(ind) {
      const body = UI.h('div');
      body.append(UI.h('div', { class: 'flex' }, UI.h('b', {}, ind.bank_code + ' — ' + ind.bank_name), UI.groupChip(ind.group), UI.riskLabel(ind)));
      body.append(UI.h('p', { class: 'muted' }, 'Kỳ ' + ind.year + ' · Điểm nghiêm trọng ' + (ind.severity ? ind.severity.score100 : 'N/A') + '/100 (raw ' + (ind.severity ? ind.severity.raw : 'N/A') + '/' + BR.SEVERITY_RAW_MAX + ')' + (ind.hysteresisApplied ? ' · dải trễ ±0,1 đ% đã áp dụng' : '')));
      body.append(UI.h('h4', {}, 'Các quy tắc đã kích hoạt (AC-8.3-1: không có cảnh báo hộp đen)'));
      if (!ind.reasons.length) body.append(UI.h('p', {}, 'Không có quy tắc nào kích hoạt trong kỳ này.'));
      else {
        body.append(UI.table(['Quy tắc', 'Giá trị thực tế', 'Ngưỡng', 'Điểm'],
          ind.severity.rules.map(r => ({
            cells: [r.msg, { content: r.var === 'CAR' || r.var === 'NPL' ? BR.fmtPct(r.value) : BR.fmtNum(r.value, 2), cls: 'num' },
            { content: r.var === 'CAR' || r.var === 'NPL' ? BR.fmtPct(r.threshold) : BR.fmtNum(r.threshold, 2), cls: 'num' },
            { content: '+' + r.points, cls: 'num' }]
          }))));
      }
      const chartHost = UI.h('div');
      body.append(UI.h('h4', {}, 'Lịch sử NPL (ngưỡng 3% nét đứt đỏ)'), chartHost);
      const hist = st.indicators.filter(i => i.bank_code === ind.bank_code).sort((a, b) => a.year - b.year);
      UI.chart(chartHost, {
        title: ind.bank_code + ' — NPL', small: true,
        option: {
          grid: { left: 46, right: 14, top: 26, bottom: 24, containLabel: true },
          tooltip: { trigger: 'axis', valueFormatter: v => BR.fmtPct(v) },
          xAxis: { type: 'category', data: hist.map(i => i.year) },
          yAxis: { type: 'value', axisLabel: { formatter: v => (v * 100).toFixed(0) + '%' } },
          series: [{
            type: 'line', data: hist.map(i => i.npl), lineStyle: { width: 2.5, color: '#c62828' }, itemStyle: { color: '#c62828' },
            areaStyle: { color: '#c6282811' }
          }, {
            type: 'line', data: [], markLine: {
              silent: true, symbol: 'none', data: [{ yAxis: BR.THRESHOLDS.riskNpl }],
              lineStyle: { color: '#c62828', type: 'dashed' }, label: { formatter: '3%', color: '#c62828' }
            }
          }]
        },
        csv: [['year', 'npl']].concat(hist.map(i => [i.year, i.npl === null ? '' : i.npl.toFixed(5)])),
        name: 'npl_hist_' + ind.bank_code, height: 230
      });
      body.append(UI.h('p', { class: 'muted' }, 'Nguồn: ' + (st.source === 'demo' ? '[DỮ LIỆU DEMO]' : 'dữ liệu upload của bạn') + ' · Mọi cảnh báo truy vết được về quy tắc cụ thể với giá trị và ngưỡng.'));

      UI.modal({
        title: 'Giải thích rủi ro — ' + ind.bank_code + ' (' + ind.year + ')',
        body,
        footer: [
          UI.h('button', { class: 'btn', onclick: function () { this.closest('.modal-back').remove(); } }, 'Đóng'),
          UI.h('button', { class: 'btn primary', onclick: function () { this.closest('.modal-back').remove(); APP.setHash({ bank: ind.bank_code }, 'bank'); } }, 'Mở hồ sơ ngân hàng →')
        ]
      });
    }

    renderTable();
    noteHost.append(UI.h('p', { class: 'muted' },
      'Chiều hướng dựa trên điểm nghiêm trọng của 3 kỳ gần nhất. Ngưỡng và điểm là [GIẢ ĐỊNH HỌC THUẬT – CẤU HÌNH ĐƯỢC] (PRD 9.4). Mỗi ngân hàng–năm chỉ có một bản ghi cảnh báo tổng hợp (PRD 9.5).'));
  }

  APP.registerView('alerts', { title: 'Trung tâm cảnh báo sớm', render });
})();
