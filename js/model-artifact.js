/* ============================================================
   BANKRISK Intelligence — Artefact mô hình DEMO
   ------------------------------------------------------------
   QUAN TRỌNG (minh bạch học thuật):
   - Đây là MÔ HÌNH MINH HOẠ (model v1.0.0-demo) gồm các cây quyết
     định được nhóm dự án dựng thủ công để chạy suy luận phía trình
     duyệt, KHÔNG phải mô hình XGBoost thật được huấn luyện trên
     dữ liệu N=300 của nghiên cứu gốc.
   - Khi nhóm có artefact thật từ Colab, thay thế tệp này bằng
     model_xgb_v1.json + model_card_v1.json + test_vectors_v1.json
     theo đúng schema bên dưới (PRD Mục 11.5).
   - Bảng "Kết quả nghiên cứu" trong model card là số nguyên văn
     từ Bảng 4.4 của báo cáo gốc — huy hiệu A, không suy diễn.
   ============================================================ */
(function (global) {
  'use strict';
  const M = global.BRMODEL = {};

  M.artifact = {
    model_name: 'bankrisk_xgb_demo',
    model_version: '1.0.0-demo',
    training_date: '2026-09-19',
    dataset_version: 'sha256:demo-dataset-2014-2024',
    input_schema: ['SIZE', 'CAR', 'ROA', 'NIIR', 'NPL', 'DPRR', 'CIR', 'INF'],
    base_score: 0.0,
    trees: [
      { s: 'NPL', t: 0.03, l: { s: 'NPL', t: 0.012, l: -0.5, r: 0.25 }, r: { s: 'NPL', t: 0.10, l: 0.9, r: 1.6 } },
      { s: 'CAR', t: 0.08, l: { s: 'CAR', t: 0.06, l: 0.60, r: 0.35 }, r: { s: 'CAR', t: 0.09, l: 0.05, r: -0.35 } },
      { s: 'ROA', t: 0.004, l: 0.20, r: { s: 'ROA', t: 0.008, l: -0.05, r: -0.25 } },
      { s: 'NPL', t: 0.10, l: { s: 'NPL', t: 0.01, l: -0.30, r: { s: 'NPL', t: 0.05, l: -0.05, r: 0.35 } }, r: 1.20 },
      { s: 'DPRR', t: 0.30, l: { s: 'DPRR', t: 0.08, l: -0.25, r: { s: 'DPRR', t: 0.15, l: -0.05, r: 0.05 } }, r: 0.50 },
      { s: 'CIR', t: 0.70, l: { s: 'CIR', t: 0.45, l: -0.25, r: { s: 'CIR', t: 0.60, l: 0.00, r: 0.20 } }, r: 0.45 },
      { s: 'CAR', t: 0.075, l: 0.90, r: { s: 'CAR', t: 0.10, l: -0.05, r: -0.35 } },
      { s: 'NPL', t: 0.025, l: -0.15, r: 0.10 },
      { s: 'SIZE', t: 12.0, l: 0.20, r: { s: 'SIZE', t: 14.0, l: -0.10, r: -0.25 } },
      { s: 'NIIR', t: 0.05, l: 0.30, r: { s: 'NIIR', t: 0.35, l: -0.05, r: -0.10 } },
      { s: 'INF', t: 0.04, l: -0.05, r: 0.10 },
      { s: 'ROA', t: -0.02, l: 0.60, r: { s: 'ROA', t: 0.0, l: 0.30, r: -0.15 } }
    ],
    feature_importance_gain: {
      NPL: 31.4, CAR: 24.8, ROA: 14.2, DPRR: 9.6, CIR: 7.1, SIZE: 5.3, NIIR: 5.1, INF: 2.5
    },
    test_vectors: [
      { input: { SIZE: 14.47, CAR: 0.1195, ROA: 0.017, NIIR: 0.25, NPL: 0.0095, DPRR: 0.05, CIR: 0.38, INF: 0.0325 }, expected: 0.05215356, tol: 1e-6, note: 'Ngân hàng lớn, lành mạnh' },
      { input: { SIZE: 12.6, CAR: 0.082, ROA: 0.008, NIIR: 0.18, NPL: 0.026, DPRR: 0.16, CIR: 0.50, INF: 0.0325 }, expected: 0.48750260, tol: 1e-6, note: 'Nhóm theo dõi' },
      { input: { SIZE: 11.8, CAR: 0.071, ROA: -0.005, NIIR: 0.09, NPL: 0.052, DPRR: 0.32, CIR: 0.62, INF: 0.036 }, expected: 0.98015969, tol: 1e-6, note: 'Căng thẳng' },
      { input: { SIZE: 11.88, CAR: 0.065, ROA: -0.0478, NIIR: 0.05, NPL: 0.3034, DPRR: 0.85, CIR: 0.75, INF: 0.0325 }, expected: 0.99825630, tol: 1e-6, note: 'Ca NVB-2023 (demo)' }
    ]
  };

  // Model card theo mẫu Phụ lục F của PRD
  M.modelCard = {
    model_name: 'bankrisk_xgb_demo',
    model_version: '1.0.0-demo',
    training_date: '2026-09-19',
    dataset_version: 'sha256:demo-dataset-2014-2024',
    n_raw_declared_by_source_pdf: 300,
    n_computed_from_source_pdf_bank_list: 253,
    sample_size_discrepancy_note: 'PDF gốc dùng N=300 trong mọi bảng kết quả nhưng danh sách 23 ngân hàng × 2014–2024 chỉ cho 253 quan sát; PDF không giải thích chênh lệch. Xem Mục 0.2 của PRD. Đây là hạn chế học thuật cần nêu rõ khi bảo vệ.',
    n_declared: 300,           // ô "theo báo cáo gốc"
    n_computed: 253,           // ô "tính từ danh sách ngân hàng × năm"
    n_after_cleaning: null,    // «điền» — khi artefact thật có
    n_train: null,             // «điền»
    n_train_after_smote: null, // «điền»
    n_test: null,              // «điền»
    class_balance_risk1_source_pdf: '14,3% (Bảng 4.1)',
    input_schema: ['SIZE', 'CAR', 'ROA', 'NIIR', 'NPL', 'DPRR', 'CIR', 'INF'],
    logit_coefficients_source: 'Bảng 4.3, báo cáo NCKH gốc — hệ số của báo cáo trên dữ liệu N=300 của họ, dùng làm giá trị khởi tạo demo, không tái ước lượng trên dữ liệu người dùng upload',
    split_strategy: 'time_based (khuyến nghị M-03; báo cáo gốc chưa công bố rõ)',
    smote_applied_to: 'train_only (M-01)',
    limitations: [
      'Cỡ mẫu nhỏ (≈253–300 quan sát)',
      'Lớp mất cân bằng (RISK=1 chiếm 14,3% theo Bảng 4.1)',
      'NPL và CAR có quan hệ định nghĩa với nhãn RISK (M-04)',
      'Mô hình demo là cây dựng thủ công, chưa được huấn luyện trên dữ liệu thật'
    ],
    research_reported_metrics: {
      source: 'Bảng 4.4, báo cáo NCKH gốc (ĐH Thuỷ Lợi, 4/2026), tập test 20%, N=300 theo báo cáo gốc',
      badge: 'A',
      precision_note: 'Không được công bố trong báo cáo gốc — không suy diễn',
      models: [
        { name: 'Z-score tĩnh', accuracy: 0.6540, sensitivity: 0.3510, specificity: 0.7530, auc: 0.620, precision: null },
        { name: 'Logistic Regression', accuracy: 0.7850, sensitivity: 0.4520, specificity: 0.8810, auc: 0.745, precision: null },
        { name: 'XGBoost (không SMOTE)', accuracy: 0.8520, sensitivity: 0.5840, specificity: 0.9050, auc: 0.825, precision: null },
        { name: 'XGBoost + SMOTE', accuracy: 0.9140, sensitivity: 0.8850, specificity: 0.9210, auc: 0.932, precision: null }
      ]
    },
    sgmm_research_reported: {
      source: 'Bảng 4.3, báo cáo NCKH gốc',
      hansen_p: 0.345, ar2_p: 0.412, inf_coef: 5.210,
      note: 'SGMM chỉ trình bày kết quả nghiên cứu (huy hiệu A), không ước lượng lại trong trình duyệt (PRD Mục 8.4/10.1)'
    }
  };
  // Nguồn artefact đang dùng ('embedded-demo' | 'auto-pipeline (...)')
  M.artifactSource = 'embedded-demo';

  /* ------------------------------------------------------------
     Bước 3 của pipeline tự động: nạp artefact mới nhất từ models/
     (do GitHub Actions cập nhật định kỳ). Quy trình:
       1. fetch models/xgb_risk_model.json (+ model_meta.json nếu có)
       2. KIỂM CHỨNG test_vectors (FR-MODEL-03) — fail thì giữ artefact nhúng
       3. Swap artefact + merge model card + cập nhật hệ số Logit
       4. Phát sự kiện 'brmodel:artifact-updated' để app render lại
     Chạy trên file:// (fetch chặn) hoặc chưa có models/ → im lặng bỏ qua.
     ------------------------------------------------------------ */
  M.loadRemoteArtifact = async function (basePath) {
    basePath = basePath || 'models/';
    try {
      const res = await fetch(basePath + 'xgb_risk_model.json', { cache: 'no-store' });
      if (!res.ok) return null;
      const artifact = await res.json();
      if (!artifact || !Array.isArray(artifact.trees) || !artifact.trees.length ||
        !Array.isArray(artifact.input_schema) || !artifact.input_schema.length) return null;
      let meta = null;
      try {
        const mRes = await fetch(basePath + 'model_meta.json', { cache: 'no-store' });
        if (mRes.ok) meta = await mRes.json();
      } catch (e) { /* meta tuỳ chọn */ }
      if (global.BRCORE) {
        const ver = global.BRCORE.verifyArtifact(artifact);
        if (!ver.ok) {
          console.warn('[BRMODEL] artefact remote KHÔNG vượt qua test_vectors — giữ artefact nhúng');
          return null;
        }
      }
      // Mutate IN-PLACE để mọi tham chiếu đã capture (const MC = BRMODEL.modelCard
      // trong các view, MODEL_VERSION trong app.js) đều thấy nội dung mới.
      Object.assign(M.artifact, artifact);
      if (meta && meta.model_card) Object.assign(M.modelCard, meta.model_card);
      if (meta && meta.logit_coefficients && global.BRCORE) {
        global.BRCORE.LOGIT_COEFS = meta.logit_coefficients;
      }
      M.artifactSource = (meta && meta.model_card && meta.model_card.source) || 'auto-pipeline';
      if (typeof document !== 'undefined' && document.dispatchEvent) {
        document.dispatchEvent(new CustomEvent('brmodel:artifact-updated', {
          detail: { version: artifact.model_version, source: M.artifactSource }
        }));
      }
      return { version: artifact.model_version, source: M.artifactSource };
    } catch (e) {
      return null; // file:// hoặc môi trường không có models/ — dùng artefact nhúng
    }
  };
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));
