# ============================================================
# BANKRISK Intelligence — Feature Engineering (Bước 1.5)
# ------------------------------------------------------------
# Sao chép CHÍNH XÁC công thức tính 8 chỉ tiêu trong js/core.js
# (BR.computeIndicators, PRD Mục 7.3, F-01..F-06) để artefact huấn luyện
# bằng Python có thể suy luận bằng JS trong trình duyệt mà không lệch.
# ============================================================
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import FEATURES, LOGIT_FEATURES, RISK_CAR, RISK_NPL  # noqa: E402


def _pos(v) -> bool:
    return v is not None and pd.notna(v) and v > 0


def compute_features(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw.sort_values(["bank_code", "year"]).reset_index(drop=True)

    # Ghép tài sản năm trước (ROA/NIM dùng trung bình 2 năm — F-01)
    prev = df[["bank_code", "year", "total_assets"]].copy()
    prev["year"] = prev["year"] + 1
    prev = prev.rename(columns={"total_assets": "_prev_assets"})
    df = df.merge(prev, on=["bank_code", "year"], how="left")

    out = pd.DataFrame(index=df.index)
    out["bank_code"] = df["bank_code"]
    out["bank_name"] = df.get("bank_name", df["bank_code"])
    out["year"] = df["year"]

    # SIZE = ln(total_assets)  (F-06)
    ta = pd.to_numeric(df["total_assets"], errors="coerce")
    out["SIZE"] = np.where(ta > 0, np.log(ta.where(ta > 0)), np.nan)

    # CAR (7.3.3): computed | reported
    rc = pd.to_numeric(df["regulatory_capital"], errors="coerce")
    rwa = pd.to_numeric(df["risk_weighted_assets"], errors="coerce")
    car_rep = pd.to_numeric(df["car_reported"], errors="coerce")
    car_rep = np.where(car_rep > 1, car_rep / 100.0, car_rep)  # % hoặc thập phân
    out["CAR"] = np.where((rwa > 0) & rc.notna(), rc / rwa.where(rwa > 0),
                          np.where(car_rep > 0, car_rep, np.nan))
    out["car_source"] = np.where((rwa > 0) & rc.notna(), "computed",
                                 np.where(car_rep > 0, "reported", ""))

    # NPL = (nhóm 3 + 4 + 5) / dư nợ cho vay; fallback tổng nợ xấu (giống cleanRows C-*)
    gl = pd.to_numeric(df["gross_loans"], errors="coerce")
    g3 = pd.to_numeric(df["group_3_loans"], errors="coerce").fillna(0)
    g4 = pd.to_numeric(df["group_4_loans"], errors="coerce").fillna(0)
    g5 = pd.to_numeric(df["group_5_loans"], errors="coerce")
    bad = pd.to_numeric(df["bad_debts"], errors="coerce")
    npl_345 = (g3 + g4 + g5.where(g5.notna(), 0)) / gl.where(gl > 0)
    npl_bad = bad / gl.where(gl > 0)
    out["NPL"] = np.where(gl > 0,
                          np.where(g5.notna() | g3.notna() | g4.notna(),
                                   npl_345, np.where(bad.notna(), npl_bad, np.nan)),
                          np.nan)

    # ROA = lợi nhuận sau thuế / tài sản bình quân 2 năm (F-01)
    pat = pd.to_numeric(df["profit_after_tax"], errors="coerce")
    pa = pd.to_numeric(df["_prev_assets"], errors="coerce")
    avg2 = (ta + pa) / 2.0
    out["ROA"] = np.where((ta > 0) & pat.notna(),
                          np.where(pa > 0, pat / avg2.where(avg2 > 0),
                                   pat / ta.where(ta > 0)), np.nan)
    out["roa_flag"] = np.where((ta > 0) & pat.notna() & (pa <= 0),
                               "roa_end_of_period", "")

    # NIIR / DPRR / CIR (F-04) — mẫu số total_operating_income ≠ 0
    toi = pd.to_numeric(df["total_operating_income"], errors="coerce")
    nii = pd.to_numeric(df["net_interest_income"], errors="coerce")
    prov = pd.to_numeric(df["credit_risk_provision_expense"], errors="coerce")
    opex = pd.to_numeric(df["operating_expenses"], errors="coerce")
    safe_toi = toi.where(toi != 0)
    out["NIIR"] = (safe_toi - nii) / safe_toi
    out["DPRR"] = prov / safe_toi
    out["CIR"] = opex / safe_toi

    # INF = lạm phát thập phân (F-02) — chấp nhận cả dạng % lẫn thập phân
    infl = pd.to_numeric(df["inflation"], errors="coerce")
    infl_pct = np.where(infl >= 1, infl, infl * 100.0)  # chuẩn hoá về %
    out["INF"] = infl_pct / 100.0

    # Nhãn RISK (F-03): NPL > 3% ∨ CAR < 8%
    npl_bad_flag = out["NPL"] > RISK_NPL
    car_bad_flag = out["CAR"] < RISK_CAR
    both_na = out["NPL"].isna() & out["CAR"].isna()
    out["RISK"] = np.where(both_na, np.nan, ((npl_bad_flag | car_bad_flag) & ~both_na).astype(float))
    out["risk_partial"] = (out["NPL"].isna() | out["CAR"].isna()) & ~both_na

    return out


def model_matrix(panel: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """Ma trận X (8 biến theo thứ tự FEATURES) và nhãn y; loại dòng thiếu."""
    cols = FEATURES + ["RISK"]
    m = panel[cols].copy()
    m = m.replace([np.inf, -np.inf], np.nan).dropna()
    m["RISK"] = m["RISK"].astype(int)
    return m[FEATURES], m["RISK"]


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "models/raw_panel.csv"
    dst = sys.argv[2] if len(sys.argv) > 2 else "models/panel_features.csv"
    raw = pd.read_csv(src)
    panel = compute_features(raw)
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    panel.to_csv(dst, index=False, encoding="utf-8-sig")
    X, y = model_matrix(panel)
    print(f"[features] {len(panel)} quan sát → {len(X)} dùng được cho mô hình "
          f"(RISK=1: {int(y.sum())} — {y.mean() * 100:.1f}%)")
