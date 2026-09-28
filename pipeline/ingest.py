# ============================================================
# BANKRISK Intelligence — Data Ingestion (Bước 1: Nguồn thu thập dữ liệu)
# ------------------------------------------------------------
# Chuỗi provider (thử lần lượt, dùng provider đầu tiên thành công):
#   1. vnstock / vnstock3 (nếu môi trường đã cài — có thể bị quarantine
#      trên PyPI theo thời điểm, xem https://pypi.org/project/vnstock/)
#   2. TCBS HTTP trực tiếp (không cần vnstock — cần IP tại Việt Nam)
#   3. VNDirect finad HTTP trực tiếp
#   4. File CSV/XLSX fallback (định dạng cột thô giống web app) — luôn chạy được,
#      bảo đảm training/export không bao giờ chết vì nguồn API bị chặn.
#
# Đầu ra: models/raw_panel.csv theo RAW_SCHEMA (khớp contract của js/core.js).
# ============================================================
from __future__ import annotations

import hashlib
import io
import sys
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import BANKS, GSO_INFLATION, RAW_SCHEMA  # noqa: E402

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
TIMEOUT = 25


# ------------------------------------------------------------
# Tiện ích chung
# ------------------------------------------------------------
def _empty_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=RAW_SCHEMA)


def _finish(df: pd.DataFrame, source: str) -> pd.DataFrame:
    """Chuẩn hoá khung thô: dtype, sắp xếp, fallback lạm phát GSO."""
    df = df.copy()
    if df.empty:
        print(f"[ingest] nguồn {source}: 0 quan sát")
        return df[RAW_SCHEMA] if list(df.columns) == RAW_SCHEMA else _empty_frame()
    for c in RAW_SCHEMA:
        if c not in df.columns:
            df[c] = None
    df["inflation"] = df.apply(
        lambda r: r["inflation"] if pd.notna(r.get("inflation"))
        else GSO_INFLATION.get(int(r["year"])) if pd.notna(r.get("year")) else None,
        axis=1)
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
    df = df.dropna(subset=["bank_code", "year"])
    df["bank_code"] = df["bank_code"].astype(str).str.upper().str.strip()
    df["year"] = df["year"].astype(int)
    df = df.drop_duplicates(subset=["bank_code", "year"], keep="last")
    df = df.sort_values(["bank_code", "year"]).reset_index(drop=True)
    print(f"[ingest] nguồn dùng: {source} — {len(df)} quan sát, "
          f"{df['bank_code'].nunique()} ngân hàng, "
          f"năm {df['year'].min()}–{df['year'].max()}")
    return df[RAW_SCHEMA]


def _sha256_of(df: pd.DataFrame) -> str:
    payload = df.fillna("").to_csv(index=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()[:16]


# ------------------------------------------------------------
# Provider 1 — vnstock / vnstock3
# ------------------------------------------------------------
def _pick(row: dict, candidates: list[str]):
    """Tra giá trị theo danh sách tên cột ứng viên (vi/en, nhiều biến thể)."""
    for k in candidates:
        if k in row and row[k] is not None and pd.notna(row[k]):
            return row[k]
    return None


def ingest_vnstock(banks: list[str] | None = None) -> pd.DataFrame:
    """Dùng vnstock (2.x: financial_ratio/financial_flow) hoặc vnstock3 (Vnstock().stock...).

    LƯU Ý: kết quả trả về chỉ gồm các chỉ tiêu API công bố. Với ngân hàng,
    TCBS công bố nhóm nợ 3–5 trong income_statement (revenue_quality_3/4/5);
    CAR thường KHÔNG có sẵn → để None cho web app tự xử (car_reported fallback
    hoặc đánh dấu thiếu). Đây là giới hạn minh bạch, không bịa số.
    """
    banks = banks or BANKS
    rows: list[dict] = []
    try:  # vnstock3 (3.x)
        from vnstock3 import Vnstock  # type: ignore
        mk = lambda sym: Vnstock().stock(symbol=sym, source="TCBS")  # noqa: E731
    except ImportError:
        try:  # vnstock (PyPI chính)
            from vnstock import Vnstock  # type: ignore
            mk = lambda sym: Vnstock().stock(symbol=sym, source="TCBS")  # noqa: E731
        except ImportError:
            print("[ingest] vnstock/vnstock3 không khả dụng — bỏ qua provider này")
            return _empty_frame()

    for sym in banks:
        try:
            st = mk(sym)
            bs = st.finance.balance_sheet(period="year", lang="en").to_dict("records")
            inc = st.finance.income_statement(period="year", lang="en").to_dict("records")
            is_map = {int(r.get("yearReport", r.get("year", 0))): r for r in inc}
            for b in bs:
                year = int(b.get("yearReport", b.get("year", 0)))
                i = is_map.get(year, {})
                rows.append({
                    "bank_code": sym,
                    "bank_name": b.get("shortName", sym),
                    "year": year,
                    "total_assets": _pick(b, ["TOTAL_ASSET", "totalAsset"]),
                    "equity": _pick(b, ["TOTAL_EQUITY", "totalEquity"]),
                    "gross_loans": _pick(b, ["trade_receivable", "grossLoan", "loan"]),
                    "total_deposits": _pick(b, ["customer_deposit", "totalDeposit", "deposit"]),
                    "profit_after_tax": _pick(i, ["net_profit", "netProfit"]),
                    "total_operating_income": _pick(i, ["revenue", "totalRevenue"]),
                    "net_interest_income": _pick(i, ["interest_income", "netInterestIncome",
                                                     "revenue"]),
                    "credit_risk_provision_expense": _pick(i, ["provision_expense", "provision"]),
                    "operating_expenses": _pick(i, ["operation_expense", "operatingExpense"]),
                    "group_3_loans": _pick(i, ["revenue_quality_3", "debt_group_3"]),
                    "group_4_loans": _pick(i, ["revenue_quality_4", "debt_group_4"]),
                    "group_5_loans": _pick(i, ["revenue_quality_5", "debt_group_5"]),
                    "bad_debts": _pick(i, ["bad_debt", "nonperforming"]),
                    "car_reported": _pick(b, ["car", "CAR"]),
                })
            print(f"[ingest] vnstock OK: {sym}")
        except Exception as e:  # noqa: BLE001 — API từng mã lỗi không chặn các mã khác
            print(f"[ingest] vnstock lỗi tại {sym}: {e}")
    return _finish(pd.DataFrame(rows), "vnstock")


# ------------------------------------------------------------
# Provider 2 — TCBS HTTP trực tiếp (không phụ thuộc vnstock)
# ------------------------------------------------------------
def ingest_tcbs_http(banks: list[str] | None = None) -> pd.DataFrame:
    banks = banks or BANKS
    rows: list[dict] = []
    for sym in banks:
        try:
            r = requests.get(
                f"https://apipubaws.tcbs.com.vn/stock-api/v1/stock/{sym}/financial-statement",
                params={"section": "BALANCE_SHEET"}, headers={"User-Agent": UA}, timeout=TIMEOUT)
            r.raise_for_status()
            years = r.json().get("data", {}).get("years", [])
            r2 = requests.get(
                f"https://apipubaws.tcbs.com.vn/stock-api/v1/stock/{sym}/financial-statement",
                params={"section": "INCOME_STATEMENT"}, headers={"User-Agent": UA}, timeout=TIMEOUT)
            r2.raise_for_status()
            inc = {int(x.get("year", 0)): x
                   for x in r2.json().get("data", {}).get("years", [])}
            for b in years:
                y = int(b.get("year", 0))
                i = inc.get(y, {})
                rows.append({
                    "bank_code": sym, "bank_name": sym, "year": y,
                    "total_assets": _pick(b, ["TOTAL_ASSET"]),
                    "equity": _pick(b, ["TOTAL_EQUITY"]),
                    "gross_loans": _pick(b, ["trade_receivable", "grossLoan"]),
                    "total_deposits": _pick(b, ["customer_deposit", "totalDeposit"]),
                    "profit_after_tax": _pick(i, ["net_profit"]),
                    "total_operating_income": _pick(i, ["revenue"]),
                    "net_interest_income": _pick(i, ["interest_income", "revenue"]),
                    "credit_risk_provision_expense": _pick(i, ["provision_expense"]),
                    "operating_expenses": _pick(i, ["operation_expense"]),
                    "group_3_loans": _pick(i, ["revenue_quality_3"]),
                    "group_4_loans": _pick(i, ["revenue_quality_4"]),
                    "group_5_loans": _pick(i, ["revenue_quality_5"]),
                })
        except Exception as e:  # noqa: BLE001
            print(f"[ingest] TCBS HTTP lỗi tại {sym}: {e}")
            break  # 403/geo-block của domain → bỏ nguyên provider
    return _finish(pd.DataFrame(rows), "tcbs-http")


# ------------------------------------------------------------
# Provider 3 — File CSV/XLSX fallback (contract = cột thô của web app)
# ------------------------------------------------------------
# Bảng ánh xạ header file nghiên cứu gốc → RAW_SCHEMA (khớp ALIASES trong js/core.js)
_FILE_ALIASES = {
    "bank_code": ["code", "bank_code", "symbol", "ma_ngan_hang", "ticker"],
    "bank_name": ["name", "bank_name", "ten_ngan_hang"],
    "year": ["year", "nam"],
    "total_assets": ["asset", "total_assets", "tong_tai_san"],
    "equity": ["equity", "von_chu_so_huu", "vcsh"],
    "regulatory_capital": ["regulatory_capital", "von_du_kien"],
    "risk_weighted_assets": ["risk_weighted_assets", "rwa"],
    "car_reported": ["car", "car_reported", "car_cong_bo"],
    "gross_loans": ["loan", "loant1", "gross_loans", "du_no_cho_vay", "du_no"],
    "group_3_loans": ["group_3_loans", "no_nhom_3", "nhom_3"],
    "group_4_loans": ["group_4_loans", "no_nhom_4", "nhom_4"],
    "group_5_loans": ["group_5_loans", "no_nhom_5", "nhom_5"],
    "bad_debts": ["Nonperforming", "bad_debts", "no_xau", "nonperforming"],
    "total_deposits": ["deposit", "total_deposits", "tien_gui"],
    "profit_after_tax": ["netprofit", "profit_after_tax", "loi_nhuan_sau_thue"],
    "total_operating_income": ["totalincome", "total_operating_income", "toi"],
    "net_interest_income": ["interest", "net_interest_income", "thu_nhap_lai_thuan"],
    "credit_risk_provision_expense": ["provisionloss", "credit_risk_provision_expense",
                                      "chi_phi_du_phong"],
    "operating_expenses": ["totalexpense", "operating_expenses", "chi_phi_hoat_dong"],
    "earning_assets": ["earning_assets", "tai_san_sinh_loi"],
    "inflation": ["infl", "inflation", "lam_phat"],
    "ownership_group": ["stateprivate", "ownership_group"],
}


def ingest_file(path: str | Path) -> pd.DataFrame:
    path = Path(path)
    if not path.exists():
        print(f"[ingest] file fallback không tồn tại: {path}")
        return _empty_frame()
    if path.suffix.lower() in (".xlsx", ".xls"):
        df = pd.read_excel(path, sheet_name=0)
    else:
        df = pd.read_csv(path)
    norm = {str(c).strip().lower(): c for c in df.columns}
    out: dict[str, list] = {c: [] for c in RAW_SCHEMA}
    for _, row in df.iterrows():
        rec: dict = {}
        for target, aliases in _FILE_ALIASES.items():
            val = None
            for a in aliases:
                col = norm.get(a.lower())
                if col is not None and pd.notna(row[col]):
                    val = row[col]
                    break
            rec[target] = None if val is None else _num(val)
        out_col = {c: rec.get(c) for c in RAW_SCHEMA}
        for c in RAW_SCHEMA:
            out[c].append(out_col[c])
    return _finish(pd.DataFrame(out), f"file:{path.name}")


_TEXT_COLS = {"bank_code", "bank_name", "ownership_group"}


def _num(v):
    if isinstance(v, str) and not v.replace(".", "").replace("-", "").replace(",", "").strip().isdigit():
        return v  # giá trị văn bản (mã NH, nhóm sở hữu) — giữ nguyên
    try:
        f = float(str(v).replace(",", "").replace(" ", ""))
        return f
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------
# Điều phối
# ------------------------------------------------------------
def ingest(fallback_file: str | Path | None = None,
           banks: list[str] | None = None,
           out_path: str | Path = "models/raw_panel.csv") -> tuple[pd.DataFrame, str]:
    """Chạy chuỗi provider; trả về (khung thô, source). Không raise — luôn có fallback file."""
    for provider, label in ((lambda: ingest_vnstock(banks), "vnstock"),
                            (lambda: ingest_tcbs_http(banks), "tcbs-http")):
        try:
            df = provider()
            if len(df):
                df.attrs["dataset_version"] = _sha256_of(df)
                _write(df, out_path)
                return df, label
        except Exception as e:  # noqa: BLE001
            print(f"[ingest] provider {label} lỗi: {e}")
    if fallback_file:
        df = ingest_file(fallback_file)
        if len(df):
            df.attrs["dataset_version"] = _sha256_of(df)
            _write(df, out_path)
            return df, f"file:{Path(fallback_file).name}"
    raise RuntimeError("Không có nguồn dữ liệu nào thành công (kể cả file fallback).")


def _write(df: pd.DataFrame, out_path: str | Path) -> None:
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"[ingest] đã ghi {out_path}")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--fallback", default="sample-data.xlsx")
    ap.add_argument("--out", default="models/raw_panel.csv")
    a = ap.parse_args()
    frame, src = ingest(a.fallback, out_path=a.out)
    print("SOURCE=" + src)
