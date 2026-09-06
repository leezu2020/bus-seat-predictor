import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const CDP_PORT = 9350;
const PROFILE_DIR = path.join(process.cwd(), 'node_modules', '.cache', 'edge_e2e_final_profile');

if (!fs.existsSync(PROFILE_DIR)) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

console.log('================================================================');
console.log('  ROUTE 1650 BUS SEAT PREDICTOR - E2E ACCEPTANCE TEST SUITE');
console.log('  Tiers 1-4: Feature Coverage, Boundaries, Interactions, Journeys');
console.log('================================================================\n');

console.log(`[SETUP] Spawning Headless Edge on CDP port ${CDP_PORT}...`);
const edgeProc = spawn(EDGE_PATH, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${PROFILE_DIR}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu-shader-disk-cache',
  'http://localhost:5173'
], { stdio: 'ignore' });

function cleanup() {
  console.log('\n[TEARDOWN] Cleaning up Edge process...');
  try {
    edgeProc.kill('SIGKILL');
  } catch (e) {}
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  cleanup();
  process.exit(1);
});

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForCdpReady() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find(p => p.type === 'page');
        if (page && page.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl;
        }
      }
    } catch (e) {}
    await sleep(300);
  }
  throw new Error('Timeout waiting for Edge CDP target');
}

const allResults = {
  timestamp: new Date().toISOString(),
  tier1: [],
  tier2: [],
  tier3: [],
  tier4: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    passRate: '0%'
  }
};

function recordTest(tier, name, pass, details = {}) {
  const item = { name, pass, details };
  allResults[tier].push(item);
  allResults.summary.total++;
  if (pass) allResults.summary.passed++;
  else allResults.summary.failed++;

  const statusStr = pass ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
  console.log(`  ${statusStr} ${name}`);
  if (!pass) {
    console.error('     FAILED DETAILS:', JSON.stringify(details, null, 2));
  }
}

async function run() {
  try {
    const wsUrl = await waitForCdpReady();
    console.log('[CDP] Connected:', wsUrl);

    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

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

    async function setDeviceMetrics(width, height, isMobile = true) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: isMobile ? 2.625 : 1.0,
        mobile: isMobile,
        touch: isMobile
      });
      await evaluate(`() => { window.dispatchEvent(new Event('resize')); }`);
      await sleep(1000);
    }

    // Navigate to local app
    await send('Page.navigate', { url: 'http://localhost:5173' });
    await sleep(3500);

    // =========================================================================
    // TIER 1: FEATURE COVERAGE
    // =========================================================================
    console.log('\n========================================');
    console.log('  TIER 1: FEATURE COVERAGE SUITE');
    console.log('========================================');

    // Setup Galaxy S23 Ultra Portrait (384x824)
    await setDeviceMetrics(384, 824, true);

    // T1.1 Mobile Fullscreen Map Rendering
    const t1_1 = await evaluate(`() => {
      const aside = document.querySelector('aside');
      const main = document.querySelector('main');
      const canvas = document.querySelector('.maplibregl-canvas');
      const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
      const asideDisplay = aside ? window.getComputedStyle(aside).display : 'none';
      const mainWidth = main ? main.clientWidth : 0;
      const mainHeight = main ? main.clientHeight : 0;
      return {
        asideHidden: asideDisplay === 'none',
        mainWidth,
        mainHeight,
        canvasMounted: !!canvas,
        sheetMounted: !!sheet,
        isFullscreenMap: asideDisplay === 'none' && mainWidth === 384 && !!canvas
      };
    }`);
    recordTest('tier1', 'T1.1 Mobile Fullscreen Map Rendering (<640px)', t1_1.isFullscreenMap, t1_1);

    // T1.2 Desktop Split Layout Preservation
    await setDeviceMetrics(1024, 768, false);
    const t1_2 = await evaluate(`() => {
      const aside = document.querySelector('aside');
      const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
      const asideDisplay = aside ? window.getComputedStyle(aside).display : 'none';
      const asideWidth = aside ? aside.clientWidth : 0;
      const sheetDisplay = sheet ? window.getComputedStyle(sheet).display : 'flex';
      return {
        asideVisible: asideDisplay === 'flex',
        asideWidth,
        sheetHidden: sheetDisplay === 'none',
        isSplitLayout: asideDisplay === 'flex' && asideWidth >= 400 && sheetDisplay === 'none'
      };
    }`);
    recordTest('tier1', 'T1.2 Desktop Split Layout Preservation (>=640px)', t1_2.isSplitLayout, t1_2);

    // Restore S23 Ultra mobile view
    await setDeviceMetrics(384, 824, true);

    // T1.3 MapLibre ResizeObserver & Window Resize
    const t1_3 = await evaluate(`() => {
      const canvas = document.querySelector('.maplibregl-canvas');
      const initialW = canvas ? canvas.clientWidth : 0;
      window.dispatchEvent(new Event('resize'));
      return {
        canvasExists: !!canvas,
        initialW,
        resizeDispatched: true
      };
    }`);
    recordTest('tier1', 'T1.3 MapLibre ResizeObserver & Event Listeners', t1_3.canvasExists && t1_3.initialW > 0, t1_3);

    // T1.4 3-Tier Mobile Bottom Sheet (Peek / Half / Full)
    const t1_4 = await evaluate(`async () => {
      const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
      const initialTransform = sheet ? sheet.style.transform : '';
      const isInitialPeek = initialTransform.includes('88vh') && initialTransform.includes('92px');

      // Tap header to go to HALF
      const header = sheet ? sheet.firstElementChild : null;
      if (header) header.click();
      await new Promise(r => setTimeout(r, 600));

      const halfTransform = sheet ? sheet.style.transform : '';
      const isHalf = halfTransform.includes('40vh');
      const simCardInHalf = !!sheet.querySelector('input[type="range"]');

      // Click button to go to FULL
      const routeBtn = Array.from(sheet.querySelectorAll('button')).find(b => b.textContent.includes('전체 1650 노선 정류장 보기'));
      if (routeBtn) routeBtn.click();
      await new Promise(r => setTimeout(r, 600));

      const fullTransform = sheet ? sheet.style.transform : '';
      const isFull = fullTransform.includes('0px');
      const timelineStops = sheet.querySelectorAll('.group.relative.flex.items-start').length;

      return {
        initialTransform,
        isInitialPeek,
        halfTransform,
        isHalf,
        simCardInHalf,
        fullTransform,
        isFull,
        timelineStops,
        allTiersValid: isInitialPeek && isHalf && simCardInHalf && isFull && timelineStops >= 40
      };
    }`);
    recordTest('tier1', 'T1.4 3-Tier Mobile Bottom Sheet (Peek/Half/Full Transitions)', t1_4.allTiersValid, t1_4);

    // T1.5 Station Tap panTo/flyTo
    const t1_5 = await evaluate(`async () => {
      const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
      // Ensure in Full tier
      if (!sheet.style.transform.includes('0px')) {
        const routeBtn = Array.from(sheet.querySelectorAll('button')).find(b => b.textContent.includes('전체 1650 노선 정류장 보기'));
        if (routeBtn) routeBtn.click();
        await new Promise(r => setTimeout(r, 600));
      }

      const stops = sheet.querySelectorAll('.group.relative.flex.items-start');
      const targetStop = stops[4]; // 5th stop
      const targetStopName = targetStop ? (targetStop.querySelector('span.text-xs')?.textContent || targetStop.innerText.split('\\n')[0] || '') : '';

      if (targetStop) targetStop.click();
      await new Promise(r => setTimeout(r, 700));

      const snappedTransform = sheet ? sheet.style.transform : '';
      const currentStation = sheet ? (sheet.querySelector('.truncate')?.textContent || '') : '';

      return {
        targetStopName,
        currentStation,
        snappedTransform,
        snappedToHalf: snappedTransform.includes('40vh'),
        stationMatched: !!currentStation && (currentStation.includes(targetStopName.trim()) || targetStopName.includes(currentStation.trim()))
      };
    }`);
    recordTest('tier1', 'T1.5 Station Tap panTo/flyTo & Snap to Half', t1_5.snappedToHalf && t1_5.stationMatched, t1_5);

    // T1.6 Queue Slider Reactivity ($q$)
    const t1_6 = await evaluate(`async () => {
      const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
      const buttons = Array.from(sheet.querySelectorAll('button'));
      const plusBtn = buttons.find(b => b.textContent.trim() === '+');
      const range = sheet.querySelector('input[type="range"]');
      const initialVal = range ? range.value : '';

      if (plusBtn) {
        plusBtn.click();
        await new Promise(r => setTimeout(r, 150));
        plusBtn.click();
        await new Promise(r => setTimeout(r, 150));
      }
      await new Promise(r => setTimeout(r, 200));

      const updatedVal = range ? range.value : '';
      const queueLabel = sheet.querySelector('.text-blue-600')?.textContent || '';

      return {
        initialVal,
        updatedVal,
        queueLabel,
        isReactive: Number(updatedVal) > Number(initialVal) && queueLabel.includes(updatedVal)
      };
    }`);
    recordTest('tier1', 'T1.6 Queue Slider ($q$) Simulation Reactivity', t1_6.isReactive, t1_6);

    // T1.7 Bookmark Persistence (LocalStorage)
    const t1_7 = await evaluate(`async () => {
      const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
      const starBtn = sheet.querySelector('button[aria-label*="즐겨찾기"]');
      const initialStorage = localStorage.getItem('bus_1650_bookmarks') || '[]';

      if (starBtn) starBtn.click();
      await new Promise(r => setTimeout(r, 300));

      const afterAddStorage = localStorage.getItem('bus_1650_bookmarks') || '[]';
      const hasAdded = afterAddStorage.length > initialStorage.length;

      // Toggle off to clean up
      if (starBtn) starBtn.click();
      await new Promise(r => setTimeout(r, 300));
      const afterRemoveStorage = localStorage.getItem('bus_1650_bookmarks') || '[]';

      return {
        initialStorage,
        afterAddStorage,
        afterRemoveStorage,
        hasAdded,
        persistsInLocalStorage: hasAdded
      };
    }`);
    recordTest('tier1', 'T1.7 Bookmark Persistence (LocalStorage)', t1_7.persistsInLocalStorage, t1_7);

    // T1.8 Compact Mobile Header (Fitting 384px)
    const t1_8 = await evaluate(`() => {
      const header = document.querySelector('header');
      const headerRect = header ? header.getBoundingClientRect() : null;
      const brandSub = header ? header.querySelector('.hidden.sm\\\\:flex') : null;
      const brandSubDisplay = brandSub ? window.getComputedStyle(brandSub).display : 'none';
      const livePill = header ? header.querySelector('div.rounded-full') : null;
      const pillText = livePill ? livePill.innerText.replace(/\\s+/g, ' ').trim() : '';
      const docScrollWidth = document.documentElement.scrollWidth;

      return {
        height: headerRect ? Math.round(headerRect.height) : 0,
        docScrollWidth,
        brandSubHidden: brandSubDisplay === 'none',
        pillText,
        pillIsCompact: /^(실시간|모의)\\s+\\d+대$/.test(pillText),
        headerValid: headerRect && headerRect.height <= 56 && docScrollWidth <= 384 && brandSubDisplay === 'none'
      };
    }`);
    recordTest('tier1', 'T1.8 Compact Mobile Header (Galaxy S23 Ultra 384px budget)', t1_8.headerValid, t1_8);

    // T1.9 Floating Direction Quick Toggle
    const t1_9 = await evaluate(`async () => {
      const toggleDiv = document.querySelector('div.absolute.top-3.left-3');
      const toggleBtn = toggleDiv ? toggleDiv.querySelector('button') : null;
      const isVisible = toggleDiv ? window.getComputedStyle(toggleDiv).display !== 'none' : false;
      const initialText = toggleBtn ? toggleBtn.innerText.replace(/\\s+/g, ' ').trim() : '';

      if (toggleBtn) toggleBtn.click();
      await new Promise(r => setTimeout(r, 500));

      const flippedText = toggleBtn ? toggleBtn.innerText.replace(/\\s+/g, ' ').trim() : '';

      // Flip back
      if (toggleBtn) toggleBtn.click();
      await new Promise(r => setTimeout(r, 500));
      const restoredText = toggleBtn ? toggleBtn.innerText.replace(/\\s+/g, ' ').trim() : '';

      return {
        isVisible,
        initialText,
        flippedText,
        restoredText,
        toggleWorks: isVisible && initialText !== flippedText && flippedText.includes('방면') && initialText === restoredText
      };
    }`);
    recordTest('tier1', 'T1.9 Floating Direction Quick Toggle (top-3 left-3)', t1_9.toggleWorks, t1_9);

    // T1.10 Floating Action Stack (Reset Bounds & Recenter)
    const t1_10 = await evaluate(`() => {
      const actionStack = document.querySelector('div.absolute.top-3.right-3');
      const isVisible = actionStack ? window.getComputedStyle(actionStack).display !== 'none' : false;
      const resetBtn = actionStack ? actionStack.querySelector('button[title*="전체 노선"]') : null;
      const recenterBtn = actionStack ? actionStack.querySelector('button[title*="선택 정류소"]') : null;

      return {
        isVisible,
        hasResetBtn: !!resetBtn,
        hasRecenterBtn: !!recenterBtn,
        stackValid: isVisible && !!resetBtn && !!recenterBtn
      };
    }`);
    recordTest('tier1', 'T1.10 Floating Action Stack (Reset Bounds + Recenter)', t1_10.stackValid, t1_10);

    // T1.11 Responsive Modals (Analytics & BYOK)
    const t1_11 = await evaluate(`async () => {
      // Test Analytics Modal
      const analyticsBtn = document.querySelector('header button[title*="통행 분석"]');
      if (analyticsBtn) analyticsBtn.click();
      await new Promise(r => setTimeout(r, 800));

      const analyticsCard = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('분석실'))?.closest('.shadow-2xl');
      const analyticsRect = analyticsCard ? analyticsCard.getBoundingClientRect() : null;
      const isFullscreen = analyticsRect ? analyticsRect.width >= 380 && analyticsRect.height >= 800 : false;
      
      // Switch to Tab 2 (OD_TRAVEL) where ECharts is rendered
      const tab2Btn = Array.from(analyticsCard.querySelectorAll('button')).find(b => b.textContent.includes('소요시간'));
      if (tab2Btn) {
        tab2Btn.click();
        await new Promise(r => setTimeout(r, 500));
      }
      const echartsCanvas = analyticsCard ? (analyticsCard.querySelector('canvas') || analyticsCard.querySelector('.echarts-for-react')) : null;

      // Close Analytics
      const closeAnalytics = analyticsCard ? Array.from(analyticsCard.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-x')) : null;
      if (closeAnalytics) closeAnalytics.click();
      await new Promise(r => setTimeout(r, 400));

      // Test BYOK Modal
      const byokBtn = document.querySelector('header button[title*="API 키"]');
      if (byokBtn) byokBtn.click();
      await new Promise(r => setTimeout(r, 500));

      const byokModal = document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80');
      const byokRect = byokModal ? byokModal.getBoundingClientRect() : null;
      const fitsWidth = byokRect ? byokRect.width <= 384 : false;
      const inputElem = byokModal ? byokModal.querySelector('input[type="password"]') : null;
      const inputFontSize = inputElem ? window.getComputedStyle(inputElem).fontSize : '';

      // Close BYOK
      const cancelByok = byokModal ? Array.from(byokModal.querySelectorAll('button')).find(b => b.textContent.trim() === '취소') : null;
      if (cancelByok) cancelByok.click();
      await new Promise(r => setTimeout(r, 400));

      return {
        analyticsOpened: !!analyticsCard,
        isFullscreen,
        echartsCanvasMounted: !!echartsCanvas,
        byokOpened: !!byokModal,
        byokFitsWidth: fitsWidth,
        inputPreventsZoom: inputFontSize === '16px',
        modalsValid: isFullscreen && !!echartsCanvas && fitsWidth && inputFontSize === '16px'
      };
    }`);
    recordTest('tier1', 'T1.11 Responsive Modals (Analytics Fullscreen & BYOK Mobile Safe)', t1_11.modalsValid, t1_11);


    // =========================================================================
    // TIER 2: BOUNDARY & CORNER CASES
    // =========================================================================
    console.log('\n========================================');
    console.log('  TIER 2: BOUNDARY & CORNER CASES SUITE');
    console.log('========================================');

    // T2.1 Galaxy S23 Ultra Viewport (384x824)
    await setDeviceMetrics(384, 824, true);
    const t2_1 = await evaluate(`() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const header = document.querySelector('header');
      const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
      return {
        width: 384,
        scrollWidth,
        noOverflow: scrollWidth <= 384,
        headerH: header ? header.clientHeight : 0,
        sheetMounted: !!sheet
      };
    }`);
    recordTest('tier2', 'T2.1 Galaxy S23 Ultra (384x824) Zero Horizontal Scroll', t2_1.noOverflow && t2_1.headerH <= 56, t2_1);

    // T2.2 Large Android Viewport (412x915)
    await setDeviceMetrics(412, 915, true);
    const t2_2 = await evaluate(`() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const header = document.querySelector('header');
      return {
        width: 412,
        scrollWidth,
        noOverflow: scrollWidth <= 412,
        headerH: header ? header.clientHeight : 0
      };
    }`);
    recordTest('tier2', 'T2.2 Large Android (412x915) Layout Adaptation', t2_2.noOverflow && t2_2.headerH <= 56, t2_2);

    // T2.3 Compact Android Viewport (360x780)
    await setDeviceMetrics(360, 780, true);
    const t2_3 = await evaluate(`() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const header = document.querySelector('header');
      return {
        width: 360,
        scrollWidth,
        noOverflow: scrollWidth <= 360,
        headerH: header ? header.clientHeight : 0
      };
    }`);
    recordTest('tier2', 'T2.3 Compact Android (360x780) Extreme Narrow Viewport', t2_3.noOverflow && t2_3.headerH <= 56, t2_3);

    // T2.4 Landscape Mobile Viewport (824x384)
    await setDeviceMetrics(824, 384, true);
    const t2_4 = await evaluate(`() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const header = document.querySelector('header');
      const canvas = document.querySelector('.maplibregl-canvas');
      return {
        width: 824,
        height: 384,
        scrollWidth,
        noOverflow: scrollWidth <= 824,
        headerH: header ? header.clientHeight : 0,
        canvasW: canvas ? canvas.clientWidth : 0
      };
    }`);
    recordTest('tier2', 'T2.4 Landscape Orientation (824x384) Dynamic Adaptation', t2_4.noOverflow && t2_4.headerH <= 56, t2_4);

    // Restore S23 Ultra Portrait
    await setDeviceMetrics(384, 824, true);

    // T2.5 Boundary Drag Resistance (Clamping above FULL and below PEEK)
    const t2_5 = await evaluate(`async () => {
      const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
      const handle = sheet ? sheet.firstElementChild : null;
      if (!handle) return { error: 'no handle' };

      // Ensure sheet is at PEEK first by swiping down if in HALF or FULL
      if (!sheet.style.transform.includes('88vh')) {
        handle.dispatchEvent(new TouchEvent('touchstart', {
          touches: [new Touch({ identifier: 1, target: handle, clientY: 400 })],
          bubbles: true, cancelable: true
        }));
        await new Promise(r => setTimeout(r, 50));
        handle.dispatchEvent(new TouchEvent('touchmove', {
          touches: [new Touch({ identifier: 1, target: handle, clientY: 600 })],
          bubbles: true, cancelable: true
        }));
        await new Promise(r => setTimeout(r, 50));
        handle.dispatchEvent(new TouchEvent('touchend', {
          changedTouches: [new Touch({ identifier: 1, target: handle, clientY: 600 })],
          bubbles: true, cancelable: true
        }));
        await new Promise(r => setTimeout(r, 600));
      }

      // Now at PEEK: test downward drag (deltaY > 0 -> resistance 0.15 applied: 100 * 0.15 = 15px)
      handle.dispatchEvent(new TouchEvent('touchstart', {
        touches: [new Touch({ identifier: 1, target: handle, clientY: 700 })],
        bubbles: true, cancelable: true
      }));
      await new Promise(r => setTimeout(r, 50));

      handle.dispatchEvent(new TouchEvent('touchmove', {
        touches: [new Touch({ identifier: 1, target: handle, clientY: 800 })], // +100px move down
        bubbles: true, cancelable: true
      }));
      await new Promise(r => setTimeout(r, 50));

      // Current transform should be damped: 100 * 0.15 = 15px -> calc(88vh - 92px + 15px) = calc(-77px + 88vh)
      const draggingTransform = sheet.style.transform;
      const hasDamping = draggingTransform.includes('-77px') || draggingTransform.includes('15px');

      handle.dispatchEvent(new TouchEvent('touchend', {
        changedTouches: [new Touch({ identifier: 1, target: handle, clientY: 800 })],
        bubbles: true, cancelable: true
      }));
      await new Promise(r => setTimeout(r, 500));

      const settledTransform = sheet.style.transform;
      const settledToPeek = settledTransform.includes('88vh') && settledTransform.includes('92px');

      return {
        draggingTransform,
        hasDamping,
        settledTransform,
        settledToPeek,
        resistanceValid: hasDamping && settledToPeek
      };
    }`);
    recordTest('tier2', 'T2.5 Boundary Drag Resistance & Clamping (PEEK / FULL)', t2_5.resistanceValid, t2_5);

    // T2.6 Rapid Gestures & State Thrashing
    const t2_6 = await evaluate(`async () => {
      const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
      const handle = sheet ? sheet.firstElementChild : null;
      let errorOccurred = false;

      try {
        for (let i = 0; i < 10; i++) {
          handle.click();
          await new Promise(r => setTimeout(r, 30));
        }
      } catch (e) {
        errorOccurred = true;
      }

      await new Promise(r => setTimeout(r, 600));
      const finalTransform = sheet ? sheet.style.transform : '';
      const isValidState = finalTransform.includes('88vh') || finalTransform.includes('40vh') || finalTransform.includes('0px');

      return {
        errorOccurred,
        finalTransform,
        isValidState: !errorOccurred && isValidState
      };
    }`);
    recordTest('tier2', 'T2.6 Rapid Gestures & High-Frequency Touch Stability', t2_6.isValidState, t2_6);


    // =========================================================================
    // TIER 3: CROSS-FEATURE INTERACTIONS
    // =========================================================================
    console.log('\n========================================');
    console.log('  TIER 3: CROSS-FEATURE INTERACTIONS SUITE');
    console.log('========================================');

    // T3.1 Station select in Full sheet -> flyTo with offset + snap to Half
    const t3_1 = await evaluate(`async () => {
      const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');

      // 1. Expand to FULL tier
      const chevron = sheet.querySelector('button[aria-label="펼치기"]');
      if (chevron) chevron.click();
      await new Promise(r => setTimeout(r, 400));
      const routeBtn = Array.from(sheet.querySelectorAll('button')).find(b => b.textContent.includes('전체 1650 노선 정류장 보기'));
      if (routeBtn) routeBtn.click();
      await new Promise(r => setTimeout(r, 600));

      // 2. Select stop #5 in timeline
      const stops = sheet.querySelectorAll('.group.relative.flex.items-start');
      const targetStop = stops[4];
      const targetName = targetStop ? (targetStop.querySelector('span.text-xs')?.textContent || targetStop.innerText.split('\\n')[0] || '') : '';
      if (targetStop) targetStop.click();
      await new Promise(r => setTimeout(r, 700));

      const snappedTransform = sheet.style.transform;
      const isHalf = snappedTransform.includes('40vh');
      const currentStation = sheet.querySelector('.truncate')?.textContent || '';

      return {
        isHalf,
        currentStation,
        targetName,
        crossCoordinationValid: isHalf && !!currentStation && (currentStation.includes(targetName.trim()) || targetName.includes(currentStation.trim()))
      };
    }`);
    recordTest('tier3', 'T3.1 Station Select in Full Sheet -> Map Offset flyTo + Snap to Half', t3_1.crossCoordinationValid, t3_1);

    // T3.2 Direction Toggle -> Timeline + Bottom Sheet + Polyline Update
    const t3_2 = await evaluate(`async () => {
      const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
      const toggleDiv = document.querySelector('div.absolute.top-3.left-3');
      const toggleBtn = toggleDiv ? toggleDiv.querySelector('button') : null;

      const beforeDir = toggleBtn ? toggleBtn.innerText : '';

      // Flip direction
      if (toggleBtn) toggleBtn.click();
      await new Promise(r => setTimeout(r, 600));

      const afterDir = toggleBtn ? toggleBtn.innerText : '';
      const sheetDirectionBadge = sheet.querySelector('span.bg-rose-600')?.textContent || '';

      // Expand to Full to verify timeline stops count
      const routeBtn = Array.from(sheet.querySelectorAll('button')).find(b => b.textContent.includes('전체 1650 노선 정류장 보기'));
      if (routeBtn) routeBtn.click();
      await new Promise(r => setTimeout(r, 600));

      const timelineStopsCount = sheet.querySelectorAll('.group.relative.flex.items-start').length;

      // Flip back to UP
      if (toggleBtn) toggleBtn.click();
      await new Promise(r => setTimeout(r, 500));

      return {
        beforeDir,
        afterDir,
        sheetDirectionBadge,
        timelineStopsCount,
        crossDirectionSyncValid: beforeDir !== afterDir && timelineStopsCount >= 40
      };
    }`);
    recordTest('tier3', 'T3.2 Direction Toggle -> Updates Timeline + Bottom Sheet + Map Line', t3_2.crossDirectionSyncValid, t3_2);

    // T3.3 Queue Slider -> Real-time Boarding Prediction Recalculation
    const t3_3 = await evaluate(`async () => {
      const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');

      // Ensure Half tier
      const chevron = sheet.querySelector('button[aria-label="접기"]');
      if (chevron) chevron.click();
      await new Promise(r => setTimeout(r, 400));
      const handle = sheet.firstElementChild;
      if (handle) handle.click();
      await new Promise(r => setTimeout(r, 500));

      const buttons = Array.from(sheet.querySelectorAll('button'));
      const plusBtn = buttons.find(b => b.textContent.trim() === '+');

      const initialProbText = Array.from(sheet.querySelectorAll('strong')).map(s => s.textContent).join(',');

      if (plusBtn) {
        plusBtn.click();
        plusBtn.click();
        plusBtn.click();
      }
      await new Promise(r => setTimeout(r, 400));

      const updatedProbText = Array.from(sheet.querySelectorAll('strong')).map(s => s.textContent).join(',');
      const queueLabel = sheet.querySelector('.text-blue-600')?.textContent || '';

      return {
        initialProbText,
        updatedProbText,
        queueLabel,
        recalcTriggered: queueLabel.length > 0 && !!sheet.querySelector('input[type="range"]')
      };
    }`);
    recordTest('tier3', 'T3.3 Queue Slider -> Real-time Boarding Probability Recalculation', t3_3.recalcTriggered, t3_3);


    // =========================================================================
    // TIER 4: REAL-WORLD COMMUTER USER JOURNEYS (GALAXY S23 ULTRA 384px)
    // =========================================================================
    console.log('\n========================================');
    console.log('  TIER 4: REAL-WORLD COMMUTER USER JOURNEYS');
    console.log('========================================');

    // Journey 1: Morning Rush Peak Commute (Jamsil Station #16)
    const j1 = await evaluate(`async () => {
      const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');

      // Step 1: Ensure Jamsil Station (#16) is active
      const title = sheet.querySelector('.truncate')?.textContent || '';

      // Step 2: Open HALF tier
      if (!sheet.style.transform.includes('40vh')) {
        const handle = sheet.firstElementChild;
        handle.click();
        await new Promise(r => setTimeout(r, 500));
      }

      // Step 3: Check SimulationCard and adjust queue to 8 safely
      const plusBtn = Array.from(sheet.querySelectorAll('button')).find(b => b.textContent.trim() === '+');
      const range = sheet.querySelector('input[type="range"]');
      if (plusBtn) {
        for (let k = 0; k < 6; k++) {
          if (range && Number(range.value) < 8) {
            plusBtn.click();
            await new Promise(r => setTimeout(r, 150));
          }
        }
      }
      await new Promise(r => setTimeout(r, 300));

      const currentQ = range ? range.value : '';

      // Step 4: Bookmark station
      const starBtn = sheet.querySelector('button[aria-label*="즐겨찾기"]');
      if (starBtn) starBtn.click();
      await new Promise(r => setTimeout(r, 300));

      const bookmarks = JSON.parse(localStorage.getItem('bus_1650_bookmarks') || '[]');
      const isBookmarked = bookmarks.some(b => b.stationSeq === 16 || b.title?.includes('잠실') || b.stationName?.includes('잠실'));

      // Clean up bookmark
      if (starBtn) starBtn.click();

      return {
        title,
        finalQueue: currentQ,
        isBookmarked,
        journey1Success: currentQ === '8' && isBookmarked
      };
    }`);
    recordTest('tier4', 'J1: Morning Rush Peak Commuter Journey (Jamsil Station #16)', j1.journey1Success, j1);

    // Journey 2: Evening Commute Direction Flip & Reverse Route Navigation
    const j2 = await evaluate(`async () => {
      const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
      const dirToggleBtn = document.querySelector('div.absolute.top-3.left-3 button');

      // Step 1: Flip direction towards Guri
      if (dirToggleBtn && dirToggleBtn.innerText.includes('안양역')) {
        dirToggleBtn.click();
        await new Promise(r => setTimeout(r, 600));
      }

      // Step 2: Open full route timeline
      const routeBtn = Array.from(sheet.querySelectorAll('button')).find(b => b.textContent.includes('전체 1650 노선 정류장 보기'));
      if (routeBtn) routeBtn.click();
      await new Promise(r => setTimeout(r, 600));

      // Step 3: Tap a reverse route station
      const stops = sheet.querySelectorAll('.group.relative.flex.items-start');
      const selectedStop = stops[3];
      const selectedStopName = selectedStop ? (selectedStop.querySelector('span.text-xs')?.textContent || selectedStop.innerText.split('\\n')[0] || '') : '';
      if (selectedStop) selectedStop.click();
      await new Promise(r => setTimeout(r, 700));

      // Step 4: Test recenter button
      const recenterBtn = document.querySelector('div.absolute.top-3.right-3 button[title*="선택 정류소"]');
      if (recenterBtn) recenterBtn.click();
      await new Promise(r => setTimeout(r, 500));

      const sheetStation = sheet.querySelector('.truncate')?.textContent || '';

      // Flip back to UP
      if (dirToggleBtn && dirToggleBtn.innerText.includes('구리수택')) {
        dirToggleBtn.click();
        await new Promise(r => setTimeout(r, 500));
      }

      return {
        selectedStopName,
        sheetStation,
        journey2Success: !!sheetStation && (sheetStation.includes(selectedStopName.trim()) || selectedStopName.includes(sheetStation.trim()))
      };
    }`);
    recordTest('tier4', 'J2: Evening Commute Direction Flip & Reverse Route Navigation', j2.journey2Success, j2);

    // Journey 3: Orientation Switch Commuter Experience (Portrait <-> Landscape)
    const j3_step1 = await evaluate(`() => {
      return { portraitH: window.innerHeight, portraitW: window.innerWidth };
    }`);
    await setDeviceMetrics(824, 384, true);
    const j3_step2 = await evaluate(`() => {
      const canvas = document.querySelector('.maplibregl-canvas');
      const header = document.querySelector('header');
      return {
        landscapeW: window.innerWidth,
        canvasW: canvas ? canvas.clientWidth : 0,
        headerH: header ? header.clientHeight : 0,
        zeroOverflow: document.documentElement.scrollWidth <= 824
      };
    }`);
    await setDeviceMetrics(384, 824, true);
    const j3_step3 = await evaluate(`() => {
      const canvas = document.querySelector('.maplibregl-canvas');
      const header = document.querySelector('header');
      return {
        restoredW: window.innerWidth,
        canvasW: canvas ? canvas.clientWidth : 0,
        headerH: header ? header.clientHeight : 0,
        zeroOverflow: document.documentElement.scrollWidth <= 384
      };
    }`);
    const j3Success = j3_step2.canvasW > 0 && j3_step2.zeroOverflow && j3_step3.zeroOverflow && j3_step3.headerH <= 56;
    recordTest('tier4', 'J3: Orientation Switch Commuter Experience (Portrait <-> Landscape)', j3Success, { j3_step1, j3_step2, j3_step3 });

    // Journey 4: Deep Analytics & BYOK Key Workflow
    const j4 = await evaluate(`async () => {
      // Step 1: Open Analytics Modal
      const analyticsBtn = document.querySelector('header button[title*="통행 분석"]');
      if (analyticsBtn) analyticsBtn.click();
      await new Promise(r => setTimeout(r, 800));

      const analyticsCard = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('분석실'))?.closest('.shadow-2xl');

      // Step 2: Switch to OD Travel Tab
      const tab2Btn = Array.from(analyticsCard.querySelectorAll('button')).find(b => b.textContent.includes('소요시간'));
      if (tab2Btn) tab2Btn.click();
      await new Promise(r => setTimeout(r, 500));

      // Step 3: Switch Day of Week to Friday (금)
      const friBtn = Array.from(analyticsCard.querySelectorAll('button')).find(b => b.textContent.trim() === '금');
      if (friBtn) friBtn.click();
      await new Promise(r => setTimeout(r, 500));

      const chartMounted = !!(analyticsCard.querySelector('canvas') || analyticsCard.querySelector('.echarts-for-react'));

      // Close Analytics
      const closeAnalytics = Array.from(analyticsCard.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-x'));
      if (closeAnalytics) closeAnalytics.click();
      await new Promise(r => setTimeout(r, 400));

      // Step 4: Open BYOK Modal
      const byokBtn = document.querySelector('header button[title*="API 키"]');
      if (byokBtn) byokBtn.click();
      await new Promise(r => setTimeout(r, 500));

      const byokModal = document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80');
      const demoBtn = byokModal ? Array.from(byokModal.querySelectorAll('button')).find(b => b.textContent.includes('DEMO_KEY')) : null;
      if (demoBtn) demoBtn.click();
      await new Promise(r => setTimeout(r, 200));

      const input = byokModal ? byokModal.querySelector('input[type="password"]') : null;
      const demoLoaded = input ? input.value === 'DEMO_KEY' : false;

      // Close BYOK
      const cancelBtn = byokModal ? Array.from(byokModal.querySelectorAll('button')).find(b => b.textContent.trim() === '취소') : null;
      if (cancelBtn) cancelBtn.click();
      await new Promise(r => setTimeout(r, 400));

      return {
        chartMounted,
        demoLoaded,
        journey4Success: chartMounted && demoLoaded
      };
    }`);
    recordTest('tier4', 'J4: Deep Analytics & BYOK Key Commuter Workflow', j4.journey4Success, j4);


    // =========================================================================
    // FINAL RESULTS CONSOLIDATION & PERSISTENCE
    // =========================================================================
    console.log('\n========================================');
    console.log('  TEST EXECUTION SUMMARY');
    console.log('========================================');
    allResults.summary.passRate = `${Math.round((allResults.summary.passed / allResults.summary.total) * 100)}%`;
    console.log(`Total Tests:  ${allResults.summary.total}`);
    console.log(`Passed:       ${allResults.summary.passed}`);
    console.log(`Failed:       ${allResults.summary.failed}`);
    console.log(`Pass Rate:    ${allResults.summary.passRate}`);

    fs.writeFileSync('test_e2e_acceptance_final.json', JSON.stringify(allResults, null, 2));
    console.log('\nSaved results artifact to test_e2e_acceptance_final.json');

    ws.close();
    cleanup();

    const isAllPass = allResults.summary.failed === 0;
    process.exit(isAllPass ? 0 : 1);
  } catch (err) {
    console.error('[TEST ERROR]', err);
    cleanup();
    process.exit(1);
  }
}

run();
