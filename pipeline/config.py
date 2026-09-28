# BANKRISK Intelligence — Auto Model Pipeline configuration
# Đồng bộ với js/core.js (BR.REQUIRED_COLS, BR.THRESHOLDS, BR.GSO_INFLATION).

# 8 biến đầu vào của mô hình (artifact.input_schema) — THỨ TỰ KHÔNG ĐƯỢC ĐỔI
FEATURES = ["SIZE", "CAR", "ROA", "NIIR", "NPL", "DPRR", "CIR", "INF"]

# 7 biến của mô hình Logit (không có INF — khớp Bảng 4.3 của báo cáo gốc)
LOGIT_FEATURES = ["SIZE", "CAR", "ROA", "NIIR", "NPL", "DPRR", "CIR"]

# Quy tắc nhãn RISK (F-03) — nguyên tắc nghiên cứu, không đổi
RISK_NPL = 0.03   # NPL > 3%
RISK_CAR = 0.08   # CAR < 8%

# Danh sách mã ngân hàng mặc định khi kéo từ API (bổ sung khi cần)
BANKS = [
    "ACB", "BAB", "BID", "BVB", "CTG", "EIB", "HDB", "HPG", "KLB", "LPB",
    "MBB", "MSB", "NVB", "OCB", "PGB", "SGB", "SHB", "SSB", "STB", "TCB",
    "TPB", "VCB", "VIB", "VPB",
]

# Lạm phát Việt Nam theo năm (GSO) — fallback khi dữ liệu thô thiếu cột inflation
GSO_INFLATION = {
    2014: 4.09, 2015: 0.63, 2016: 2.67, 2017: 3.53, 2018: 3.54,
    2019: 2.79, 2020: 3.23, 2021: 1.84, 2022: 3.15, 2023: 3.25, 2024: 3.63,
}

# Schema trung gian của pipeline = schema cột thô của web app (js/core.js REQUIRED_COLS).
# Mọi provider (vnstock / HTTP / file) đều được quy về schema này trước khi tính features.
RAW_SCHEMA = [
    "bank_code", "bank_name", "year",
    "total_assets", "equity", "regulatory_capital", "risk_weighted_assets",
    "car_reported", "gross_loans", "group_3_loans", "group_4_loans", "group_5_loans",
    "bad_debts", "total_deposits", "profit_after_tax", "total_operating_income",
    "net_interest_income", "credit_risk_provision_expense", "operating_expenses",
    "earning_assets", "inflation", "ownership_group",
]

# Thư mục xuất artefact (tương đối so với gốc repo)
MODELS_DIR = "models"
