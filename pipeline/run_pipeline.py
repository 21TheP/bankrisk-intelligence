# ============================================================
# BANKRISK Intelligence — Orchestrator (chạy 1 lệnh cho cả pipeline)
#   python pipeline/run_pipeline.py [--fallback sample-data.xlsx] [--skip-ingest]
# ============================================================
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import ingest  # noqa: E402
from features import compute_features, model_matrix  # noqa: E402
from train import train  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fallback", default=str(ROOT / "sample-data.xlsx"),
                    help="File CSV/XLSX dự phòng khi các API bị chặn")
    ap.add_argument("--skip-ingest", action="store_true",
                    help="Dùng lại models/raw_panel.csv có sẵn")
    ap.add_argument("--out", default=str(ROOT / "models"))
    a = ap.parse_args()
    out_dir = Path(a.out)

    if a.skip_ingest:
        raw = None
        source = "cached"
        print("[pipeline] bỏ qua ingest — dùng raw_panel.csv có sẵn")
    else:
        raw, source = ingest.ingest(a.fallback, out_path=out_dir / "raw_panel.csv")

    panel = compute_features(raw if raw is not None else __import__("pandas").read_csv(out_dir / "raw_panel.csv"))
    panel_path = out_dir / "panel_features.csv"
    panel.to_csv(panel_path, index=False, encoding="utf-8-sig")
    X, y = model_matrix(panel)
    print(f"[pipeline] features: {len(panel)} quan sát → {len(X)} dùng được "
          f"(RISK=1: {int(y.sum())} — {y.mean() * 100:.1f}%)")

    result = train(panel_path, out_dir, source)
    print(f"[pipeline] HOÀN TẤT — artefact v{result['version']} (nguồn dữ liệu: {source})")


if __name__ == "__main__":
    main()
