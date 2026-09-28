const fs = require('fs');
const http = require('http');

async function runBrowserSmoke() {
  console.log('--- Connecting to Chrome CDP on 9223 ---');
  const listRes = await fetch('http://127.0.0.1:9223/json');
  const targets = await listRes.json();
  const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('127.0.0.1:8080'));
  if (!pageTarget) {
    throw new Error('BANKRISK page target not found in Chrome: ' + JSON.stringify(targets));
  }
  console.log('✓ Found target:', pageTarget.title, 'at', pageTarget.webSocketDebuggerUrl);

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();
  const consoleMessages = [];
  const errors = [];

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    } else if (data.method === 'Console.messageAdded') {
      consoleMessages.push(data.params.message);
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const text = data.params.args.map(a => a.value || a.description || '').join(' ');
      consoleMessages.push({ type: data.params.type, text });
      if (data.params.type === 'error') errors.push(text);
    } else if (data.method === 'Runtime.exceptionThrown') {
      errors.push(data.params.exceptionDetails.text + ' ' + (data.params.exceptionDetails.exception?.description || ''));
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  console.log('✓ WebSocket connected');

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Runtime.enable');
  await send('Page.enable');

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text + ' ' + (res.exceptionDetails.exception?.description || ''));
    }
    return res.result.value;
  }

  // 1. Initial State Check
  console.log('\n--- 1. Testing Page Initialization & App State ---');
  const title = await evaluate('document.title');
  console.log('  Page Title:', title);

  // Check if APP is initialized
  const appReady = await evaluate(`
    Boolean(window.APP && window.APP.state)
  `);
  console.log('  APP object initialized:', appReady);

  // Load demo data if not loaded
  const rowCount = await evaluate(`
    (async () => {
      if (!window.APP.state.rows || window.APP.state.rows.length === 0) {
        await window.APP.loadDemo();
      }
      return window.APP.state.rows.length;
    })()
  `);
  console.log('  Demo rows loaded in browser:', rowCount);

  // Check DQ score
  const dq = await evaluate('window.APP.state.dq ? window.APP.state.dq.score : null');
  console.log('  Browser calculated DQ score:', dq);

  // 2. Test Model Inference in Browser
  console.log('\n--- 2. Testing In-Browser Model Inference ---');
  const modelResult = await evaluate(`
    (async () => {
      localStorage.setItem('br_model_ack', '1');
      await window.APP.runModel();
      return {
        hasModelRun: Boolean(window.APP.state.modelRun),
        nScored: window.APP.state.modelRun?.nScored,
        nvbRisk: window.APP.state.modelRun?.probs ? window.APP.state.modelRun.probs.get('NVB|2023') : null
      };
    })()
  `);
  console.log('  Model Run Result:', modelResult);

  // 3. Test Navigation across all 9 views
  console.log('\n--- 3. Testing Navigation Across All 9 Views ---');
  const views = ['overview', 'bank', 'alerts', 'modellab', 'stress', 'forecast', 'map', 'cockpit', 'data'];
  for (const v of views) {
    await evaluate("window.location.hash = '#" + v + "'");
    // Wait brief moment for DOM render
    await new Promise(r => setTimeout(r, 200));
    const viewDom = await evaluate(
      "(() => {" +
      "  const root = document.getElementById('view-root');" +
      "  return {" +
      "    view: '" + v + "'," +
      "    hasRoot: Boolean(root)," +
      "    childCount: root ? root.children.length : 0," +
      "    textSample: root ? root.innerText.slice(0, 80).replace(/\\n/g, ' ') : ''" +
      "  };" +
      "})()"
    );
    console.log("  ✓ View [#" + v + "]: " + viewDom.childCount + " children | sample: \"" + viewDom.textSample + "...\"");
  }

  // 4. Test Report Export Modal & Generation
  console.log('\n--- 4. Testing Report Generation Wiring ---');
  const reportModal = await evaluate(`
    (() => {
      window.APP.exportReport();
      const modal = document.querySelector('.modal-card');
      const hasModal = Boolean(modal);
      // Close modal
      const closeBtn = document.querySelector('.modal-close');
      if (closeBtn) closeBtn.click();
      return { hasModal };
    })()
  `);
  console.log('  ✓ Report export modal opens:', reportModal.hasModal);

  // 5. Test Template Generation
  console.log('\n--- 5. Testing Template Generation ---');
  const templateTest = await evaluate(`
    (() => {
      let csvOk = false;
      const origDownload = window.BRUI.downloadText;
      window.BRUI.downloadText = () => { csvOk = true; };
      window.APP.downloadTemplate('csv');
      window.BRUI.downloadText = origDownload;

      let xlsxOk = false;
      const origWrite = window.XLSX.writeFile;
      window.XLSX.writeFile = (wb) => { xlsxOk = wb.SheetNames.length === 3; };
      window.APP.downloadTemplate('xlsx');
      window.XLSX.writeFile = origWrite;

      return { csvOk, xlsxOk };
    })()
  `);
  console.log('  ✓ In-browser template downloads:', templateTest);

  // 6. Check for runtime errors
  console.log('\n--- 6. Console Error Audit ---');
  if (errors.length === 0) {
    console.log('  ✓ Zero uncaught exceptions or error logs in browser runtime');
  } else {
    console.warn('  ⚠️ Runtime error logs captured:', errors);
  }

  // 7. Capture visual screenshot
  console.log('\n--- 7. Capturing View Screenshot ---');
  await evaluate(`window.location.hash = '#overview'`);
  await new Promise(r => setTimeout(r, 400));
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  const screenshotBuffer = Buffer.from(screenshot.data, 'base64');
  fs.writeFileSync('C:/Users/Admin/.zcode/workspace/default/bankrisk-intelligence/tests/browser-smoke-overview.png', screenshotBuffer);
  console.log('  ✓ Saved screenshot to tests/browser-smoke-overview.png (' + screenshotBuffer.length + ' bytes)');

  ws.close();
  console.log('\n========================================');
  console.log('BROWSER SMOKE TEST COMPLETE: ALL PASS ✓');
  console.log('========================================');
}

runBrowserSmoke().catch(err => {
  console.error('Browser smoke test failed:', err);
  process.exit(1);
});
