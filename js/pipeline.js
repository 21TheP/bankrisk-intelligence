/* ============================================================
   BANKRISK Intelligence — Pipeline phân tích
   Dùng chung main thread & Web Worker (P-06: tính toán nặng
   chạy trong Worker; nếu Worker không khả dụng (file://) thì
   fallback chạy trực tiếp — dữ liệu nhỏ nên chấp nhận được).
   ============================================================ */
(function (global) {
  'use strict';
  const BR = global.BRCORE;

  const PIPE = global.BRPIPE = {};

  // Phân tích đầy đủ: làm sạch → kiểm tra → chỉ tiêu → Z-score
  PIPE.analyze = function (payload) {
    const opts = payload.opts || {};
    const cleaned = BR.cleanRows(payload.rows, opts);
    // Xử lý trùng lặp theo lựa chọn người dùng (C-06: không bao giờ tự xoá)
    let rows = cleaned;
    let duplicatesRemoved = 0;
    if (payload.duplicatePolicy && payload.duplicatePolicy !== 'keep-all') {
      const keepFirst = payload.duplicatePolicy === 'keep-first';
      const seen = new Map(); // key -> vị trí trong mảng kết quả
      rows = [];
      for (const r of cleaned) {
        const k = r.bank_code + '|' + r.year;
        if (!seen.has(k)) { seen.set(k, rows.length); rows.push(r); }
        else {
          duplicatesRemoved++;
          if (!keepFirst) rows[seen.get(k)] = r; // keep-last: thay bản ghi trước
        }
      }
    }
    const validation = BR.validate(rows, { columns: payload.columns });
    const res = BR.computeIndicators(rows, { carMode: opts.carMode });
    BR.computeZScores(res.indicators);
    // Ghi tổng tài sản / tài sản bình quân phục vụ SRI, bản đồ và stress test
    const rawMap = new Map(rows.map(r => [r.bank_code + '|' + r.year, r]));
    res.indicators.forEach(i => {
      const r = rawMap.get(i.bank_code + '|' + i.year);
      const rPrev = rawMap.get(i.bank_code + '|' + (i.year - 1));
      i._total_assets = r ? r.total_assets : null;
      i._avg_assets = r ? (rPrev && rPrev.total_assets ? (r.total_assets + rPrev.total_assets) / 2 : r.total_assets) : null;
      if (r) i._rowIdx = r._rowIdx;
    });
    return {
      rows, validation, indicators: res.indicators, meta: res.meta,
      duplicatesRemoved, unit: opts.unit || 'million_vnd'
    };
  };

  // Phân loại 4 nhóm theo năm tăng dần (cần cho dải trễ 9.5)
  PIPE.computeGroups = function (indicators, probs) {
    // probs: Map 'BANK|year' -> {logit, xgb, ensemble}
    const byBank = new Map();
    indicators.forEach(i => {
      if (!byBank.has(i.bank_code)) byBank.set(i.bank_code, []);
      byBank.get(i.bank_code).push(i);
    });
    byBank.forEach(arr => {
      arr.sort((a, b) => a.year - b.year);
      let prev = null, prevGroup = null;
      for (const ind of arr) {
        const p = probs ? (probs.get(ind.bank_code + '|' + ind.year) || null) : null;
        const prob = p ? p.ensemble : null;
        const c = BR.classify(ind, prev, prevGroup, prob);
        ind.group = c.group; ind.severity = c.severity; ind.reasons = c.reasons;
        ind.hysteresisApplied = c.hysteresisApplied;
        ind.prob = p || null;
        prev = ind; prevGroup = c.group;
      }
    });
    return indicators;
  };

  // Chấm điểm toàn bộ quan sát bằng 3 mô hình (Logit / XGBoost / Ensemble)
  PIPE.score = function (payload) {
    const { indicators, artifact, ensembleWeights } = payload;
    const probs = new Map();
    let nScored = 0, nSkipped = 0;
    for (const ind of indicators) {
      const lp = BR.logitProb(ind);
      const xp = BR.evalXgb(artifact, ind);
      const ep = BR.ensembleProb(lp, xp, ensembleWeights.logit, ensembleWeights.xgb);
      if (lp !== null || xp !== null) nScored++; else nSkipped++;
      probs.set(ind.bank_code + '|' + ind.year, {
        logit: lp === null ? null : Math.round(lp * 10000) / 10000,
        xgb: xp === null ? null : Math.round(xp * 10000) / 10000,
        ensemble: ep === null ? null : Math.round(ep * 10000) / 10000
      });
    }
    return { probs, nScored, nSkipped };
  };

  if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof importScripts === 'function') {
    // Chạy trong Web Worker
    self.onmessage = function (e) {
      const { id, op, payload } = e.data;
      try {
        let result;
        if (op === 'analyze') result = PIPE.analyze(payload);
        else if (op === 'score') result = PIPE.score(payload);
        else throw new Error('Op không hỗ trợ: ' + op);
        self.postMessage({ id, ok: true, result });
      } catch (err) {
        self.postMessage({ id, ok: false, error: String(err && err.message || err) });
      }
    };
  }
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));
