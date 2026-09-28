/* ============================================================
   BANKRISK Intelligence — Integration Smoke Test
   Chạy: node tests/integration.test.js
   Kiểm tra toàn bộ luồng: tải demo, tính toán, chuyển view,
   chạy mô hình XGBoost trong trình duyệt, và xuất báo cáo.
   ============================================================ */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock browser DOM
function makeElement(tag) {
  const children = [];
  const el = {
    tagName: tag.toUpperCase(),
    className: '',
    id: '',
    style: {},
    innerHTML: '',
    textContent: '',
    children,
    childNodes: children,
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this._classes.has(c)) this._classes.delete(c);
          else this._classes.add(c);
        } else if (force) this._classes.add(c);
        else this._classes.delete(c);
      }
    },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k] || null; },
    removeAttribute(k) { delete this[k]; },
    remove() {
      if (this.parentNode && this.parentNode.children) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx !== -1) this.parentNode.children.splice(idx, 1);
      }
    },
    append(...nodes) {
      nodes.flat(9).forEach(n => {
        if (n === null || n === undefined || n === false) return;
        const node = typeof n === 'object' ? n : { textContent: String(n) };
        children.push(node);
      });
    },
    appendChild(n) { children.push(n); return n; },
    replaceChildren(...nodes) {
      children.length = 0;
      this.append(...nodes);
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector(sel) {
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        if (this.id === id) return this;
        for (const c of children) {
          if (c.querySelector) {
            const found = c.querySelector(sel);
            if (found) return found;
          }
        }
      }
      return null;
    },
    querySelectorAll() { return []; },
    dataset: {}
  };
  return el;
}

const elementsById = new Map();
function getOrCreate(id) {
  if (!elementsById.has(id)) {
    const el = makeElement('div');
    el.id = id;
    elementsById.set(id, el);
  }
  return elementsById.get(id);
}

// Pre-create known elements
const appRoot = getOrCreate('app');
const viewRoot = getOrCreate('view-root');
const pageTitle = getOrCreate('page-title');
const sourceChip = getOrCreate('source-chip');
const yearSelect = getOrCreate('year-select');

const window = {
  location: { hash: '#/overview', search: '' },
  addEventListener() {},
  removeEventListener() {},
  crypto: { subtle: {} },
  navigator: {},
  document: {
    title: '',
    readyState: 'loading',
    getElementById: (id) => getOrCreate(id),
    createElement: (tag) => makeElement(tag),
    createTextNode: (t) => ({ textContent: t }),
    querySelectorAll: () => [],
    body: makeElement('body'),
    addEventListener() {}
  },
  URL: {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {}
  }
};

global.window = window;
global.document = window.document;
global.self = window;
global.URL = window.URL;

function load(f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
}

const storage = new Map();
window.localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear()
};
storage.set('br_model_ack', '1');
global.localStorage = window.localStorage;

console.log('Loading libraries and engine modules...');
const XLSX = require('../vendor/xlsx.full.min.js');
window.XLSX = global.XLSX = XLSX;
window.echarts = global.echarts = {
  init: () => ({
    setOption: () => {},
    resize: () => {},
    dispose: () => {},
    on: () => {},
    getDataURL: () => 'data:image/png;base64,mock'
  })
};
load('js/core.js');
load('js/demo-data.js');
load('js/model-artifact.js');
load('js/pipeline.js');
load('js/ui.js');
load('js/app.js');
load('js/views/overview.js');
load('js/views/bank.js');
load('js/views/alerts.js');
load('js/views/modellab.js');
load('js/views/stress.js');
load('js/views/forecast.js');
load('js/views/map.js');
load('js/views/cockpit.js');
load('js/views/data.js');

const APP = window.APP;
const BR = window.BRCORE;
const BRUI = window.BRUI;

async function runIntegration() {
  console.log('\n--- 1. Testing loadDemo() ---');
  await APP.loadDemo();
  assert.strictEqual(APP.state.source, 'demo');
  assert.strictEqual(APP.state.rows.length, 253, 'Demo dataset must have exactly 253 rows (23 banks × 11 years)');
  assert.strictEqual(APP.state.indicators.length, 253);
  assert.strictEqual(APP.state.year, 2024);
  assert.ok(APP.state.dq && APP.state.dq.score > 80, `DQ score=${APP.state.dq ? APP.state.dq.score : 'null'}`);
  console.log('  ✓ Demo loaded: 253 rows, DQ score=' + APP.state.dq.score);

  console.log('\n--- 2. Testing NVB distress trajectory in demo data ---');
  const nvb2023 = APP.state.indicators.find(i => i.bank_code === 'NVB' && i.year === 2023);
  assert.ok(nvb2023, 'NVB 2023 must exist');
  assert.strictEqual(nvb2023.risk_label, 1, 'NVB 2023 must have RISK=1');
  assert.ok(nvb2023.npl > 0.30, `NVB 2023 NPL=${nvb2023.npl} (should be > 30%)`);
  assert.ok(nvb2023.car < 0.07, `NVB 2023 CAR=${nvb2023.car} (should be < 7%)`);
  assert.strictEqual(nvb2023.group, 'critical', 'NVB 2023 must be classified as critical');
  console.log('  ✓ NVB 2023 trajectory authentic: NPL=' + (nvb2023.npl * 100).toFixed(2) + '%, CAR=' + (nvb2023.car * 100).toFixed(2) + '%, group=' + nvb2023.group);

  console.log('\n--- 3. Testing Model Lab & In-Browser Model Inference ---');
  const scored = await APP.runModel();
  assert.ok(APP.state.modelRun !== null);
  assert.strictEqual(APP.state.modelRun.nScored, 253);
  assert.ok(nvb2023.prob !== undefined, 'NVB 2023 should have prob assigned');
  assert.ok(nvb2023.prob.xgb > 0.95, `NVB 2023 XGB prob should > 0.95, got ${nvb2023.prob.xgb}`);
  console.log('  ✓ Live in-browser model scored 253 observations. NVB 2023 distress prob: Logit=' +
    (nvb2023.prob.logit * 100).toFixed(1) + '%, XGB=' + (nvb2023.prob.xgb * 100).toFixed(1) +
    '%, Ensemble=' + (nvb2023.prob.ensemble * 100).toFixed(1) + '%');

  console.log('\n--- 4. Testing View Rendering across all 9 modules ---');
  const views = ['overview', 'bank', 'alerts', 'modellab', 'stress', 'forecast', 'map', 'cockpit', 'data'];
  for (const v of views) {
    const root = makeElement('div');
    APP.state.bank = 'NVB';
    APP.views[v].render(root);
    assert.ok(root.children.length > 0, `View ${v} should render DOM children`);
    console.log(`  ✓ View [${v}]: ${APP.views[v].title} rendered successfully (${root.children.length} root elements)`);
  }

  console.log('\n--- 5. Testing Stress Testing linear transmission ---');
  const vcb2023 = APP.state.indicators.find(i => i.bank_code === 'VCB' && i.year === 2023);
  const rawVcb = APP.state.rows.find(r => r.bank_code === 'VCB' && r.year === 2023);
  const stressed = BR.stressApply(vcb2023, rawVcb, rawVcb.total_assets, { dRate: 2, dGdp: -2 });
  assert.ok(stressed.npl > vcb2023.npl, 'Stressed NPL should increase');
  assert.ok(stressed.car < vcb2023.car, 'Stressed CAR should decrease with credit losses');
  console.log('  ✓ Stress test transmission: VCB baseline NPL ' + (vcb2023.npl * 100).toFixed(2) + '% → Stressed ' + (stressed.npl * 100).toFixed(2) + '%');

  console.log('\n--- 6. Testing Forecasting Engine ---');
  const nvbHistory = APP.state.indicators.filter(i => i.bank_code === 'NVB').sort((a, b) => a.year - b.year);
  const nvbNpls = nvbHistory.map(i => i.npl);
  const nvbYears = nvbHistory.map(i => i.year);
  const fc = BR.forecastOls(nvbYears, nvbNpls, 2);
  assert.ok(fc.forecast && fc.forecast.length === 2);
  console.log('  ✓ Forecasting OLS: NVB 2-year forecast: T+1=' + (fc.forecast[0].point * 100).toFixed(2) + '%, T+2=' + (fc.forecast[1].point * 100).toFixed(2) + '%');

  console.log('\n--- 7. Testing Template & Export Generation ---');
  let downloadedFile = null;
  const origDownloadText = BRUI.downloadText;
  BRUI.downloadText = (filename, content, type) => {
    downloadedFile = { filename, size: content.length, type };
  };

  APP.downloadTemplate('csv');
  assert.ok(downloadedFile !== null, 'CSV template should be triggered');
  assert.strictEqual(downloadedFile.filename, 'bankrisk_template_v1.csv');
  assert.ok(downloadedFile.size > 100, `CSV size ${downloadedFile.size} too small`);
  console.log('  ✓ CSV template generated: ' + downloadedFile.size + ' chars');

  let writtenXlsx = false;
  const origWriteFile = XLSX.writeFile;
  XLSX.writeFile = (wb, filename) => {
    assert.strictEqual(filename, 'bankrisk_template_v1.xlsx');
    assert.strictEqual(wb.SheetNames.length, 3, 'XLSX must have exactly 3 sheets (data, huong_dan, nguon)');
    assert.deepStrictEqual(wb.SheetNames, ['data', 'huong_dan', 'nguon']);
    writtenXlsx = true;
  };
  APP.downloadTemplate('xlsx');
  assert.ok(writtenXlsx, 'XLSX 3-sheet template should be written');
  console.log('  ✓ XLSX 3-sheet template verified: data, huong_dan, nguon');

  // Restore
  BRUI.downloadText = origDownloadText;
  XLSX.writeFile = origWriteFile;

  console.log('\n========================================');
  console.log('ALL INTEGRATION AND VIEW TESTS PASSED ✓');
  console.log('========================================');
}

runIntegration().catch(err => {
  console.error('\nINTEGRATION TEST FAILED:\n', err);
  process.exit(1);
});
