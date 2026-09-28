/**
 * BANKRISK Intelligence — Cloudflare Worker (tuỳ chọn)
 * 
 * Mục đích: phục vụ tệp tĩnh qua Workers Static Assets
 * và cung cấp API tuỳ chọn cho lưu trữ bộ dữ liệu khi
 * người dùng đồng ý chia sẻ.
 * 
 * Mặc định: tất cả xử lý chạy phía trình duyệt, worker
 * chỉ phục vụ file tĩnh.
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      return json({ status: 'ok', version: '1.0.0', mode: 'static-first' });
    }

    // POST /api/datasets — lưu bộ dữ liệu (opt-in)
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
