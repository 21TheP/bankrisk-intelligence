-- BANKRISK Intelligence — D1 Schema (Cơ sở dữ liệu lưu trữ tuỳ chọn khi người dùng đồng ý)
-- Tuân thủ PRD v1.1 Mục 6 và SEC-13

CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  dataset_name TEXT NOT NULL,
  dataset_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  dq_score REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  privacy_consent INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bank_observations (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  year INTEGER NOT NULL,
  total_assets REAL,
  risk_weighted_assets REAL,
  regulatory_capital REAL,
  profit_after_tax REAL,
  total_operating_income REAL,
  net_interest_income REAL,
  gross_loans REAL,
  group_3_loans REAL,
  group_4_loans REAL,
  group_5_loans REAL,
  credit_risk_provision_expense REAL,
  operating_expenses REAL,
  inflation REAL,
  source_url TEXT,
  audited_status TEXT,
  car_reported REAL,
  UNIQUE(dataset_id, bank_code, year)
);

CREATE TABLE IF NOT EXISTS computed_indicators (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  bank_code TEXT NOT NULL,
  year INTEGER NOT NULL,
  size REAL,
  car REAL,
  car_source TEXT,
  roa REAL,
  roa_flag TEXT,
  niir REAL,
  npl REAL,
  dprr REAL,
  cir REAL,
  risk_label INTEGER,
  risk_partial INTEGER,
  fhs_score REAL,
  zscore REAL,
  risk_group TEXT,
  severity_score REAL,
  logit_prob REAL,
  xgb_prob REAL,
  ensemble_prob REAL,
  UNIQUE(dataset_id, bank_code, year)
);

CREATE TABLE IF NOT EXISTS model_registry (
  model_id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  training_date TEXT NOT NULL,
  auc REAL,
  f1 REAL,
  accuracy REAL,
  sensitivity REAL,
  specificity REAL,
  artifact_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bank_obs ON bank_observations(dataset_id, bank_code, year);
CREATE INDEX IF NOT EXISTS idx_comp_ind ON computed_indicators(dataset_id, bank_code, year);
