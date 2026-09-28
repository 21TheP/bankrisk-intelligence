/* ============================================================
   BANKRISK Intelligence — L3 Evidence · L8 Workflow · L10 Audit
   Đính kèm tài liệu theo ngân hàng, quản lý trạng thái xử lý
   cảnh báo sớm, xem audit log. (Demo store: localStorage; API R2
   sẵn sàng trong cloudflare/worker.js.)
   ============================================================ */
(function () {
  'use strict';
  const UI = window.BRUI, APP = window.APP, BRP = window.BRPLATFORM;

  function render(root) {
    const st = APP.state;
    const wrap = UI.h('div');
    root.append(wrap);
    wrap.append(UI.h('div', { class: 'flex mb' },
      UI.h('h2', { style: { margin: 0, fontSize: '16px', color: 'var(--navy)' } }, 'Bằng chứng & Quy trình xử lý'),
      UI.h('span', { class: 'chip neutral', title: 'L2 Identity MVP — persona lưu localStorage; production dùng Clerk/Supabase Auth' },
        'Persona: ' + (BRP.persona() === 'supervisor' ? 'Giám sát' : 'Phân tích')),
      UI.h('span', { class: 'spacer' }),
      UI.h('button', { class: 'btn small', onclick: () => {
        BRP.setPersona(BRP.persona() === 'supervisor' ? 'analyst' : 'supervisor');
        APP.render();
      } }, '⇄ Đổi persona')));

    if (!st.indicators.length) { wrap.append(UI.emptyState('Chưa có dữ liệu.')); return; }

    const banks = APP.banks();
    const cur = banks.some(b => b.bank_code === st.bank) ? st.bank : banks[0].bank_code;
    const selBank = UI.dropdown({
      options: banks.map(b => ({ value: b.bank_code, label: b.bank_code + ' — ' + b.bank_name })),
      value: cur, onChange: v => { st.bank = v; APP.setHash({ bank: v }); }
    });

    /* ---- L3: Evidence theo ngân hàng ---- */
    const evCard = UI.h('div', { class: 'card mb' },
      UI.h('div', { class: 'flex mb' },
        UI.h('h3', { style: { margin: 0 } }, 'Tài liệu chứng minh'),
        selBank,
        UI.h('span', { class: 'spacer' }),
        UI.h('span', { class: 'muted' }, 'BCTC, hóa đơn, biên bản họp HĐQT… gắn với từng ngân hàng/kỳ')));
    const fileInput = UI.h('input', { type: 'file', style: { display: 'none' },
      onchange: e => {
        const f = e.target.files[0];
        if (!f) return;
        const year = prompt('Gắn với kỳ năm (bỏ trống nếu không theo kỳ):', String(st.year || ''));
        BRP.addEvidence(cur, f, { year: year ? +year : null, doc_type: '' });
        UI.toast('Đã lưu tài liệu (demo localStorage). Production: R2 qua /api/evidence.', 'ok');
        APP.render();
      } });
    evCard.append(fileInput, UI.h('button', { class: 'btn small', onclick: () => fileInput.click() }, '📎 Tải tệp lên'));
    const evs = BRP.evidence(cur);
    evs.forEach(e => {
      evCard.append(UI.h('div', { class: 'evidence-row' },
        '📄 ' + e.filename,
        UI.h('span', { class: 'muted' }, (e.size_bytes / 1024).toFixed(0) + ' KB · ' + (e.year ? 'kỳ ' + e.year + ' · ' : '') + new Date(e.uploaded_at).toLocaleString('vi-VN')),
        UI.h('span', { class: 'spacer' }),
        BRP.persona() === 'supervisor' ? null :
          UI.h('button', { class: 'btn small', onclick: () => { BRP.removeEvidence(e.id); APP.render(); } }, '✕')));
    });
    if (!evs.length) evCard.append(UI.h('p', { class: 'muted' }, 'Chưa có tài liệu cho ' + cur + '.'));
    wrap.append(evCard);

    /* ---- L8: Workflow xử lý cảnh báo ---- */
    const wfCard = UI.h('div', { class: 'card mb' },
      UI.h('h3', {}, 'Quy trình xử lý cảnh báo sớm — ' + cur + ' · kỳ ' + st.year));
    const inds = st.indicators.filter(i => i.bank_code === cur && i.year === st.year);
    if (!inds.length) {
      wfCard.append(UI.emptyState('Không có cảnh báo cho kỳ này.'));
    } else {
      const ind = inds[0];
      const reasons = (ind.reasons && ind.reasons.length) ? ind.reasons : [{ rule: 'Theo dõi định kỳ', var: null, value: null }];
      wfCard.append(UI.table(['Tín hiệu', 'Giá trị', 'Trạng thái xử lý', 'Cập nhật'],
        reasons.map(r => {
          const key = r.rule;
          const status = BRP.workflowStatus(cur, st.year, key);
          const statusChip = UI.h('span', { class: 'status-chip ' + wfCls(status) }, wfLabel(status));
          return {
            cells: [
              UI.h('b', {}, r.rule),
              r.var ? (r.var === 'CAR' || r.var === 'NPL' || r.var === 'ROA' ? BR.fmtPct(r.value) : BR.fmtNum(r.value, 1)) : '—',
              BRP.persona() === 'supervisor'
                ? statusChip
                : UI.dropdown({
                    options: [
                      { value: 'todo', label: 'Chờ xử lý' }, { value: 'processing', label: 'Đang xử lý' },
                      { value: 'done', label: 'Đã xử lý' }, { value: 'dismissed', label: 'Bỏ qua' }
                    ],
                    value: status,
                    onChange: v => { BRP.setWorkflow(cur, st.year, key, v); UI.toast('Đã cập nhật: ' + key + ' → ' + wfLabel(v), 'ok'); APP.render(); }
                  }),
              workflowTime(cur, st.year, key)
            ]
          };
        })));
      wfCard.append(UI.h('p', { class: 'muted' }, 'Persona "Giám sát" chỉ xem — quyền sửa thuộc "Phân tích". Production: RBAC thật qua Clerk/Supabase Auth.'));
    }
    wrap.append(wfCard);

    /* ---- L10: Audit log ---- */
    const logCard = UI.h('div', { class: 'card mb' }, UI.h('h3', {}, 'Audit log (L10)'));
    const logs = BRP.db.audit.slice(0, 20);
    logCard.append(logs.length
      ? UI.table(['Thời gian', 'Persona', 'Hành động', 'Đối tượng', 'Chi tiết'],
        logs.map(l => ({
          cells: [new Date(l.created_at).toLocaleString('vi-VN'), l.persona || '—', l.action, l.entity + ' ' + (l.entity_id || '').slice(0, 24),
            l.detail_json ? UI.h('span', { class: 'muted', style: { fontSize: '11px' } }, l.detail_json.slice(0, 60)) : '—']
        })), { maxHeight: '280px' })
      : UI.h('p', { class: 'muted' }, 'Chưa có hoạt động.'));
    wrap.append(logCard);

    function wfLabel(s) { return { todo: 'Chờ xử lý', processing: 'Đang xử lý', done: 'Đã xử lý', dismissed: 'Bỏ qua' }[s] || s; }
    function wfCls(s) { return { todo: 'draft', processing: 'under_review', done: 'approved', dismissed: 'rejected' }[s] || 'draft'; }
    function workflowTime(bank, year, key) {
      const k = BRP.workflowKey(bank, year, key);
      const w = BRP.db.workflow[k];
      return w ? new Date(w.updated_at).toLocaleString('vi-VN') : '—';
    }
  }

  APP.registerView('evidence', { title: 'Bằng chứng & Quy trình', render });
})();
