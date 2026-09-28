/* ============================================================
   BANKRISK Intelligence — L3 Evidence · L8 Workflow · L10 Audit
   Demo store: localStorage, shape giống D1 (bảng br_*).
   Production: sync qua /api/evidence/* — engines phía client
   không đổi, chỉ thay lớp store.
   ============================================================ */
(function (global) {
  'use strict';
  const KEY = 'bankrisk_platform_v1';
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));

  const BRP = global.BRPLATFORM = {
    db: null,

    load() {
      try { this.db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { this.db = null; }
      if (!this.db || !this.db.evidence) { this.db = { evidence: [], workflow: {}, audit: [], persona: 'analyst' }; this.save(); }
      return this.db;
    },
    save() { localStorage.setItem(KEY, JSON.stringify(this.db)); },

    /* ---- Persona (L2 MVP) ---- */
    persona() { return this.db.persona; },
    setPersona(p) { this.db.persona = p; this.save(); },

    /* ---- Evidence (L3) ---- */
    evidence(bank) { return this.db.evidence.filter(e => !bank || e.bank_code === bank); },
    addEvidence(bank, file, meta) {
      const rec = {
        id: uid(), bank_code: bank.toUpperCase(), year: (meta && meta.year) || null,
        filename: file.name, mime: file.type || 'application/octet-stream',
        size_bytes: file.size, doc_type: (meta && meta.doc_type) || '',
        uploaded_by: this.db.persona, uploaded_at: new Date().toISOString()
      };
      this.db.evidence.unshift(rec);
      this.save();
      this.audit('upload', 'evidence', rec.id, { bank, filename: file.name });
      return rec;
    },
    removeEvidence(id) {
      this.db.evidence = this.db.evidence.filter(e => e.id !== id);
      this.save();
    },

    /* ---- Workflow xử lý cảnh báo (L8) ---- */
    workflowKey(bank, year, alertKey) { return bank + '|' + year + '|' + (alertKey || 'general'); },
    workflowStatus(bank, year, alertKey) {
      const k = this.workflowKey(bank, year, alertKey);
      return (this.db.workflow[k] && this.db.workflow[k].status) || 'todo';
    },
    setWorkflow(bank, year, alertKey, status, note) {
      const k = this.workflowKey(bank, year, alertKey);
      this.db.workflow[k] = { status, note: note || '', updated_at: new Date().toISOString() };
      this.save();
      this.audit('workflow', 'alert', k, { status, note: note || '' });
    },

    /* ---- Audit log (L10) ---- */
    audit(action, entity, entityId, detail) {
      this.db.audit.unshift({
        id: uid(), actor: 'user', persona: this.db.persona, action, entity, entity_id: entityId,
        detail_json: detail ? JSON.stringify(detail) : null, created_at: new Date().toISOString()
      });
      this.db.audit = this.db.audit.slice(0, 300);
      this.save();
    }
  };
  BRP.load();
})(typeof self !== 'undefined' ? self : window);
