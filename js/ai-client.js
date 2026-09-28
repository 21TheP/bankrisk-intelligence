/* ============================================================
   BANKRISK Intelligence — L6 AI ENGINE (client)
   Gọi /api/ai/analyze (Worker proxy → Gemini API free tier).
   Khi không có key/Worker → fallback rule-based chạy local.
   3 tác vụ: extract_bctc (trích xuất BCTC), anomaly (bất thường),
   commentary (nhận xét phân tích ngân hàng).
   ============================================================ */
(function (global) {
  'use strict';
  const GFAI = global.GFAI = { mode: 'unknown' };

  GFAI.check = async function () {
    try {
      const r = await fetch('/api/ai/health');
      if (r.ok) { const j = await r.json(); GFAI.mode = j.ai ? 'gemini' : 'worker-no-key'; return j.ai; }
      GFAI.mode = 'offline'; return false;
    } catch (e) { GFAI.mode = 'offline'; return false; }
  };

  async function callAI(payload) {
    const r = await fetch('/api/ai/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('AI API lỗi ' + r.status));
    return extractJSON(data.text);
  }
  function extractJSON(text) {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AI không trả về JSON hợp lệ');
    return JSON.parse(m[0]);
  }

  /* ---- 1) Trích xuất BCTC từ văn bản (OCR/copy) → raw rows ---- */
  GFAI.extractBCTC = async function (bank, ocrText) {
    try {
      const data = await callAI({ task: 'extract_bctc', bank, ocr_text: ocrText });
      return { source: 'gemini', data };
    } catch (e) {
      return { source: 'rule-based', data: ruleExtract(bank, ocrText), error: e.message };
    }
  };

  /* ---- 2) Kiểm tra bất thường dataset ---- */
  GFAI.anomaly = async function (payload) {
    try {
      const data = await callAI({ task: 'anomaly', payload });
      return { source: 'gemini', data };
    } catch (e) {
      return { source: 'rule-based', data: ruleAnomaly(payload) };
    }
  };

  /* ---- 3) Nhận xét phân tích ngân hàng ---- */
  GFAI.commentary = async function (bank, payload) {
    try {
      const data = await callAI({ task: 'commentary', bank, payload });
      return { source: 'gemini', data };
    } catch (e) {
      throw new Error('Nhận xét AI cần Gemini API key (chưa cấu hình trên Worker).');
    }
  };

  /* ================= Fallback rule-based ================= */
  function num(s) {
    if (s === null || s === undefined) return null;
    const v = parseFloat(String(s).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  }
  function ruleExtract(bank, text) {
    const rows = [];
    const t = String(text || '');
    // Tìm các mẫu "Năm <year>" hoặc dòng bắt đầu bằng năm + số liệu (heuristic đơn giản)
    const re = /(20\d{2})[^0-9-]{1,40}(-?[\d.,]+)/g;
    const values = [];
    let m;
    while ((m = re.exec(t)) !== null) values.push({ year: +m[1], raw: m[2] });
    const years = [...new Set(values.map(v => v.year))];
    if (years.length) {
      years.forEach(y => rows.push({
        bank_code: (bank || 'BANK').toUpperCase(), bank_name: bank || '', year: y,
        total_assets: null, equity: null, gross_loans: null
      }));
    }
    return {
      rows, confidence: 0.2,
      notes: 'Fallback rule-based chỉ nhận diện năm và số liệu thô — cấu hình Gemini API key trên Worker để trích xuất đầy đủ 14 trường.',
      requiresReview: true
    };
  }
  function ruleAnomaly(payload) {
    const anomalies = [];
    (payload || []).forEach(i => {
      const chk = (field, v, lo, hi, label) => {
        if (v === null || v === undefined || !Number.isFinite(v)) return;
        if (v < lo || v > hi) anomalies.push({ bank_code: i.bank_code, year: i.year, field, issue: label + ' ngoài biên lý do kinh tế (' + v + ')', severity: v < lo * 2 || v > hi * 2 ? 'high' : 'medium' });
      };
      chk('npl', i.npl, 0, 0.30, 'NPL');
      chk('car', i.car, 0, 0.25, 'CAR');
      chk('roa', i.roa, -0.05, 0.10, 'ROA');
      chk('cir', i.cir, 0, 1.5, 'CIR');
      chk('dprr', i.dprr, 0, 3, 'DPRR');
    });
    return { anomalies, summary: 'Kiểm tra biên hợp lý cơ bản (rule-based). Cấu hình Gemini để phân tích sâu hơn.' };
  }
})(typeof self !== 'undefined' ? self : window);
