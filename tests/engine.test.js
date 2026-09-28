/* ============================================================
   BANKRISK Intelligence — Engine unit tests
   Chạy: node tests/engine.test.js
   Không dùng framework — chỉ assert gốc.
   ============================================================ */
'use strict';
const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadIIFE(file) {
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInThisContext(code);
}
loadIIFE('js/core.js');
loadIIFE('js/model-artifact.js');

const BR = global.BRCORE;
const M = global.BRMODEL;
let pass = 0, fail = 0, total = 0;

function t(name, fn) {
  total++;
  try { fn(); pass++; console.log(`  \u2713 ${name}`); }
  catch (e) { fail++; console.log(`  \u2717 ${name}\n    ${e.message}`); }
}

function near(a, b, tol) {
  tol = tol || 1e-9;
  assert.ok(Math.abs(a - b) < tol, `expected ${b}, got ${a} (tol ${tol})`);
}

function mkRow(overrides) {
  return Object.assign({
    bank_code: 'VCB', bank_name: 'Vietcombank', year: 2023,
    total_assets: 1800000, risk_weighted_assets: 900000,
    regulatory_capital: 120000, profit_after_tax: 30000,
    total_operating_income: 45000, net_interest_income: 30000,
    gross_loans: 1000000, group_3_loans: 5000, group_4_loans: 2000,
    group_5_loans: 1000, credit_risk_provision_expense: 3000,
    operating_expenses: 18000, inflation: 3.25
  }, overrides);
}

/* ======== 1. Utility functions ======== */
console.log('\n--- Utilities ---');

t('sigmoid(0) = 0.5', () => near(BR.sigmoid(0), 0.5));
t('sigmoid large positive \u2248 1', () => assert.ok(BR.sigmoid(20) > 0.999));
t('sigmoid large negative \u2248 0', () => assert.ok(BR.sigmoid(-20) < 0.001));

t('median odd', () => near(BR.median([5, 1, 3]), 3));
t('median even', () => near(BR.median([1, 2, 3, 4]), 2.5));
t('median with nulls', () => near(BR.median([null, 5, null, 1, 3]), 3));
t('median empty', () => assert.strictEqual(BR.median([]), null));

t('quantile 0.25', () => near(BR.quantile([1, 2, 3, 4], 0.25), 1.75));
t('quantile 0.75', () => near(BR.quantile([1, 2, 3, 4], 0.75), 3.25));

t('mean', () => near(BR.mean([2, 4, 6]), 4));
t('mean with non-finite', () => near(BR.mean([2, NaN, 6]), 4));
t('sd', () => near(BR.sd([2, 4, 6]), 2));
t('sd < 2 returns null', () => assert.strictEqual(BR.sd([5]), null));

t('clamp', () => {
  assert.strictEqual(BR.clamp(5, 0, 10), 5);
  assert.strictEqual(BR.clamp(-1, 0, 10), 0);
  assert.strictEqual(BR.clamp(15, 0, 10), 10);
});

t('esc HTML', () => {
  assert.strictEqual(BR.esc('<script>'), '&lt;script&gt;');
  assert.strictEqual(BR.esc('"&\''), '&quot;&amp;&#39;');
  assert.strictEqual(BR.esc(null), '');
});

t('normalizeHeader Vietnamese & aliases', () => {
  assert.strictEqual(BR.normalizeHeader('Mã ngân hàng'), 'bank_code');
  assert.strictEqual(BR.normalizeHeader('Mã CK'), 'bank_code');
  assert.strictEqual(BR.normalizeHeader('Ticker'), 'bank_code');
  assert.strictEqual(BR.normalizeHeader('Tổng tài sản'), 'total_assets');
  assert.strictEqual(BR.normalizeHeader('TTS'), 'total_assets');
  assert.strictEqual(BR.normalizeHeader('Lợi nhuận sau thuế'), 'profit_after_tax');
  assert.strictEqual(BR.normalizeHeader('LNST'), 'profit_after_tax');
  assert.strictEqual(BR.normalizeHeader('RWA'), 'risk_weighted_assets');
  assert.strictEqual(BR.normalizeHeader('Vốn tự có'), 'regulatory_capital');
  assert.strictEqual(BR.normalizeHeader('Chi phí hoạt động'), 'operating_expenses');
  assert.strictEqual(BR.normalizeHeader('Lạm phát'), 'inflation');
});

/* ======== 2. parseNumeric ======== */
console.log('\n--- parseNumeric ---');

t('integer', () => near(BR.parseNumeric(1234).value, 1234));
t('float', () => near(BR.parseNumeric(1.5).value, 1.5));
t('string integer', () => near(BR.parseNumeric('1234').value, 1234));
t('VN thousands dots', () => near(BR.parseNumeric('1.105.000').value, 1105000));
t('US thousands commas', () => near(BR.parseNumeric('1,105,000').value, 1105000));
t('VN decimal comma', () => near(BR.parseNumeric('12,5').value, 12.5));
t('mixed dot-comma', () => near(BR.parseNumeric('1.234,56').value, 1234.56));
t('mixed comma-dot', () => near(BR.parseNumeric('1,234.56').value, 1234.56));
t('null returns ok:false', () => assert.strictEqual(BR.parseNumeric(null).ok, false));
t('empty string', () => assert.strictEqual(BR.parseNumeric('').ok, false));
t('NaN number', () => assert.strictEqual(BR.parseNumeric(NaN).ok, false));
t('currency strip VND', () => near(BR.parseNumeric('1234 VND').value, 1234));

/* ======== 3. cleanRows ======== */
console.log('\n--- cleanRows ---');

t('clean valid row', () => {
  const res = BR.cleanRows([mkRow()]);
  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].bank_code, 'VCB');
  assert.strictEqual(res[0].total_assets, 1800000);
});

t('clean normalizes bank_code to uppercase', () => {
  const res = BR.cleanRows([mkRow({ bank_code: 'vcb' })]);
  assert.strictEqual(res[0].bank_code, 'VCB');
});

t('clean trims bank_name', () => {
  const res = BR.cleanRows([mkRow({ bank_name: '  Vietcombank  ' })]);
  assert.strictEqual(res[0].bank_name, 'Vietcombank');
});

t('clean parses string numbers', () => {
  const res = BR.cleanRows([mkRow({ total_assets: '1.800.000' })]);
  near(res[0].total_assets, 1800000);
});

/* ======== 4. Validation rules ======== */
console.log('\n--- Validation rules ---');

t('V-03: missing required columns', () => {
  const rows = BR.cleanRows([mkRow()]);
  const res = BR.validate(rows, { columns: ['bank_code', 'year'] });
  const v03 = res.issues.find(i => i.rule === 'V-03');
  assert.ok(v03, 'V-03 should fire for missing columns');
});

t('V-04: duplicate bank+year', () => {
  const rows = BR.cleanRows([mkRow(), mkRow()]);
  const res = BR.validate(rows);
  const v04 = res.issues.find(i => i.rule === 'V-04');
  assert.ok(v04, 'V-04 should fire for duplicate rows');
});

t('V-05: empty bank_code', () => {
  const rows = BR.cleanRows([mkRow({ bank_code: '' })]);
  const res = BR.validate(rows);
  const v05 = res.issues.find(i => i.rule === 'V-05');
  assert.ok(v05, 'V-05 should fire for empty bank_code');
});

t('V-06: year out of range', () => {
  const rows = BR.cleanRows([mkRow({ year: 1900 })]);
  const res = BR.validate(rows);
  const v06 = res.issues.find(i => i.rule === 'V-06');
  assert.ok(v06, 'V-06 should fire for year < 1990');
});

t('V-07: missing required numeric (unparseable)', () => {
  const rows = BR.cleanRows([mkRow({ total_assets: 'abc' })]);
  const res = BR.validate(rows);
  const v07 = res.issues.find(i => i.rule === 'V-07' && i.col === 'total_assets');
  assert.ok(v07, 'V-07 should fire for unparseable total_assets');
});

t('V-09: negative value', () => {
  const rows = BR.cleanRows([mkRow({ total_assets: -100 })]);
  const res = BR.validate(rows);
  const v09 = res.issues.find(i => i.rule === 'V-09');
  assert.ok(v09, 'V-09 should fire for negative total_assets');
});

t('V-10: divide by zero gross_loans', () => {
  const rows = BR.cleanRows([mkRow({ gross_loans: 0 })]);
  const res = BR.validate(rows);
  const v10 = res.issues.find(i => i.rule === 'V-10' && i.col === 'gross_loans');
  assert.ok(v10, 'V-10 should fire for gross_loans = 0');
});

t('V-12: NPL loans > gross_loans', () => {
  const rows = BR.cleanRows([mkRow({ group_3_loans: 600000, group_4_loans: 300000, group_5_loans: 200000, gross_loans: 1000000 })]);
  const res = BR.validate(rows);
  const v12 = res.issues.find(i => i.rule === 'V-12');
  assert.ok(v12, 'V-12 should fire when npl loans > gross_loans');
});

t('V-13: NII > TOI warning', () => {
  const rows = BR.cleanRows([mkRow({ net_interest_income: 50000, total_operating_income: 45000 })]);
  const res = BR.validate(rows);
  const v13 = res.issues.find(i => i.rule === 'V-13');
  assert.ok(v13, 'V-13 should warn when NII > TOI');
  assert.strictEqual(v13.level, 'warn');
});

t('V-14: year gap detection', () => {
  const rows = BR.cleanRows([
    mkRow({ year: 2020 }),
    mkRow({ year: 2022 })
  ]);
  const res = BR.validate(rows);
  assert.ok(res.banksWithGaps.includes('VCB'), 'VCB should have year gap');
});

t('valid data passes all checks', () => {
  const rows = BR.cleanRows([mkRow()]);
  const res = BR.validate(rows);
  assert.strictEqual(res.blocks.length, 0, 'no blocks for valid data');
});

/* ======== 5. DQ score ======== */
console.log('\n--- DQ score ---');

t('perfect data scores high', () => {
  const rows = BR.cleanRows([mkRow({ source_url: 'http://x', audited_status: 'yes' })]);
  const dq = BR.dqScore(rows, [], []);
  assert.ok(dq.score >= 95, `DQ should be >= 95, got ${dq.score}`);
});

t('missing audit penalizes', () => {
  const rows = BR.cleanRows([mkRow()]);
  const dqBase = BR.dqScore(rows, [], []);
  const rowsAudit = BR.cleanRows([mkRow({ source_url: 'http://x', audited_status: 'yes' })]);
  const dqAudit = BR.dqScore(rowsAudit, [], []);
  assert.ok(dqAudit.score >= dqBase.score, 'audit fields should improve DQ');
});

/* ======== 6. Indicator computation ======== */
console.log('\n--- Indicators ---');

t('SIZE = ln(total_assets)', () => {
  const rows = BR.cleanRows([mkRow()]);
  const { indicators } = BR.computeIndicators(rows);
  near(indicators[0].size, Math.log(1800000), 1e-6);
});

t('CAR = regulatory_capital / RWA', () => {
  const rows = BR.cleanRows([mkRow()]);
  const { indicators } = BR.computeIndicators(rows);
  near(indicators[0].car, 120000 / 900000, 1e-9);
});

t('NPL = (g3 + g4 + g5) / gross_loans', () => {
  const rows = BR.cleanRows([mkRow()]);
  const { indicators } = BR.computeIndicators(rows);
  near(indicators[0].npl, (5000 + 2000 + 1000) / 1000000, 1e-9);
});

t('NIIR = (TOI - NII) / TOI', () => {
  const rows = BR.cleanRows([mkRow()]);
  const { indicators } = BR.computeIndicators(rows);
  near(indicators[0].niir, (45000 - 30000) / 45000, 1e-9);
});

t('DPRR = provision / TOI', () => {
  const rows = BR.cleanRows([mkRow()]);
  const { indicators } = BR.computeIndicators(rows);
  near(indicators[0].dprr, 3000 / 45000, 1e-9);
});

t('CIR = opex / TOI', () => {
  const rows = BR.cleanRows([mkRow()]);
  const { indicators } = BR.computeIndicators(rows);
  near(indicators[0].cir, 18000 / 45000, 1e-9);
});

t('INF stored as decimal (F-02)', () => {
  const rows = BR.cleanRows([mkRow()]);
  const { indicators } = BR.computeIndicators(rows);
  near(indicators[0].inflation, 0.0325, 1e-9);
});

t('ROA uses average assets when prior year available', () => {
  const rows = BR.cleanRows([
    mkRow({ year: 2022, total_assets: 1600000, profit_after_tax: 25000 }),
    mkRow({ year: 2023, total_assets: 1800000, profit_after_tax: 30000 })
  ]);
  const { indicators } = BR.computeIndicators(rows);
  const ind2023 = indicators.find(i => i.year === 2023);
  near(ind2023.roa, 30000 / ((1800000 + 1600000) / 2), 1e-9);
  assert.strictEqual(ind2023.roa_flag, null);
});

t('ROA falls back to end-of-period (F-01)', () => {
  const rows = BR.cleanRows([mkRow({ year: 2023 })]);
  const { indicators } = BR.computeIndicators(rows);
  near(indicators[0].roa, 30000 / 1800000, 1e-9);
  assert.strictEqual(indicators[0].roa_flag, 'roa_end_of_period');
});

t('TOI = 0 \u2192 NIIR/DPRR/CIR = null', () => {
  const rows = BR.cleanRows([mkRow({ total_operating_income: 0 })]);
  const { indicators } = BR.computeIndicators(rows);
  assert.strictEqual(indicators[0].niir, null);
  assert.strictEqual(indicators[0].dprr, null);
  assert.strictEqual(indicators[0].cir, null);
});

/* ======== 7. RISK label boundaries (F-03) ======== */
console.log('\n--- RISK label boundaries ---');

t('NPL = 3.00% exactly \u2192 RISK = 0', () => {
  const rows = BR.cleanRows([mkRow({
    group_3_loans: 20000, group_4_loans: 8000, group_5_loans: 2000,
    gross_loans: 1000000
  })]);
  const { indicators } = BR.computeIndicators(rows);
  near(indicators[0].npl, 0.03, 1e-9);
  assert.strictEqual(indicators[0].risk_label, 0, 'NPL = 3.00% exactly should be RISK=0 (strict >)');
});

t('NPL = 3.01% \u2192 RISK = 1', () => {
  const rows = BR.cleanRows([mkRow({
    group_3_loans: 20100, group_4_loans: 8000, group_5_loans: 2000,
    gross_loans: 1000000
  })]);
  const { indicators } = BR.computeIndicators(rows);
  assert.ok(indicators[0].npl > 0.03);
  assert.strictEqual(indicators[0].risk_label, 1);
});

t('CAR = 8.00% exactly \u2192 RISK = 0', () => {
  const rows = BR.cleanRows([mkRow({
    regulatory_capital: 80000, risk_weighted_assets: 1000000,
    group_3_loans: 1000, group_4_loans: 500, group_5_loans: 500, gross_loans: 1000000
  })]);
  const { indicators } = BR.computeIndicators(rows);
  near(indicators[0].car, 0.08, 1e-9);
  assert.strictEqual(indicators[0].risk_label, 0, 'CAR = 8.00% exactly should be RISK=0 (strict <)');
});

t('CAR = 7.99% \u2192 RISK = 1', () => {
  const rows = BR.cleanRows([mkRow({
    regulatory_capital: 79900, risk_weighted_assets: 1000000,
    group_3_loans: 1000, group_4_loans: 500, group_5_loans: 500, gross_loans: 1000000
  })]);
  const { indicators } = BR.computeIndicators(rows);
  assert.ok(indicators[0].car < 0.08);
  assert.strictEqual(indicators[0].risk_label, 1);
});

t('both NPL and CAR healthy \u2192 RISK = 0', () => {
  const rows = BR.cleanRows([mkRow()]);
  const { indicators } = BR.computeIndicators(rows);
  assert.strictEqual(indicators[0].risk_label, 0);
});

/* ======== 8. Logit model ======== */
console.log('\n--- Logit ---');

t('logitProb returns [0,1]', () => {
  const p = BR.logitProb({ size: 14, car: 0.12, roa: 0.01, niir: 0.2, npl: 0.01, dprr: 0.05, cir: 0.4, inflation: 0.03 });
  assert.ok(p >= 0 && p <= 1, `got ${p}`);
});

t('logitProb high risk for bad indicators', () => {
  const p = BR.logitProb({ size: 11, car: 0.05, roa: -0.03, niir: 0.05, npl: 0.15, dprr: 0.5, cir: 0.75, inflation: 0.04 });
  assert.ok(p > 0.5, `expected high prob, got ${p}`);
});

/* ======== 9. XGBoost tree evaluation ======== */
console.log('\n--- XGBoost ---');

t('evalXgb matches test vectors within 1e-6', () => {
  const artifact = M.artifact;
  for (const tv of artifact.test_vectors) {
    const p = BR.evalXgb(artifact, tv.input);
    assert.ok(p !== null, `evalXgb returned null for: ${tv.note}`);
    near(p, tv.expected, tv.tol);
  }
});

t('evalXgb healthy bank prob < 0.1', () => {
  const p = BR.evalXgb(M.artifact, { SIZE: 14.47, CAR: 0.1195, ROA: 0.017, NIIR: 0.25, NPL: 0.0095, DPRR: 0.05, CIR: 0.38, INF: 0.0325 });
  assert.ok(p !== null && p < 0.1, `expected < 0.1, got ${p}`);
});

t('evalXgb NVB-2023 prob > 0.99', () => {
  const p = BR.evalXgb(M.artifact, { SIZE: 11.88, CAR: 0.065, ROA: -0.0478, NIIR: 0.05, NPL: 0.3034, DPRR: 0.85, CIR: 0.75, INF: 0.0325 });
  assert.ok(p !== null && p > 0.99, `expected > 0.99, got ${p}`);
});

t('verifyArtifact passes demo artifact', () => {
  const res = BR.verifyArtifact(M.artifact);
  assert.ok(res.ok, 'all test vectors should pass');
  assert.strictEqual(res.results.length, 4);
});

/* ======== 10. Ensemble ======== */
console.log('\n--- Ensemble ---');

t('ensembleProb weighted average (explicit weights)', () => {
  const e = BR.ensembleProb(0.4, 0.6, 0.5, 0.5);
  near(e, 0.5);
});

t('ensembleProb default weights (0.3 logit, 0.7 xgb)', () => {
  const e = BR.ensembleProb(0.3, 0.8);
  near(e, 0.3 * 0.3 + 0.7 * 0.8, 1e-9);
});

t('ensembleProb null logit returns xgb', () => {
  assert.strictEqual(BR.ensembleProb(null, 0.7), 0.7);
});

t('ensembleProb both null returns null', () => {
  assert.strictEqual(BR.ensembleProb(null, null), null);
});

/* ======== 11. Forecasting ======== */
console.log('\n--- Forecasting ---');

t('forecastOls linear trend', () => {
  const fc = BR.forecastOls([2020, 2021, 2022, 2023, 2024], [1, 2, 3, 4, 5], 1);
  assert.ok(fc.forecast.length === 1);
  near(fc.forecast[0].point, 6, 0.01);
});

t('forecastOls requires 5 years', () => {
  const fc = BR.forecastOls([2022, 2023, 2024], [1, 2, 3], 1);
  assert.ok(fc.error, 'should error with < 5 years');
});

t('forecastMa 3-period average', () => {
  const fc = BR.forecastMa([2020, 2021, 2022, 2023, 2024], [10, 20, 30, 40, 50], 1, 3);
  near(fc.forecast[0].point, 40, 0.01);
});

t('clampForecast clamps NPL negative', () => {
  const fc = { forecast: [{ point: -0.01, lo: -0.02, hi: 0.03 }] };
  const clamped = BR.clampForecast(fc, 'npl');
  assert.strictEqual(clamped.forecast[0].point, 0);
  assert.strictEqual(clamped.forecast[0].lo, 0);
  assert.ok(clamped.clamped);
});

t('clampForecast leaves ROA alone', () => {
  const fc = { forecast: [{ point: -0.05, lo: -0.08, hi: 0.01 }] };
  const result = BR.clampForecast(fc, 'roa');
  near(result.forecast[0].point, -0.05);
});

/* ======== 12. Stress test ======== */
console.log('\n--- Stress test ---');

t('stressApply zero shock preserves NPL', () => {
  const ind = { npl: 0.02, car: 0.12, roa: 0.015, dprr: 0.05, cir: 0.40, niir: 0.20, size: 14, inflation: 0.03 };
  const raw = { gross_loans: 1000000, regulatory_capital: 120000, risk_weighted_assets: 900000, total_operating_income: 45000 };
  const out = BR.stressApply(ind, raw, 1700000, {});
  near(out.npl, ind.npl, 1e-9);
});

t('stressApply rate shock increases NPL', () => {
  const ind = { npl: 0.02, car: 0.12, roa: 0.015, dprr: 0.05, cir: 0.40, niir: 0.20, size: 14, inflation: 0.03 };
  const raw = { gross_loans: 1000000, regulatory_capital: 120000, risk_weighted_assets: 900000, total_operating_income: 45000 };
  const out = BR.stressApply(ind, raw, 1700000, { dRate: 3 });
  assert.ok(out.npl > ind.npl, `stressed NPL ${out.npl} should > baseline ${ind.npl}`);
});

t('stressApply rate shock increases CIR', () => {
  const ind = { npl: 0.02, car: 0.12, roa: 0.015, dprr: 0.05, cir: 0.40, niir: 0.20, size: 14, inflation: 0.03 };
  const raw = { gross_loans: 1000000, regulatory_capital: 120000, risk_weighted_assets: 900000, total_operating_income: 45000 };
  const out = BR.stressApply(ind, raw, 1700000, { dRate: 3 });
  assert.ok(out.cir > ind.cir, `stressed CIR ${out.cir} should > baseline ${ind.cir}`);
});

/* ======== 13. CSV export safety ======== */
console.log('\n--- CSV export ---');

t('toCSV prefixes formula injection', () => {
  const csv = BR.toCSV([['=cmd', '+foo', '-bar', '@baz', 'normal']]);
  assert.ok(csv.includes("'=cmd"), 'should prefix =');
  assert.ok(csv.includes("'+foo"), 'should prefix +');
  assert.ok(csv.includes("'-bar"), 'should prefix -');
  assert.ok(csv.includes("'@baz"), 'should prefix @');
  assert.ok(csv.includes('normal'));
});

t('toCSV escapes quotes', () => {
  const csv = BR.toCSV([['has "quotes"']]);
  assert.ok(csv.includes('"has ""quotes"""'));
});

t('toCSV BOM prefix', () => {
  const csv = BR.toCSV([['a']]);
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF);
});

/* ======== 14. FHS ======== */
console.log('\n--- FHS ---');

t('fhs returns scores for each bank', () => {
  const rows = [];
  for (let i = 0; i < 10; i++) {
    rows.push(mkRow({
      bank_code: 'B' + String(i).padStart(2, '0'),
      year: 2023,
      total_assets: 1000000 + i * 100000,
      regulatory_capital: 80000 + i * 10000,
      risk_weighted_assets: 900000,
      group_3_loans: 1000 + i * 500,
      group_4_loans: 500, group_5_loans: 500,
      gross_loans: 1000000,
      profit_after_tax: 10000 + i * 5000
    }));
  }
  const cleaned = BR.cleanRows(rows);
  const { indicators } = BR.computeIndicators(cleaned);
  const fhs = BR.fhs(indicators, 2023);
  assert.ok(fhs.scores instanceof Map, 'fhs should return {scores: Map}');
  assert.ok(fhs.scores.size > 0, 'should have scores');
  fhs.scores.forEach((s, bank) => {
    assert.ok(s >= 0 && s <= 100, `FHS score ${s} for ${bank} out of range`);
  });
});

/* ======== 15. SRI ======== */
console.log('\n--- SRI ---');

t('sri returns value when indicators have _total_assets', () => {
  const rows = [];
  for (let i = 0; i < 10; i++) {
    rows.push(mkRow({
      bank_code: 'B' + String(i).padStart(2, '0'),
      year: 2023,
      total_assets: 1000000 + i * 100000
    }));
  }
  const cleaned = BR.cleanRows(rows);
  const { indicators } = BR.computeIndicators(cleaned);
  // SRI needs _total_assets and group on each indicator
  indicators.forEach(ind => {
    ind.group = 'stable';
  });
  const sri = BR.sri(indicators, 2023);
  assert.ok(sri !== null, 'SRI should not be null');
  assert.ok(typeof sri.value === 'number', 'SRI value should be number');
  assert.ok(sri.value >= 0 && sri.value <= 100, `SRI=${sri.value}`);
});

/* ======== 16. Percentile rank ======== */
console.log('\n--- Percentile rank ---');

t('percentileRank dir=1 higher is better', () => {
  const r = BR.percentileRank(80, [50, 60, 70, 80, 90], 1);
  assert.ok(r > 50 && r < 100);
});

t('percentileRank dir=-1 inverts', () => {
  const r1 = BR.percentileRank(80, [50, 60, 70, 80, 90], 1);
  const r2 = BR.percentileRank(80, [50, 60, 70, 80, 90], -1);
  near(r1 + r2, 100, 1e-9);
});

/* ======== 17. Severity & Classification ======== */
console.log('\n--- Severity & Classification ---');

t('healthy bank classified stable', () => {
  const ind = { car: 0.12, npl: 0.01, roa: 0.015, cir: 0.40, dprr: 0.05, niir: 0.20 };
  const res = BR.classify(ind, null, null, null);
  assert.strictEqual(res.group, 'stable');
});

t('CAR < 8% classified high', () => {
  const ind = { car: 0.07, npl: 0.01, roa: 0.015, cir: 0.40, dprr: 0.05, niir: 0.20 };
  const res = BR.classify(ind, null, null, null);
  assert.ok(res.group === 'high' || res.group === 'critical');
});

t('NPL > 3% + CAR < 8% classified critical', () => {
  const ind = { car: 0.07, npl: 0.05, roa: -0.01, cir: 0.60, dprr: 0.30, niir: 0.10 };
  const res = BR.classify(ind, null, null, null);
  assert.strictEqual(res.group, 'critical');
});

/* ======== Summary ======== */
console.log(`\n${'='.repeat(40)}`);
console.log(`Total: ${total}  Pass: ${pass}  Fail: ${fail}`);
if (fail > 0) { console.log('SOME TESTS FAILED'); process.exit(1); }
else console.log('ALL TESTS PASSED \u2713');
