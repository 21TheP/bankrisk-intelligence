-- ============================================================
-- BANKRISK Intelligence — nâng cấp theo kiến trúc 10 lớp (MVP)
-- L3 Evidence: tài liệu chứng minh theo ngân hàng (file thật ở R2)
-- L8 Workflow: trạng thái xử lý cảnh báo sớm
-- L10 Audit log: mọi hành động ghi vết
-- ============================================================

CREATE TABLE IF NOT EXISTS br_evidence (
  id TEXT PRIMARY KEY,
  bank_code TEXT NOT NULL,
  year INTEGER,
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime TEXT,
  size_bytes INTEGER,
  doc_type TEXT,
  uploaded_by TEXT,
  uploaded_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS br_workflow (
  id TEXT PRIMARY KEY,
  bank_code TEXT NOT NULL,
  year INTEGER,
  alert_key TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'processing', 'done', 'dismissed')),
  assignee TEXT,
  note TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS br_audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT,
  persona TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  detail_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_br_ev_bank ON br_evidence(bank_code);
CREATE INDEX IF NOT EXISTS idx_br_wf_bank ON br_workflow(bank_code);
