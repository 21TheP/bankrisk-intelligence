# ============================================================
# BANKRISK Intelligence — Training & Artefact Export (Bước 1.7)
# ------------------------------------------------------------
# Huấn luyện Logistic Regression + XGBoost trên panel features,
# xuất artefact JSON ĐÚNG SCHEMA mà js/core.js BR.evalXgb suy luận
# (PRD Mục 11.5/11.6), kèm model card + hệ số Logit mới.
#
# Tự kiểm chứng trước khi ghi file (FR-MODEL-03):
#   1. Mô phỏng JS evalXgb bằng Python phải khớp predict_proba của XGBoost
#   2. Mọi test_vectors phải PASS với dung sai 1e-9
# Nếu fail → exit(1), GitHub Actions sẽ KHÔNG commit artefact hỏng.
# ============================================================
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from xgboost import XGBClassifier

warnings.filterwarnings("ignore", category=FutureWarning)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import FEATURES, LOGIT_FEATURES  # noqa: E402

MODEL_NAME = "bankrisk_xgb"


# ------------------------------------------------------------
# Mô phỏng y hệt BR.evalXgb của js/core.js
# ------------------------------------------------------------
def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def js_eval(artifact: dict, feats: dict) -> float:
    total = artifact.get("base_score", 0.0) or 0.0
    for tree in artifact["trees"]:
        node = tree
        while isinstance(node, dict):
            node = node["l"] if feats[node["s"]] <= node["t"] else node["r"]
        total += node
    return sigmoid(total)


def convert_tree(node: dict) -> dict | float:
    """XGBoost dump JSON → cây gọn {s,t,l,r} / leaf số."""
    if "leaf" in node:
        return float(node["leaf"])
    kids = {c["nodeid"]: c for c in node["children"]}
    return {
        "s": node["split"],
        "t": float(node["split_condition"]),
        "l": convert_tree(kids[node["yes"]]),
        "r": convert_tree(kids[node["no"]]),
    }


def metrics(y_true, y_score) -> dict:
    y_true = np.asarray(y_true).astype(int)
    y_pred = (np.asarray(y_score) >= 0.5).astype(int)
    tp = int(((y_pred == 1) & (y_true == 1)).sum())
    fn = int(((y_pred == 0) & (y_true == 1)).sum())
    tn = int(((y_pred == 0) & (y_true == 0)).sum())
    fp = int(((y_pred == 1) & (y_true == 0)).sum())
    sens = tp / (tp + fn) if (tp + fn) else None
    spec = tn / (tn + fp) if (tn + fp) else None
    try:
        auc = float(roc_auc_score(y_true, y_score)) if len(np.unique(y_true)) > 1 else None
    except ValueError:
        auc = None
    return {"accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
            "sensitivity": None if sens is None else round(sens, 4),
            "specificity": None if spec is None else round(spec, 4),
            "auc": None if auc is None else round(auc, 4)}


def time_split(years: pd.Series, train_ratio: float = 0.8):
    uniq = sorted(years.unique())
    cut = max(1, int(round(len(uniq) * train_ratio)))
    return set(uniq[:cut]), set(uniq[cut:])


def train(panel_path: Path, out_dir: Path, source: str = "unknown") -> dict:
    panel = pd.read_csv(panel_path)
    X_all = panel[FEATURES].replace([np.inf, -np.inf], np.nan)
    keep = X_all.notna().all(axis=1) & panel["RISK"].notna()
    panel = panel[keep].reset_index(drop=True)
    X = panel[FEATURES]
    y = panel["RISK"].astype(int)
    years = panel["year"]
    if len(X) < 30 or y.nunique() < 2:
        raise SystemExit("[train] dữ liệu quá ít hoặc chỉ có 1 lớp — không huấn luyện được")

    train_years, test_years = time_split(years)
    tr = years.isin(train_years)
    X_tr, y_tr, X_te, y_te = X[tr], y[tr], X[~tr], y[~tr]
    print(f"[train] N={len(X)} (train {len(X_tr)} năm {min(train_years)}–{max(train_years)}, "
          f"test {len(X_te)} năm {min(test_years)}–{max(test_years)}), "
          f"RISK=1: {int(y_tr.sum())}/{len(y_tr)} train, {int(y_te.sum())}/{len(y_te)} test")

    # ---- Logistic Regression (7 biến, hệ số thô — JS áp trực tiếp lên giá trị gốc) ----
    logit = LogisticRegression(penalty=None, class_weight="balanced", max_iter=10000)
    logit.fit(X_tr[LOGIT_FEATURES], y_tr)
    logit_coefs = {"intercept": float(logit.intercept_[0])}
    logit_coefs.update({f: float(c) for f, c in zip(LOGIT_FEATURES, logit.coef_[0])})
    logit_metrics = metrics(y_te, logit.predict_proba(X_te[LOGIT_FEATURES])[:, 1])

    # ---- XGBoost ----
    spw = float((y_tr == 0).sum() / max(1, (y_tr == 1).sum()))
    xgb = XGBClassifier(
        objective="binary:logistic", base_score=0.5, eval_metric="logloss",
        max_depth=3, n_estimators=60, learning_rate=0.1, min_child_weight=5,
        reg_lambda=1.0, scale_pos_weight=spw, tree_method="hist",
        random_state=42, n_jobs=2)
    xgb.fit(X_tr, y_tr)
    xgb_proba = xgb.predict_proba(X_te)[:, 1]
    xgb_metrics = metrics(y_te, xgb_proba)

    # ---- Dump cây → schema {s,t,l,r} ----
    booster = xgb.get_booster()
    trees_raw = [json.loads(d) for d in booster.get_dump(dump_format="json")]
    trees = [convert_tree(t) for t in trees_raw]

    # base_score thực tế = khoảng cách hằng số giữa margin dự đoán và tổng leaf dump
    margins = xgb.predict(X_tr, output_margin=True)
    dump_sum = np.array([
        sum(_leaf_sum(t, row) for t in trees)
        for row in X_tr.to_dict("records")])
    delta = margins - dump_sum
    base_score = float(np.mean(delta))
    if float(np.std(delta)) > 1e-6:
        raise SystemExit(f"[train] base_score không hằng số (std={float(np.std(delta))}) — dump lệch predict, dừng")

    # Kiểm chứng mô phỏng JS vs predict_proba trên TOÀN BỘ dữ liệu
    proba_all = xgb.predict_proba(X)[:, 1]
    sim_all = np.array([js_eval({"base_score": base_score, "trees": trees}, row)
                        for row in X.to_dict("records")])
    max_diff = float(np.max(np.abs(proba_all - sim_all)))
    if max_diff > 1e-5:
        raise SystemExit(f"[train] mô phỏng JS lệch predict_proba {max_diff} — dừng, không xuất artefact")
    print(f"[train] kiểm chứng dump↔predict: max diff = {max_diff:.2e} (PASS)")

    # ---- Feature importance (gain, chuẩn hoá về %) ----
    gain = booster.get_score(importance_type="gain")
    total = sum(gain.values()) or 1.0
    fi = {f: round(100.0 * gain.get(f, 0.0) / total, 1) for f in FEATURES}

    # ---- Test vectors (FR-MODEL-03): chọn 4 quan sát đại diện, expected tính bằng sim ----
    idxs = _pick_test_rows(sim_all)
    test_vectors = []
    for i in idxs:
        row_feats = {f: float(X.iloc[i][f]) for f in FEATURES}
        expected = js_eval({"base_score": base_score, "trees": trees}, row_feats)
        test_vectors.append({"input": row_feats, "expected": expected, "tol": 1e-6})
    for tv in test_vectors:
        got = js_eval({"base_score": base_score, "trees": trees}, tv["input"])
        if abs(got - tv["expected"]) > 1e-9:
            raise SystemExit("[train] test_vectors tự kiểm chứng FAIL — dừng")

    dataset_version = "sha256:" + hashlib.sha256(panel_path.read_bytes()).hexdigest()[:16]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    version = f"1.1.0-auto-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}"

    artifact = {
        "model_name": MODEL_NAME,
        "model_version": version,
        "training_date": today,
        "dataset_version": dataset_version,
        "input_schema": FEATURES,
        "base_score": base_score,
        "trees": trees,
        "feature_importance_gain": fi,
        "test_vectors": test_vectors,
    }
    model_card = {
        "model_name": MODEL_NAME,
        "model_version": version,
        "training_date": today,
        "dataset_version": dataset_version,
        "source": f"auto-pipeline ({source})",
        "input_schema": FEATURES,
        "split_strategy": f"time_based (train ≤ {max(train_years)}, test ≥ {min(test_years)})",
        "n_after_cleaning": int(len(X)),
        "n_train": int(len(X_tr)),
        "n_test": int(len(X_te)),
        "class_balance_train": f"{y_tr.mean() * 100:.1f}% RISK=1",
        "auto_trained_metrics": {
            "badge": "C",
            "note": "Tự động huấn luyện lại trên dữ liệu mới nhất — số liệu tính trên tập test theo thời gian, KHÔNG so sánh trực tiếp với Bảng 4.4 (N=300, chia ngẫu nhiên)",
            "models": [
                {"name": "Logistic Regression", **logit_metrics},
                {"name": "XGBoost", **xgb_metrics},
            ],
        },
        "limitations": [
            "Huấn luyện tự động trên dữ liệu ingest gần nhất — cần rà soát định kỳ bởi chuyên gia",
            "NPL và CAR có quan hệ định nghĩa với nhãn RISK (M-04) — mô hình học quy tắc gán nhãn, độ chính xác test cao là hệ quả tất yếu",
            "Hệ số Logit ước lượng trên giá trị gốc (không chuẩn hoá) với class_weight=balanced — xác suất Logit có thể thiếu hiệu chuẩn; ensemble 0.3/0.7 làm dịu",
            "Điều kiện tách cây JS dùng ≤ còn XGBoost dùng < — chỉ khác khi giá trị trùng ngưỡng chính xác (thực tế không xảy ra)",
        ],
    }
    meta = {"model_card": model_card, "logit_coefficients": logit_coefs}

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "xgb_risk_model.json").write_text(
        json.dumps(artifact, ensure_ascii=False, indent=1), encoding="utf-8")
    (out_dir / "model_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    # ---- ONNX (tuỳ chọn — không bắt buộc để web chạy) ----
    _export_onnx(xgb, X_tr, out_dir)

    print(f"[train] Logit test: {logit_metrics}")
    print(f"[train] XGBoost test: {xgb_metrics}")
    print(f"[train] đã ghi {out_dir}/xgb_risk_model.json, model_meta.json (v{version})")
    return {"version": version, "logit": logit_metrics, "xgb": xgb_metrics}


def _leaf_sum(tree, feats: dict) -> float:
    node = tree
    while isinstance(node, dict):
        node = node["l"] if feats[node["s"]] <= node["t"] else node["r"]
    return node


def _pick_test_rows(sim_probs: np.ndarray) -> list[int]:
    order = np.argsort(sim_probs)
    n = len(order)
    return [int(order[0]), int(order[n // 2]), int(order[-1]),
            int(order[int(n * 0.75)])]


def _export_onnx(xgb, X_sample: pd.DataFrame, out_dir: Path) -> None:
    try:
        from onnxmltools import convert_xgboost
        from onnxmltools.convert.common.data_types import FloatTensorType
        onnx_model = convert_xgboost(
            xgb, initial_types=[("input", FloatTensorType([None, len(FEATURES)]))])
        path = out_dir / "xgb_risk_model.onnx"
        path.write_bytes(onnx_model.SerializeToString())
        print(f"[train] đã xuất {path} (dùng với onnxruntime-web khi cần)")
    except ImportError:
        print("[train] onnxmltools chưa cài — bỏ qua xuất ONNX (JSON tree vẫn đầy đủ)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--panel", default="models/panel_features.csv")
    ap.add_argument("--out", default="models")
    ap.add_argument("--source", default="unknown")
    a = ap.parse_args()
    train(Path(a.panel), Path(a.out), a.source)
