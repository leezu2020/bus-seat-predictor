import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9342;
const PROFILE_DIR = path.join(process.cwd(), 'node_modules', '.cache', 'edge_challenger1_m3');

if (!fs.existsSync(PROFILE_DIR)) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

const edgeProc = spawn(EDGE_PATH, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE_DIR}`,
  '--no-first-run',
  '--no-default-browser-check',
  'http://localhost:5173'
], { stdio: 'ignore' });

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const suiteResults = {
  timestamp: new Date().toISOString(),
  headerTests: [],
  floatingDirectionToggleTests: [],
  actionStackAndOffsetTests: [],
  analyticsModalTests: [],
  byokModalTests: [],
  landscapeStressTests: [],
  allPassed: true,
  failures: []
};

async function run() {
  try {
    await sleep(2000);
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await res.json();
    const page = list.find(p => p.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let msgId = 1;
    const pending = new Map();
    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');
    async function evaluate(fnStr) {
      const res = await send('Runtime.evaluate', {
        expression: `(${fnStr})()`,
        awaitPromise: true,
        returnByValue: true
      });
      if (res.exceptionDetails) {
        throw new Error(JSON.stringify(res.exceptionDetails));
      }
      return res.result?.value;
    }

    async function setViewport(width, height, isMobile = true) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2.625,
        mobile: isMobile
      });
      await send('Runtime.evaluate', {
        expression: 'window.dispatchEvent(new Event("resize"));'
      });
      await sleep(1000);
    }

    console.log('=== STARTING CHALLENGER 1 ADVERSARIAL SUITE ===');

    // TEST SUITE 1: Multi-Viewport Header Invariants
    const viewports = [
      { name: 'Galaxy S23 Ultra (Portrait)', width: 384, height: 824, mobile: true },
      { name: 'Large Android (Portrait)', width: 412, height: 915, mobile: true },
      { name: 'Galaxy S23 Ultra (Landscape)', width: 824, height: 384, mobile: true },
      { name: 'Tablet / Small Desktop', width: 1024, height: 768, mobile: false },
      { name: 'Desktop Widescreen', width: 1440, height: 900, mobile: false },
      { name: 'Narrow Android', width: 360, height: 740, mobile: true },
      { name: 'Min Mobile (iPhone SE)', width: 320, height: 568, mobile: true }
    ];

    for (const vp of viewports) {
      await setViewport(vp.width, vp.height, vp.mobile);
      const headerEval = await evaluate(`async function() {
        const header = document.querySelector('header');
        if (!header) return { exists: false };
        const rect = header.getBoundingClientRect();
        const docScrollWidth = document.documentElement.scrollWidth;
        const livePill = header.querySelector('div.rounded-full');
        const pillText = livePill ? livePill.innerText.replace(/\\s+/g, ' ').trim() : '';
        const buttons = Array.from(header.querySelectorAll('button'));
        const rightContainer = header.lastElementChild;
        const rightRect = rightContainer ? rightContainer.getBoundingClientRect() : null;
        const leftContainer = header.firstElementChild;
        const leftRect = leftContainer ? leftContainer.getBoundingClientRect() : null;
        const overlaps = (leftRect && rightRect) ? (leftRect.right > rightRect.left) : false;

        return {
          exists: true,
          height: rect.height,
          width: rect.width,
          docScrollWidth,
          zeroHorizontalScroll: docScrollWidth <= window.innerWidth + 1,
          heightValid: rect.height <= 56.5,
          overlaps,
          pillText,
          buttonCount: buttons.length
        };
      }`);

      const pass = headerEval.exists && headerEval.heightValid && headerEval.zeroHorizontalScroll && !headerEval.overlaps;
      suiteResults.headerTests.push({ viewport: vp, result: headerEval, pass });
      if (!pass) {
        suiteResults.allPassed = false;
        suiteResults.failures.push(`Header invariant failed on ${vp.name}: height=${headerEval.height}, zeroHScroll=${headerEval.zeroHorizontalScroll}, overlaps=${headerEval.overlaps}`);
      }
    }

    // Return to Galaxy S23 Ultra 384px portrait for mobile interactions
    await setViewport(384, 824, true);

    // TEST SUITE 2: Floating Direction Toggle
    console.log('Testing Floating Direction Toggle on 384px...');
    const dirToggleEval = await evaluate(`async function() {
      const results = {};
      const dirBtn = Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent.includes('전환') ||
        b.textContent.includes('방면') ||
        b.querySelector('svg.lucide-arrow-up-down')
      ) || document.querySelector('div.absolute.top-3.left-3 button');

      results.btnExists = !!dirBtn;
      results.initialText = dirBtn ? dirBtn.innerText.replace(/\\s+/g, ' ').trim() : '';

      // Flip 1
      if (dirBtn) {
        dirBtn.click();
        await new Promise(r => setTimeout(r, 400));
      }
      results.flippedText1 = dirBtn ? dirBtn.innerText.replace(/\\s+/g, ' ').trim() : '';

      // Flip 2
      if (dirBtn) {
        dirBtn.click();
        await new Promise(r => setTimeout(r, 400));
      }
      results.flippedText2 = dirBtn ? dirBtn.innerText.replace(/\\s+/g, ' ').trim() : '';

      // Rapid clicking stress test
      if (dirBtn) {
        for (let i = 0; i < 5; i++) {
          dirBtn.click();
          await new Promise(r => setTimeout(r, 60));
        }
        await new Promise(r => setTimeout(r, 500));
        results.textAfterRapid = dirBtn.innerText.replace(/\\s+/g, ' ').trim();

        if (!results.textAfterRapid.includes('안양역')) {
          dirBtn.click();
          await new Promise(r => setTimeout(r, 300));
        }
        results.finalText = dirBtn.innerText.replace(/\\s+/g, ' ').trim();
      } else {
        results.allButtons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim().slice(0, 30));
        results.windowWidth = window.innerWidth;
      }

      return results;
    }`);


    const dirPass = dirToggleEval.btnExists &&
      dirToggleEval.initialText.includes('안양역') &&
      dirToggleEval.flippedText1.includes('구리수택') &&
      dirToggleEval.flippedText2.includes('안양역');
    suiteResults.floatingDirectionToggleTests.push({ result: dirToggleEval, pass: dirPass });
    if (!dirPass) {
      suiteResults.allPassed = false;
      suiteResults.failures.push(`Floating Direction Toggle failed: initial=${dirToggleEval.initialText}, flip1=${dirToggleEval.flippedText1}, flip2=${dirToggleEval.flippedText2}`);
    }

    // TEST SUITE 3: Floating Action Stack & Camera Recenter Offset
    console.log('Testing Floating Action Stack & Camera Offset...');
    const actionStackEval = await evaluate(`async function() {
      const results = {};
      const actionStack = document.querySelector('div.absolute.top-3.right-3');
      results.actionStackExists = !!actionStack;
      const resetBoundsBtn = actionStack ? (actionStack.querySelector('button[title*="전체 노선"]') || actionStack.querySelector('button:first-of-type')) : null;
      const recenterBtn = actionStack ? (actionStack.querySelector('button[title*="선택 정류소"]') || actionStack.querySelector('button:last-of-type')) : null;

      results.resetBoundsBtnExists = !!resetBoundsBtn;
      results.recenterBtnExists = !!recenterBtn;

      // Select station 16
      const st16 = Array.from(document.querySelectorAll('.cursor-pointer')).find(el => el.innerText.includes('16') || el.innerText.includes('잠실'));
      if (st16) {
        st16.click();
        await new Promise(r => setTimeout(r, 500));
      }

      if (resetBoundsBtn) {
        resetBoundsBtn.click();
        await new Promise(r => setTimeout(r, 1000));
      }
      results.resetBoundsClicked = true;

      if (recenterBtn) {
        recenterBtn.click();
        await new Promise(r => setTimeout(r, 1500));
      }
      results.recenterClicked = true;

      // Find selected station marker screen coordinates
      const activePin = document.querySelector('.bg-blue-600.ring-blue-300') || document.querySelector('.bg-blue-600');
      const pinRect = activePin ? activePin.getBoundingClientRect() : null;
      results.activePinRect = pinRect ? { x: pinRect.x, y: pinRect.y } : null;

      // Center of 824px height is 412. With [0, -100] offset, pin should be in upper half (y < 412)
      results.pinInUpperHalf = pinRect ? pinRect.y < 412 : false;
      results.pinOffsetFromCenter = pinRect ? (412 - pinRect.y) : 0;

      return results;
    }`);

    const actionPass = actionStackEval.actionStackExists &&
      actionStackEval.resetBoundsBtnExists &&
      actionStackEval.recenterBtnExists &&
      actionStackEval.pinInUpperHalf;
    suiteResults.actionStackAndOffsetTests.push({ result: actionStackEval, pass: actionPass });
    if (!actionPass) {
      suiteResults.allPassed = false;
      suiteResults.failures.push(`Action Stack or Pin Offset failed: upperHalf=${actionStackEval.pinInUpperHalf}, offset=${actionStackEval.pinOffsetFromCenter}`);
    }

    // TEST SUITE 4: Analytics Modal on 384px
    console.log('Testing AnalyticsModal on 384px...');
    const analyticsEval = await evaluate(`async function() {
      const results = {};
      const analyticsBtn = document.querySelector('header button[title*="통행 분석"]');
      results.btnExists = !!analyticsBtn;

      if (analyticsBtn) {
        analyticsBtn.click();
        await new Promise(r => setTimeout(r, 700));
      }

      const modal = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('분석실'))?.closest('.shadow-2xl');
      results.modalExists = !!modal;

      if (modal) {
        const modalRect = modal.getBoundingClientRect();
        results.modalRect = { width: modalRect.width, height: modalRect.height };
        results.isFullscreen = modalRect.width >= 380 && modalRect.height >= 800;

        // Scrollability
        const scrollBody = modal.querySelector('.overflow-y-auto');
        results.scrollBodyExists = !!scrollBody;
        results.isScrollable = scrollBody ? scrollBody.scrollHeight > scrollBody.clientHeight : false;
        if (scrollBody) {
          scrollBody.scrollTop = 200;
          await new Promise(r => setTimeout(r, 100));
          results.scrolledDown = scrollBody.scrollTop > 0;
          scrollBody.scrollTop = 0;
        }

        // Tabs
        const tabs = Array.from(modal.querySelectorAll('button')).filter(b => b.textContent.includes('소요시간') || b.textContent.includes('도착'));
        results.tabCount = tabs.length;
        const tab2 = tabs.find(b => b.textContent.includes('소요시간'));
        if (tab2) {
          tab2.click();
          await new Promise(r => setTimeout(r, 600));
          const chartCanvas = modal.querySelector('canvas') || modal.querySelector('.echarts-for-react');
          results.tab2ChartRendered = !!chartCanvas;
          results.modalNoHorizontalBlowout = modal.scrollWidth <= 385;
        }

        const tab1 = tabs.find(b => b.textContent.includes('도착'));
        if (tab1) {
          tab1.click();
          await new Promise(r => setTimeout(r, 400));
        }

        // Day buttons
        const dayButtons = Array.from(modal.querySelectorAll('button')).filter(b => ['월','화','수','목','금','토','일'].includes(b.textContent.trim()));
        results.dayButtonsCount = dayButtons.length;
        if (dayButtons.length >= 2) {
          dayButtons[1].click();
          await new Promise(r => setTimeout(r, 200));
          results.day2Clicked = true;
          dayButtons[0].click();
        }

        // Close action
        const closeBtn = modal.querySelector('button:has(svg.lucide-x)') || Array.from(modal.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-x'));
        results.closeBtnExists = !!closeBtn;
        if (closeBtn) {
          closeBtn.click();
          await new Promise(r => setTimeout(r, 400));
        }
        results.modalClosedCleanly = !Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('분석실'));
      }

      return results;
    }`);

    const analyticsPass = analyticsEval.modalExists &&
      analyticsEval.isFullscreen &&
      analyticsEval.isScrollable &&
      analyticsEval.scrolledDown &&
      analyticsEval.tab2ChartRendered &&
      analyticsEval.modalNoHorizontalBlowout &&
      analyticsEval.modalClosedCleanly;
    suiteResults.analyticsModalTests.push({ result: analyticsEval, pass: analyticsPass });
    if (!analyticsPass) {
      suiteResults.allPassed = false;
      suiteResults.failures.push(`AnalyticsModal failed: fullscreen=${analyticsEval.isFullscreen}, scrollable=${analyticsEval.isScrollable}, chart=${analyticsEval.tab2ChartRendered}, closed=${analyticsEval.modalClosedCleanly}`);
    }

    // TEST SUITE 5: ByokModal on 384px
    console.log('Testing ByokModal on 384px...');
    const byokEval = await evaluate(`async function() {
      const results = {};
      const byokBtn = document.querySelector('header button[title*="API 키"]');
      results.btnExists = !!byokBtn;

      if (byokBtn) {
        byokBtn.click();
        await new Promise(r => setTimeout(r, 600));
      }

      const modal = document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80');
      results.modalExists = !!modal;

      if (modal) {
        const modalRect = modal.getBoundingClientRect();
        results.modalWidth = modalRect.width;
        results.modalFitsScreen = modalRect.width <= 365;

        const demoBtn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent.includes('DEMO_KEY'));
        const input = modal.querySelector('input[type="password"]');
        const cancelBtn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent.trim() === '취소');
        const saveBtn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent.includes('저장'));

        results.demoBtnExists = !!demoBtn;
        results.inputExists = !!input;
        results.cancelBtnExists = !!cancelBtn;
        results.saveBtnExists = !!saveBtn;

        if (demoBtn) {
          demoBtn.click();
          await new Promise(r => setTimeout(r, 200));
        }
        results.inputValAfterDemo = input ? input.value : '';

        if (cancelBtn) {
          cancelBtn.click();
          await new Promise(r => setTimeout(r, 400));
        }
        results.modalClosedViaCancel = !document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80');

        // Test Re-open and Close via X
        byokBtn.click();
        await new Promise(r => setTimeout(r, 400));
        const reopenModal = document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80');
        const xBtn = reopenModal ? (reopenModal.querySelector('button:has(svg.lucide-x)') || reopenModal.querySelector('button')) : null;
        if (xBtn) {
          xBtn.click();
          await new Promise(r => setTimeout(r, 400));
        }
        results.modalClosedViaX = !document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80');
      }

      return results;
    }`);

    const byokPass = byokEval.modalExists &&
      byokEval.modalFitsScreen &&
      byokEval.inputValAfterDemo === 'DEMO_KEY' &&
      byokEval.modalClosedViaCancel &&
      byokEval.modalClosedViaX;
    suiteResults.byokModalTests.push({ result: byokEval, pass: byokPass });
    if (!byokPass) {
      suiteResults.allPassed = false;
      suiteResults.failures.push(`ByokModal failed: fitsScreen=${byokEval.modalFitsScreen}, demoKey=${byokEval.inputValAfterDemo}, cancelClose=${byokEval.modalClosedViaCancel}`);
    }

    // TEST SUITE 6: Landscape 824x384 Stress Test
    console.log('Testing Landscape 824x384 Stress Test...');
    await setViewport(824, 384, true);
    const landscapeEval = await evaluate(`async function() {
      const results = {};

      // 1. Header on landscape
      const header = document.querySelector('header');
      const headerRect = header ? header.getBoundingClientRect() : null;
      results.headerHeightLandscape = headerRect ? headerRect.height : 0;
      results.headerValidLandscape = headerRect ? headerRect.height <= 56.5 : false;

      // 2. Direction toggle should be hidden on desktop/landscape (width 824 >= 640)
      const dirToggle = document.querySelector('div.absolute.top-3.left-3 button');
      results.dirToggleHiddenOnLandscape = !dirToggle || dirToggle.offsetParent === null;

      // 3. AnalyticsModal on landscape
      const analyticsBtn = document.querySelector('header button[title*="통행 분석"]');
      if (analyticsBtn) {
        analyticsBtn.click();
        await new Promise(r => setTimeout(r, 600));
      }
      const analyticsModal = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('분석실'))?.closest('.shadow-2xl');
      if (analyticsModal) {
        const modalRect = analyticsModal.getBoundingClientRect();
        results.analyticsModalHeight = modalRect.height;
        const scrollBody = analyticsModal.querySelector('.overflow-y-auto');
        results.analyticsScrollable = scrollBody ? scrollBody.scrollHeight > scrollBody.clientHeight : false;

        const closeBtn = analyticsModal.querySelector('button:has(svg.lucide-x)') || Array.from(analyticsModal.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-x'));
        const closeRect = closeBtn ? closeBtn.getBoundingClientRect() : null;
        results.analyticsCloseBtnVisible = closeRect ? (closeRect.top >= 0 && closeRect.bottom <= 384) : false;
        if (closeBtn) {
          closeBtn.click();
          await new Promise(r => setTimeout(r, 400));
        }
        results.analyticsClosed = !Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('분석실'));
      }

      // 4. ByokModal on landscape
      const byokBtn = document.querySelector('header button[title*="API 키"]');
      if (byokBtn) {
        byokBtn.click();
        await new Promise(r => setTimeout(r, 500));
      }
      const byokModal = document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80');
      if (byokModal) {
        const modalRect = byokModal.getBoundingClientRect();
        results.byokModalHeight = modalRect.height;
        results.byokScrollable = byokModal.scrollHeight > byokModal.clientHeight;
        const cancelBtn = Array.from(byokModal.querySelectorAll('button')).find(b => b.textContent.trim() === '취소');
        const cancelRect = cancelBtn ? cancelBtn.getBoundingClientRect() : null;
        results.byokCancelBtnAccessible = !!cancelBtn && (cancelRect.top >= 0 && cancelRect.bottom <= 384);
        if (cancelBtn) {
          cancelBtn.click();
          await new Promise(r => setTimeout(r, 400));
        }
        results.byokClosed = !document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80');
      }

      return results;
    }`);

    const landscapePass = landscapeEval.headerValidLandscape &&
      landscapeEval.dirToggleHiddenOnLandscape &&
      landscapeEval.analyticsCloseBtnVisible &&
      landscapeEval.analyticsClosed &&
      landscapeEval.byokCancelBtnAccessible &&
      landscapeEval.byokClosed;
    suiteResults.landscapeStressTests.push({ result: landscapeEval, pass: landscapePass });
    if (!landscapePass) {
      suiteResults.allPassed = false;
      suiteResults.failures.push(`Landscape stress test failed: header=${landscapeEval.headerValidLandscape}, toggleHidden=${landscapeEval.dirToggleHiddenOnLandscape}, analyticsCloseVisible=${landscapeEval.analyticsCloseBtnVisible}, byokCancelAccessible=${landscapeEval.byokCancelBtnAccessible}`);
    }

    console.log('=== CHALLENGER 1 ADVERSARIAL SUITE FINISHED ===');
    console.log('ALL PASSED:', suiteResults.allPassed);
    console.log('FAILURES COUNT:', suiteResults.failures.length);
    if (suiteResults.failures.length > 0) {
      console.log('Failures:', suiteResults.failures);
    }

    fs.writeFileSync('challenger1_m3_results.json', JSON.stringify(suiteResults, null, 2), 'utf-8');

    edgeProc.kill('SIGKILL');
    process.exit(suiteResults.allPassed ? 0 : 1);
  } catch (err) {
    console.error('[SUITE EXCEPTION]', err);
    suiteResults.allPassed = false;
    suiteResults.failures.push(err.message);
    fs.writeFileSync('challenger1_m3_results.json', JSON.stringify(suiteResults, null, 2), 'utf-8');
    edgeProc.kill('SIGKILL');
    process.exit(1);
  }
}

run();

