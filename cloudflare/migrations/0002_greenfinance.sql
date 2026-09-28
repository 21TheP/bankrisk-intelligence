-- ============================================================
-- GREENFINANCE MVP — Bước 2: schema D1 cho nền tảng Green Credit
-- Áp 10 lớp kiến trúc: tenant (L2), application + activity (L3),
-- carbon results (L4), green score (L5), ai insights (L6),
-- finance readiness + loan match (L7), decision pipeline (L8),
-- impact monitoring (L9), audit log (L10).
-- Evidence files nằm ở R2 (binding EVIDENCE), D1 chỉ lưu metadata.
-- ============================================================

-- L2: Tenant (doanh nghiệp / ngân hàng)
CREATE TABLE IF NOT EXISTS gf_tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('enterprise', 'bank')),
  industry TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- L3: Hồ sơ vay xanh + dữ liệu hoạt động thu thập
CREATE TABLE IF NOT EXISTS gf_applications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  enterprise_name TEXT NOT NULL,
  industry TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected')),
  reporting_year INTEGER,
  -- dữ liệu thu thập (L3) — đơn vị chuẩn hoá
  electricity_kwh REAL DEFAULT 0,        -- điện mua lưới (Scope 2)
  renewable_kwh REAL DEFAULT 0,          -- điện tái tạo tự sản xuất
  fuel_liters REAL DEFAULT 0,            -- xăng/dầu/diesel (Scope 1)
  fuel_type TEXT DEFAULT 'diesel',
  gas_kg REAL DEFAULT 0,                 -- khí đốt/LPG (Scope 1)
  waste_tons REAL DEFAULT 0,             -- chất thải rắn (Scope 3)
  recycled_pct REAL DEFAULT 0,           -- % tái chế
  water_m3 REAL DEFAULT 0,
  revenue_vnd REAL DEFAULT 0,            -- doanh thu (cường độ carbon)
  employees INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- L4: Kết quả Carbon Engine (snapshot mỗi lần tính — versioned)
CREATE TABLE IF NOT EXISTS gf_carbon_results (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  factor_version TEXT NOT NULL,
  scope1_tco2e REAL, scope2_tco2e REAL, scope3_tco2e REAL, total_tco2e REAL,
  intensity_kgco2_per_vnd REAL,
  breakdown_json TEXT,
  computed_at TEXT DEFAULT (datetime('now'))
);

-- L5: Green Score + taxonomy
CREATE TABLE IF NOT EXISTS gf_scores (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  green_score REAL,
  taxonomy_eligible INTEGER,
  data_quality REAL,
  criteria_json TEXT,
  computed_at TEXT DEFAULT (datetime('now'))
);

-- L6: AI Engine insights (OCR/extraction/anomaly/recommendation)
CREATE TABLE IF NOT EXISTS gf_ai_insights (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('extraction', 'anomaly', 'recommendation', 'whatif')),
  payload_json TEXT NOT NULL,
  model TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- L7: Finance readiness + matching sản phẩm vay xanh
CREATE TABLE IF NOT EXISTS gf_readiness (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  readiness_score REAL,
  suggested_product TEXT,
  matched_json TEXT,
  computed_at TEXT DEFAULT (datetime('now'))
);

-- L8: Quyết định của ngân hàng (pipeline)
CREATE TABLE IF NOT EXISTS gf_decisions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  reviewer TEXT,
  action TEXT NOT NULL CHECK (action IN ('submit', 'start_review', 'request_info', 'approve', 'reject')),
  comment TEXT,
  risk_flags_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- L9: Impact monitoring (baseline vs hiện tại)
CREATE TABLE IF NOT EXISTS gf_impact (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  total_tco2e REAL,
  renewable_pct REAL,
  intensity_kgco2_per_vnd REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- L10: Audit log
CREATE TABLE IF NOT EXISTS gf_audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  detail_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Evidence metadata (file thật nằm trong R2: gf-evidence/<application_id>/<filename>)
CREATE TABLE IF NOT EXISTS gf_evidence (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime TEXT,
  size_bytes INTEGER,
  ocr_status TEXT DEFAULT 'pending' CHECK (ocr_status IN ('pending', 'done', 'failed', 'skipped')),
  uploaded_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gf_app_tenant ON gf_applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gf_carbon_app ON gf_carbon_results(application_id);
CREATE INDEX IF NOT EXISTS idx_gf_scores_app ON gf_scores(application_id);
CREATE INDEX IF NOT EXISTS idx_gf_dec_app ON gf_decisions(application_id);
