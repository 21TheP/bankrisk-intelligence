/**
 * BANKRISK Intelligence + GREENFINANCE MVP — Cloudflare Worker
 *
 * - Phục vụ tệp tĩnh qua Workers Static Assets
 * - /api/* : opt-in persistence cho BANKRISK (D1)
 * - /api/gf/* : GREENFINANCE MVP (D1 + R2 + Gemini proxy)
 *
 * Secrets cần cấu hình (wrangler secret put ...):
 *   GEMINI_API_KEY — Google AI Studio key cho AI Engine (L6)
 * Bindings: DB (D1), EVIDENCE (R2), ASSETS (static)
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API routes — opt-in persistence
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, env, url);
    }

    // Static assets served by Workers Static Assets binding
    return env.ASSETS.fetch(request);
  }
};

async function handleAPI(request, env, url) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...cors }
    });

  try {
    // GET /api/health
    if (url.pathname === '/api/health') {
      return json({ status: 'ok', version: '2.0.0', mode: 'static-first', greenfinance: true });
    }

    // GREENFINANCE MVP — /api/gf/*
    if (url.pathname.startsWith('/api/gf/')) {
      return handleGreenFinance(request, env, url, json);
    }

    // PLATFORM L3/L6/L10 — AI proxy, Evidence, Audit
    if (url.pathname.startsWith('/api/ai/') || url.pathname.startsWith('/api/evidence') || url.pathname.startsWith('/api/audit')) {
      return handlePlatform(request, env, url, json);
    }

    // POST /api/datasets — lưu bộ dữ liệu BANKRISK (opt-in)
    if (url.pathname === '/api/datasets' && request.method === 'POST') {
      const body = await request.json();
      if (!body.privacy_consent) {
        return json({ error: 'Yêu cầu đồng ý điều khoản riêng tư (SEC-13)' }, 403);
      }
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO datasets (id, dataset_name, dataset_hash, row_count, dq_score, privacy_consent) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(id, body.name || 'unnamed', body.hash || '', body.row_count || 0, body.dq_score || 0, 1).run();
      return json({ id, created: true });
    }

    // GET /api/datasets
    if (url.pathname === '/api/datasets' && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, dataset_name, row_count, dq_score, created_at FROM datasets ORDER BY created_at DESC LIMIT 50').all();
      return json({ datasets: results });
    }

    return json({ error: 'Not found' }, 404);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/* ============================================================
   GREENFINANCE MVP — API (Lớp 2/3/6/8/10)
   - Applications + activity data: D1
   - Evidence files: R2 (binding EVIDENCE), metadata ở D1
   - AI Engine: proxy Google Gemini API (secret GEMINI_API_KEY)
   Mọi mutation ghi gf_audit_log (L10).
   ============================================================ */
async function handleGreenFinance(request, env, url, json) {
  const path = url.pathname.replace('/api/gf', '');
  const method = request.method;
  const uid = () => crypto.randomUUID();

  async function audit(actor, action, entity, entityId, detail) {
    try {
      await env.DB.prepare(`INSERT INTO gf_audit_log (id, actor, action, entity, entity_id, detail_json)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(uid(), actor || 'anonymous', action, entity, entityId, JSON.stringify(detail || {})).run();
    } catch (e) { /* audit không chặn nghiệp vụ */ }
  }

  try {
    if (path === '/health') {
      return json({ greenfinance: true, ai: !!env.GEMINI_API_KEY, db: !!env.DB, r2: !!env.EVIDENCE });
    }
    /* ---- Applications (L3) ---- */
    if (path === '/applications' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT * FROM gf_applications ORDER BY updated_at DESC LIMIT 200`).all();
      return json({ applications: results });
    }
    if (path === '/applications' && method === 'POST') {
      const b = await request.json();
      const id = b.id || uid();
      await env.DB.prepare(
        `INSERT INTO gf_applications (id, tenant_id, enterprise_name, industry, status, reporting_year,
          electricity_kwh, renewable_kwh, fuel_liters, fuel_type, gas_kg, waste_tons, recycled_pct,
          water_m3, revenue_vnd, employees, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, b.tenant_id || 'demo-tenant', b.enterprise_name || 'Doanh nghiệp chưa tên', b.industry || null,
          b.status || 'draft', b.reporting_year || new Date().getFullYear(),
          b.electricity_kwh || 0, b.renewable_kwh || 0, b.fuel_liters || 0, b.fuel_type || 'diesel',
          b.gas_kg || 0, b.waste_tons || 0, b.recycled_pct || 0, b.water_m3 || 0,
          b.revenue_vnd || 0, b.employees || 0, b.notes || null).run();
      await audit(b.actor, 'create', 'application', id, { name: b.enterprise_name });
      return json({ id, created: true });
    }
    const appMatch = path.match(/^\/applications\/([\w-]+)$/);
    if (appMatch && method === 'PUT') {
      const b = await request.json();
      const keys = ['enterprise_name', 'industry', 'status', 'reporting_year', 'electricity_kwh',
        'renewable_kwh', 'fuel_liters', 'fuel_type', 'gas_kg', 'waste_tons', 'recycled_pct',
        'water_m3', 'revenue_vnd', 'employees', 'notes'];
      const sets = keys.map(k => `${k} = ?`).join(', ');
      const vals = keys.map(k => b[k] !== undefined ? b[k] : null);
      await env.DB.prepare(`UPDATE gf_applications SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
        .bind(...vals, appMatch[1]).run();
      await audit(b.actor, 'update', 'application', appMatch[1], { status: b.status });
      return json({ id: appMatch[1], updated: true });
    }
    if (appMatch && method === 'GET') {
      const app = await env.DB.prepare(`SELECT * FROM gf_applications WHERE id = ?`).bind(appMatch[1]).first();
      if (!app) return json({ error: 'Not found' }, 404);
      const carbon = await env.DB.prepare(`SELECT * FROM gf_carbon_results WHERE application_id = ? ORDER BY computed_at DESC LIMIT 1`).bind(appMatch[1]).first();
      const score = await env.DB.prepare(`SELECT * FROM gf_scores WHERE application_id = ? ORDER BY computed_at DESC LIMIT 1`).bind(appMatch[1]).first();
      const evidence = await env.DB.prepare(`SELECT id, filename, mime, size_bytes, ocr_status, uploaded_at FROM gf_evidence WHERE application_id = ? ORDER BY uploaded_at DESC`).bind(appMatch[1]).all();
      const decisions = await env.DB.prepare(`SELECT * FROM gf_decisions WHERE application_id = ? ORDER BY created_at DESC`).bind(appMatch[1]).all();
      return json({ application: app, carbon, score, evidence: evidence.results, decisions: decisions.results });
    }

    /* ---- Carbon + Score snapshot (L4/L5) — client tính rồi đẩy lên lưu vết ---- */
    const carbonMatch = path.match(/^\/applications\/([\w-]+)\/carbon$/);
    if (carbonMatch && method === 'POST') {
      const b = await request.json();
      const id = uid();
      await env.DB.prepare(`INSERT INTO gf_carbon_results (id, application_id, factor_version, scope1_tco2e, scope2_tco2e, scope3_tco2e, total_tco2e, intensity_kgco2_per_vnd, breakdown_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, carbonMatch[1], b.factor_version || 'vn-ef-2024.1', b.scope1, b.scope2, b.scope3, b.total, b.intensity, JSON.stringify(b.breakdown || {})).run();
      return json({ id });
    }
    const scoreMatch = path.match(/^\/applications\/([\w-]+)\/score$/);
    if (scoreMatch && method === 'POST') {
      const b = await request.json();
      const id = uid();
      await env.DB.prepare(`INSERT INTO gf_scores (id, application_id, rule_version, green_score, taxonomy_eligible, data_quality, criteria_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, scoreMatch[1], b.rule_version || 'green-taxonomy-1.0', b.green_score,
          b.taxonomy_eligible ? 1 : 0, b.data_quality, JSON.stringify(b.criteria || {})).run();
      return json({ id });
    }

    /* ---- Evidence: upload vào R2 (L3) ---- */
    const evMatch = path.match(/^\/applications\/([\w-]+)\/evidence$/);
    if (evMatch && method === 'POST') {
      const form = await request.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') return json({ error: 'Thiếu tệp' }, 400);
      const key = `gf-evidence/${evMatch[1]}/${uid()}-${file.name}`;
      await env.EVIDENCE.put(key, await file.arrayBuffer(),
        { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
      const id = uid();
      await env.DB.prepare(`INSERT INTO gf_evidence (id, application_id, filename, r2_key, mime, size_bytes)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(id, evMatch[1], file.name, key, file.type || null, file.size).run();
      await audit(form.get('actor'), 'upload', 'evidence', id, { filename: file.name });
      return json({ id, key });
    }
    const evGet = path.match(/^\/evidence\/([\w-]+)(\/url)?$/);
    if (evGet && method === 'GET') {
      const row = await env.DB.prepare(`SELECT * FROM gf_evidence WHERE id = ?`).bind(evGet[1]).first();
      if (!row) return json({ error: 'Not found' }, 404);
      if (evGet[2]) {
        const obj = await env.EVIDENCE.get(row.r2_key);
        if (!obj) return json({ error: 'Object not found' }, 404);
        return new Response(obj.body, { headers: { 'Content-Type': row.mime || 'application/octet-stream' } });
      }
      return json({ evidence: row });
    }

    /* ---- Decisions (L8) ---- */
    const decMatch = path.match(/^\/applications\/([\w-]+)\/decisions$/);
    if (decMatch && method === 'POST') {
      const b = await request.json();
      const id = uid();
      await env.DB.prepare(`INSERT INTO gf_decisions (id, application_id, reviewer, action, comment, risk_flags_json)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(id, decMatch[1], b.reviewer || 'bank-officer', b.action, b.comment || null,
          JSON.stringify(b.risk_flags || [])).run();
      const statusMap = { submit: 'submitted', start_review: 'under_review', approve: 'approved', reject: 'rejected', request_info: 'under_review' };
      if (statusMap[b.action]) {
        await env.DB.prepare(`UPDATE gf_applications SET status = ?, updated_at = datetime('now') WHERE id = ?`)
          .bind(statusMap[b.action], decMatch[1]).run();
      }
      await audit(b.reviewer, b.action, 'application', decMatch[1], { comment: b.comment });
      return json({ id });
    }

    /* ---- AI Engine proxy (L6) — Gemini API free tier ---- */
    if (path === '/ai/analyze' && method === 'POST') {
      if (!env.GEMINI_API_KEY) {
        return json({ error: 'GEMINI_API_KEY chưa cấu hình — AI Engine chạy chế độ rule-based phía client', ai: false }, 503);
      }
      const b = await request.json();
      const prompt = buildGeminiPrompt(b);
      const model = b.model || 'gemini-2.0-flash';
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
      if (!r.ok) return json({ error: 'Gemini API lỗi: ' + r.status }, 502);
      const data = await r.json();
      const text = (data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text) || '';
      await audit(b.actor, 'ai_analyze', 'application', b.application_id || null, { model });
      return json({ model, text, usage: data.usageMetadata || null });
    }

    /* ---- Impact (L9) ---- */
    if (path === '/impact' && method === 'GET') {
      const { results } = await env.DB.prepare(`SELECT * FROM gf_impact ORDER BY year ASC LIMIT 100`).all();
      return json({ impact: results });
    }
    if (path === '/impact' && method === 'POST') {
      const b = await request.json();
      const id = uid();
      await env.DB.prepare(`INSERT INTO gf_impact (id, tenant_id, year, total_tco2e, renewable_pct, intensity_kgco2_per_vnd)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(id, b.tenant_id || 'demo-tenant', b.year, b.total_tco2e || 0, b.renewable_pct || 0, b.intensity || 0).run();
      return json({ id });
    }

    return json({ error: 'Not found', path }, 404);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function buildGeminiPrompt({ task, filename, ocr_text, application }) {  const base = `Bạn là AI Engine của nền tảng Green Credit Việt Nam. Trả lời bằng JSON thuần (không markdown).
Dữ liệu hồ sơ: ${JSON.stringify(application || {})}`;
  if (task === 'extraction') {
    return `${base}
Tài liệu chứng minh "${filename}" có nội dung sau (OCR):
"""${(ocr_text || '').slice(0, 8000)}"""
Trích xuất thành JSON: {"doc_type": "...", "period": "...", "electricity_kwh": number|null, "fuel_liters": number|null, "waste_tons": number|null, "renewable_kwh": number|null, "confidence": 0-1, "flags": ["anomalies nếu có"]}`;
  }
  if (task === 'anomaly') {
    return `${base}
Phát hiện bất thường trong dữ liệu hoạt động trên (giá trị bất thường, thiếu nhất quán, rủi ro greenwashing).
Trả JSON: {"anomalies": [{"field": "...", "issue": "...", "severity": "low|medium|high"}], "data_quality": 0-1}`;
  }
  return `${base}
Nhiệm vụ: ${task || 'recommendation'}. Đề xuất 3-5 hành động giảm phát thải / nâng Green Score, mỗi mục gồm hành động, tác động CO2e ước tính, ưu tiên.
Trả JSON: {"recommendations": [{"action": "...", "co2e_reduction_t": number, "priority": "high|medium|low"}]}`;
}

/* ============================================================
   PLATFORM — L6 AI Engine / L3 Evidence / L10 Audit
   ============================================================ */
async function handlePlatform(request, env, url, json) {
  const path = url.pathname.replace('/api', '');
  const method = request.method;
  const uid = () => crypto.randomUUID();

  try {
    /* ---- L6: AI Engine proxy (Gemini free tier) ---- */
    if (path === '/ai/health') {
      return json({ ai: !!env.GEMINI_API_KEY });
    }
    if (path === '/ai/analyze' && method === 'POST') {
      if (!env.GEMINI_API_KEY) {
        return json({ error: 'GEMINI_API_KEY chưa cấu hình — dùng chế độ rule-based phía client', ai: false }, 503);
      }
      const b = await request.json();
      const prompt = buildBankPrompt(b);
      const model = b.model || 'gemini-2.0-flash';
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 2048 } }) });
      if (!r.ok) return json({ error: 'Gemini API lỗi: ' + r.status }, 502);
      const data = await r.json();
      const text = (data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text) || '';
      return json({ model, text, usage: data.usageMetadata || null });
    }

    /* ---- L3: Evidence theo ngân hàng (R2 + metadata D1) ---- */
    const evUp = path.match(/^\/evidence\/([A-Za-z0-9_]+)$/);
    if (evUp && method === 'POST') {
      const form = await request.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') return json({ error: 'Thiếu tệp' }, 400);
      const bank = evUp[1].toUpperCase();
      const year = form.get('year') || null;
      const key = `br-evidence/${bank}/${uid()}-${file.name}`;
      await env.EVIDENCE.put(key, await file.arrayBuffer(),
        { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
      const id = uid();
      await env.DB.prepare(`INSERT INTO br_evidence (id, bank_code, year, filename, r2_key, mime, size_bytes, doc_type, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, bank, year, file.name, key, file.type || null, file.size,
          form.get('doc_type') || null, form.get('actor') || null).run();
      await audit(env, uid, form.get('actor'), form.get('persona'), 'upload', 'evidence', id, { bank, filename: file.name });
      return json({ id, key });
    }
    const evList = path.match(/^\/evidence\/([A-Za-z0-9_]+)\/list$/);
    if (evList && method === 'GET') {
      const { results } = await env.DB.prepare(`SELECT id, bank_code, year, filename, mime, size_bytes, doc_type, uploaded_at
        FROM br_evidence WHERE bank_code = ? ORDER BY uploaded_at DESC`).bind(evList[1].toUpperCase()).all();
      return json({ evidence: results });
    }
    const evGet = path.match(/^\/evidence\/file\/([\w-]+)$/);
    if (evGet && method === 'GET') {
      const row = await env.DB.prepare(`SELECT * FROM br_evidence WHERE id = ?`).bind(evGet[1]).first();
      if (!row) return json({ error: 'Not found' }, 404);
      const obj = await env.EVIDENCE.get(row.r2_key);
      if (!obj) return json({ error: 'Object not found' }, 404);
      return new Response(obj.body, { headers: { 'Content-Type': row.mime || 'application/octet-stream' } });
    }

    /* ---- L10: Audit log ---- */
    if (path === '/audit' && method === 'GET') {
      const { results } = await env.DB.prepare(`SELECT * FROM br_audit_log ORDER BY created_at DESC LIMIT 100`).all();
      return json({ audit: results });
    }

    return json({ error: 'Not found', path }, 404);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

async function audit(env, uid, actor, persona, action, entity, entityId, detail) {
  try {
    await env.DB.prepare(`INSERT INTO br_audit_log (id, actor, persona, action, entity, entity_id, detail_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(uid(), actor || 'anonymous', persona || null, action, entity, entityId, JSON.stringify(detail || {})).run();
  } catch (e) { /* audit không chặn */ }
}

function buildBankPrompt({ task, ocr_text, bank, payload }) {
  const P = JSON.stringify(payload || null);
  if (task === 'extract_bctc') {
    return `Bạn là AI Engine của hệ thống phân tích rủi ro ngân hàng thương mại Việt Nam (BANKRISK).
Dưới đây là văn bản trích xuất (OCR/copy) từ báo cáo tài chính của ngân hàng ${bank || ''}:
"""${(ocr_text || '').slice(0, 14000)}"""
Hãy trích xuất các dòng số liệu tài chính thành JSON thuần (KHÔNG markdown), một dòng mỗi năm:
{"rows": [{"bank_code": "${bank || 'BANK'}", "bank_name": "", "year": number, "total_assets": number|null, "equity": number|null, "gross_loans": number|null, "group_3_loans": number|null, "group_4_loans": number|null, "group_5_loans": number|null, "total_deposits": number|null, "profit_after_tax": number|null, "total_operating_income": number|null, "net_interest_income": number|null, "credit_risk_provision_expense": number|null, "operating_expenses": number|null, "earning_assets": number|null}], "confidence": 0-1, "notes": "đơn vị số liệu, giả định khi trích"}
Chỉ điền giá trị có trong văn bản, còn lại để null. Ghi chú đơn vị (tỷ đồng/triệu đồng) trong notes.`;
  }
  if (task === 'anomaly') {
    return `Bạn là AI Engine của hệ thống phân tích rủi ro ngân hàng VN. Phát hiện bất thường trong dữ liệu chỉ tiêu sau:
${P}
Kiểm tra: giá trị ngoài biên lý do kinh tế (NPL <0 hoặc >30%, CAR >25%, ROA ngoài -5%..10%), biến động liên năm bất thường, thiếu dữ liệu ảnh hưởng đánh giá.
Trả JSON thuần: {"anomalies": [{"bank_code": "...", "year": number, "field": "...", "issue": "...", "severity": "low|medium|high"}], "summary": "..."}`;
  }
  return `Bạn là chuyên gia phân tích tín dụng - giám sát ngân hàng tại Việt Nam. Dựa trên dữ liệu chỉ tiêu và cảnh báo sớm sau đây của ngân hàng ${bank || ''}:
${P}
Viết nhận xét phân tích ngắn gọn (3-5 đoạn, tiếng Việt): 1) Tình hình an toàn vốn & chất lượng tài sản; 2) Khả năng sinh lời & hiệu quả hoạt động; 3) Rủi ro chính và tín hiệu cảnh báo sớm; 4) Khuyến nghị theo dõi. Không đưa ra khuyến nghị đầu tư; nêu rõ nếu dữ liệu thiếu.`;
}
