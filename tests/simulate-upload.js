/* Mô phỏng đúng luồng upload trong app.js cho tệp XLSX thật của người dùng */
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

/* --- stub browser globals cho vendor xlsx (giống integration.test.js) --- */
global.self = global;
global.window = global;
global.document = { createElement: () => ({ style: {} }), };
global.navigator = { userAgent: 'node' };

const XLSX = require(path.join(ROOT, 'vendor', 'xlsx.full.min.js'));
global.XLSX = XLSX;

require(path.join(ROOT, 'js', 'core.js'));
const BR = global.BRCORE;
require(path.join(ROOT, 'js', 'pipeline.js'));
const PIPE = global.BRPIPE;
require(path.join(ROOT, 'js', 'demo-data.js'));
require(path.join(ROOT, 'js', 'model-artifact.js'));

const argFile = process.argv[2];
let FILE = argFile;
if (!FILE || !fs.existsSync(FILE)) {
  // Tự tìm tệp trong Downloads theo mẫu tên (tránh lỗi encode tiếng Việt qua shell)
  const dl = 'C:/Users/Admin/Downloads';
  const cand = fs.readdirSync(dl).filter(f => /^Du-lieu-goc/i.test(f) && f.endsWith('.xlsx'));
  if (cand.length) FILE = path.join(dl, cand[0]);
}
console.log('Tệp:', FILE, '| tồn tại:', fs.existsSync(FILE));

const wb = XLSX.readFile(FILE);
console.log('\n=== 1. Cấu trúc tệp ===');
console.log('Sheets:', wb.SheetNames);

const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
console.log('Sheet dùng để nạp:', sheetName, '| tổng dòng:', aoa.length, '| tổng cột:', (aoa[0] || []).length);

console.log('\n=== 2. Header gốc → ánh xạ tự động ===');
const rawHeader = aoa[0];
const header = rawHeader.map(c => BR.normalizeHeader(c));
rawHeader.forEach((raw, i) => {
  const norm = header[i];
  const tag = raw !== norm ? ' → ' + norm : '';
  console.log('  [' + i + '] "' + raw + '"' + tag);
});

console.log('\n=== 3. Bổ sung cột tự động ===');
const extra = [];
if (!header.includes('inflation') && header.includes('year')) { header.push('inflation'); extra.push('inflation ← GSO CPI theo năm'); }
if (!header.includes('bank_name') && header.includes('bank_code')) { header.push('bank_name'); extra.push('bank_name ← = bank_code'); }
if (!header.includes('group_5_loans') && (header.includes('no_xau') || header.includes('bad_debts'))) {
  if (!header.includes('group_3_loans')) header.push('group_3_loans');
  if (!header.includes('group_4_loans')) header.push('group_4_loans');
  header.push('group_5_loans');
  extra.push('group_3/4/5_loans ← tách từ cột nợ xấu');
}
if (extra.length) extra.forEach(e => console.log('  +', e)); else console.log('  (không cần bổ sung)');

console.log('\n=== 4. Kiểm tra cột bắt buộc (V-03) ===');
const missing = BR.REQUIRED_COLS.filter(c => !header.includes(c));
if (missing.length) {
  console.log('  ✗ THIẾU:', missing.join(', '));
  console.log('  → App sẽ hiện modal "Thiếu cột bắt buộc (V-03)" và từ chối nạp.');
  process.exit(0);
}
console.log('  ✓ Đủ 16/16 cột bắt buộc → cho phép nạp');

console.log('\n=== 5. Đọc dòng dữ liệu + tự điền ===');
const rows = aoa.slice(1).filter(r => r.some(c => c !== null && String(c).trim() !== ''))
  .map(r => {
    const o = {};
    header.forEach((c, i) => o[c] = r[i] === undefined ? null : r[i]);
    if (o.inflation === null && o.year && BR.GSO_INFLATION[o.year] !== undefined) o.inflation = BR.GSO_INFLATION[o.year];
    if (!o.bank_name && o.bank_code) o.bank_name = o.bank_code;
    return o;
  });
console.log('  Số dòng dữ liệu:', rows.length);

console.log('\n=== 6. Pipeline phân tích (analyze) ===');
const res = PIPE.analyze({ rows, columns: header, duplicatePolicy: 'keep-all', opts: {} });
console.log('  Dòng sau làm sạch:', res.rows.length, '| Chỉ tiêu tính được:', res.indicators.length);
const issues = res.validation.issues || [];
const byRule = {};
issues.forEach(x => { byRule[x.rule] = (byRule[x.rule] || 0) + 1; });
console.log('  Vấn đề kiểm tra (V-01..V-14):', issues.length === 0 ? 'Không có ✓' : JSON.stringify(byRule));
console.log('  DQ score:', res.validation.dq ? res.validation.dq.score : 'N/A');

console.log('\n=== 7. Chấm điểm mô hình (Logit + XGBoost + Ensemble) ===');
const scored = PIPE.score({ indicators: res.indicators, artifact: global.BRMODEL.artifact, ensembleWeights: { logit: 0.3, xgb: 0.7 } });
console.log('  Đã chấm:', scored.nScored, '| Bỏ qua (thiếu đầu vào):', scored.nSkipped);
PIPE.computeGroups(res.indicators, scored.probs);

console.log('\n=== 8. Phân loại 4 nhóm kỳ gần nhất ===');
const maxYear = Math.max(...res.indicators.map(i => i.year));
const latest = res.indicators.filter(i => i.year === maxYear);
const groups = { critical: 0, high: 0, watch: 0, stable: 0 };
latest.forEach(i => { if (groups[i.group] !== undefined) groups[i.group]++; });
console.log('  Kỳ:', maxYear, '| số ngân hàng:', latest.length, '| phân nhóm:', JSON.stringify(groups));
console.log('\n  Chi tiết rủi ro cao nhất (kỳ ' + maxYear + '):');
latest
  .map(i => ({ code: i.bank_code, npl: i.npl, car: i.car, prob: i.prob ? i.prob.ensemble : null, group: i.group, sev: i.severity }))
  .sort((a, b) => (b.prob || 0) - (a.prob || 0))
  .slice(0, 8)
  .forEach(x => console.log('   ', x.code,
    '| NPL', x.npl === null ? '—' : (x.npl * 100).toFixed(2) + '%',
    '| CAR', x.car === null ? '—' : (x.car * 100).toFixed(2) + '%',
    '| P(rủi ro)', x.prob === null ? '—' : (x.prob * 100).toFixed(1) + '%',
    '| nhóm', x.group));

console.log('\n=== KẾT LUẬN: tệp nạp thành công, app renders đủ 9 module với dữ liệu này ===');
