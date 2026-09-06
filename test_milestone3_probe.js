import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9340;
const PROFILE_DIR = path.join(process.cwd(), 'node_modules', '.cache', 'edge_m3_probe');

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
    // Emulate Samsung Galaxy S23 Ultra (384px width x 824px height)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 384,
      height: 824,
      deviceScaleFactor: 2.625,
      mobile: true
    });
    await sleep(1500);

    const testResults = await send('Runtime.evaluate', {
      expression: `(async function() {
        const results = {};

        // 1. Header Verification
        const header = document.querySelector('header');
        const headerBox = header ? header.getBoundingClientRect() : null;
        const livePill = header ? header.querySelector('div.rounded-full') : null;
        const pillText = livePill ? livePill.innerText.replace(/\\s+/g, ' ').trim() : '';
        const analyticsBtn = header ? header.querySelector('button[title*="통행 분석"]') : null;
        const byokBtn = header ? header.querySelector('button[title*="API 키"]') : null;
        const refreshBtn = header ? header.querySelector('button[title*="새로고침"]') : null;

        // Check if analytics text is hidden on mobile
        const analyticsTextSpan = analyticsBtn ? analyticsBtn.querySelector('span.hidden') : null;

        results.header = {
          exists: !!header,
          height: headerBox ? headerBox.height : 0,
          width: headerBox ? headerBox.width : 0,
          pillText: pillText,
          pillCompact: /\\d+대/.test(pillText) && !pillText.includes('운행)'),
          analyticsBtnExists: !!analyticsBtn,
          byokBtnExists: !!byokBtn,
          refreshBtnExists: !!refreshBtn,
          zeroHorizontalScroll: document.documentElement.scrollWidth <= 384
        };

        // 2. Floating Map Controls Verification
        const dirToggleBtn = document.querySelector('div.absolute.top-3.left-3 button');
        const actionStack = document.querySelector('div.absolute.top-3.right-3');
        const resetBoundsBtn = actionStack ? actionStack.querySelector('button:first-of-type') : null;
        const recenterBtn = actionStack ? actionStack.querySelector('button:last-of-type') : null;

        const initialDirText = dirToggleBtn ? dirToggleBtn.innerText.replace(/\\s+/g, ' ').trim() : '';

        // Click Direction Toggle
        if (dirToggleBtn) {
          dirToggleBtn.click();
          await new Promise(r => setTimeout(r, 400));
        }
        const flippedDirText = dirToggleBtn ? dirToggleBtn.innerText.replace(/\\s+/g, ' ').trim() : '';


        // Test Reset Bounds and Recenter clicks with offset verification
        let resetBoundsClicked = false;
        let recenterClicked = false;
        let pinInUpperHalf = false;
        let activePinY = null;

        // Select station 16 (Jamsil)
        const st16Pin = Array.from(document.querySelectorAll('.cursor-pointer')).find(el => el.innerText.includes('16') || el.innerText.includes('잠실'));
        if (st16Pin) {
          st16Pin.click();
          await new Promise(r => setTimeout(r, 400));
        }

        if (resetBoundsBtn) {
          resetBoundsBtn.click();
          resetBoundsClicked = true;
          await new Promise(r => setTimeout(r, 800));
        }
        if (recenterBtn) {
          recenterBtn.click();
          recenterClicked = true;
          await new Promise(r => setTimeout(r, 1200));
        }

        const activePin = document.querySelector('.bg-blue-600.ring-blue-300') || document.querySelector('.bg-blue-600');
        if (activePin) {
          const pinBox = activePin.getBoundingClientRect();
          activePinY = pinBox.y;
          // In 384x824, center is Y=412. Offset [0, -100] places pin in upper half (Y < 412), clearing the bottom sheet!
          pinInUpperHalf = pinBox.y < 412;
        }

        results.floatingControls = {
          dirToggleExists: !!dirToggleBtn,
          initialDirText,
          flippedDirText: dirToggleBtn ? dirToggleBtn.innerText.replace(/\\s+/g, ' ').trim() : '',
          directionFlippedSuccessfully: initialDirText !== (dirToggleBtn ? dirToggleBtn.innerText.replace(/\\s+/g, ' ').trim() : ''),
          actionStackExists: !!actionStack,
          resetBoundsClicked,
          recenterClicked,
          activePinY,
          pinInUpperHalf
        };

        // 3. Analytics Modal Verification
        if (analyticsBtn) {
          analyticsBtn.click();
          await new Promise(r => setTimeout(r, 700));
        }
        const analyticsModal = document.querySelector('.bg-white.sm\\\\:rounded-2xl.rounded-none') ||
                               document.querySelector('h2:contains("분석실")') ||
                               Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('분석실'))?.closest('.shadow-2xl');

        const modalBox = analyticsModal ? analyticsModal.getBoundingClientRect() : null;
        const tabButtons = analyticsModal ? Array.from(analyticsModal.querySelectorAll('button')).filter(b => b.textContent.includes('소요시간') || b.textContent.includes('도착')) : [];
        const dayButtons = analyticsModal ? Array.from(analyticsModal.querySelectorAll('button')).filter(b => ['월','화','수','목','금','토','일'].includes(b.textContent.trim())) : [];

        // Check scrollability
        const scrollBody = analyticsModal ? analyticsModal.querySelector('.overflow-y-auto') : null;
        const isScrollable = scrollBody ? (scrollBody.scrollHeight > scrollBody.clientHeight) : false;
        let scrolledDown = false;
        if (scrollBody) {
          scrollBody.scrollTop = 200;
          await new Promise(r => setTimeout(r, 100));
          scrolledDown = scrollBody.scrollTop > 0;
          scrollBody.scrollTop = 0;
        }

        // Switch to Tab 2
        const tab2Btn = tabButtons.find(b => b.textContent.includes('소요시간'));
        if (tab2Btn) {
          tab2Btn.click();
          await new Promise(r => setTimeout(r, 600));
        }
        const echartsCanvas = analyticsModal ? analyticsModal.querySelector('canvas') || analyticsModal.querySelector('.echarts-for-react') : null;

        // Switch back to Tab 1
        const tab1Btn = tabButtons.find(b => b.textContent.includes('도착'));
        if (tab1Btn) {
          tab1Btn.click();
          await new Promise(r => setTimeout(r, 400));
        }

        // Close Analytics Modal
        const closeBtn = analyticsModal ? analyticsModal.querySelector('button:has(svg.lucide-x)') || Array.from(analyticsModal.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-x')) : null;
        if (closeBtn) {
          closeBtn.click();
          await new Promise(r => setTimeout(r, 400));
        }

        results.analyticsModal = {
          modalOpened: !!analyticsModal,
          modalFullscreenOnMobile: modalBox ? (modalBox.width >= 380 && modalBox.height >= 800) : false,
          isScrollable,
          scrolledDown,
          tabCount: tabButtons.length,
          dayButtonsCount: dayButtons.length,
          echartsRendered: !!echartsCanvas,
          modalNoHorizontalBlowout: analyticsModal ? analyticsModal.scrollWidth <= 385 : true,
          modalClosed: !document.querySelector('.bg-white.sm\\\\:rounded-2xl.rounded-none')
        };

        // 4. Byok Modal Verification
        if (byokBtn) {
          byokBtn.click();
          await new Promise(r => setTimeout(r, 500));
        }
        const byokModal = document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80');
        const byokBox = byokModal ? byokModal.getBoundingClientRect() : null;
        const demoBtn = byokModal ? Array.from(byokModal.querySelectorAll('button')).find(b => b.textContent.includes('DEMO_KEY')) : null;
        const keyInput = byokModal ? byokModal.querySelector('input[type="password"]') : null;
        const cancelBtn = byokModal ? Array.from(byokModal.querySelectorAll('button')).find(b => b.textContent.trim() === '취소') : null;

        if (demoBtn) {
          demoBtn.click();
          await new Promise(r => setTimeout(r, 200));
        }
        const inputValAfterDemo = keyInput ? keyInput.value : '';

        if (cancelBtn) {
          cancelBtn.click();
          await new Promise(r => setTimeout(r, 400));
        }

        // Re-open and close via X
        if (byokBtn) {
          byokBtn.click();
          await new Promise(r => setTimeout(r, 400));
          const reopenModal = document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80');
          const xBtn = reopenModal ? (reopenModal.querySelector('button:has(svg.lucide-x)') || reopenModal.querySelector('button')) : null;
          if (xBtn) {
            xBtn.click();
            await new Promise(r => setTimeout(r, 400));
          }
        }

        results.byokModal = {
          modalOpened: !!byokModal,
          modalWidth: byokBox ? byokBox.width : 0,
          modalFitsScreen: byokBox ? byokBox.width <= 365 : false,
          demoKeyInjected: inputValAfterDemo === 'DEMO_KEY',
          modalClosed: !document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80')
        };

        return results;
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    const m3Results = testResults.result?.value || {};

    // Viewport Matrix & Landscape Tests
    const matrixResults = [];
    const otherViewports = [
      { name: '412px Large Android', width: 412, height: 915, mobile: true },
      { name: '824x384 Landscape', width: 824, height: 384, mobile: true },
      { name: '1024px Desktop', width: 1024, height: 768, mobile: false },
      { name: '1440px Desktop', width: 1440, height: 900, mobile: false }
    ];

    for (const vp of otherViewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.mobile
      });
      await sleep(1000);
      const vpEval = await send('Runtime.evaluate', {
        expression: `(async function() {
          const header = document.querySelector('header');
          const headerBox = header ? header.getBoundingClientRect() : null;
          const docScrollWidth = document.documentElement.scrollWidth;
          const analyticsBtn = header ? header.querySelector('button[title*="통행 분석"]') : null;
          const byokBtn = header ? header.querySelector('button[title*="API 키"]') : null;
          const dirToggleBtn = document.querySelector('div.absolute.top-3.left-3 button');

          const res = {
            viewport: "${vp.name}",
            width: ${vp.width},
            height: ${vp.height},
            headerHeight: headerBox ? headerBox.height : 0,
            headerValid: headerBox ? headerBox.height <= 56.5 : false,
            zeroHorizontalScroll: docScrollWidth <= ${vp.width} + 1,
            dirToggleHiddenOnDesktop: ${vp.width} >= 640 ? (!dirToggleBtn || dirToggleBtn.offsetParent === null) : true
          };

          // If landscape 824x384, test opening and closing modals in landscape
          if (${vp.width} === 824 && ${vp.height} === 384) {
            if (analyticsBtn) {
              analyticsBtn.click();
              await new Promise(r => setTimeout(r, 600));
              const am = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('분석실'))?.closest('.shadow-2xl');
              const amClose = am ? (am.querySelector('button:has(svg.lucide-x)') || Array.from(am.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-x'))) : null;
              res.landscapeAnalyticsOpened = !!am;
              res.landscapeAnalyticsCloseVisible = amClose ? (amClose.getBoundingClientRect().top >= 0 && amClose.getBoundingClientRect().bottom <= 384) : false;
              if (amClose) amClose.click();
              await new Promise(r => setTimeout(r, 400));
              res.landscapeAnalyticsClosed = !Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('분석실'));
            }

            if (byokBtn) {
              byokBtn.click();
              await new Promise(r => setTimeout(r, 500));
              const bm = document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80');
              const bmCancel = bm ? Array.from(bm.querySelectorAll('button')).find(b => b.textContent.trim() === '취소') : null;
              res.landscapeByokOpened = !!bm;
              res.landscapeByokCancelAccessible = !!bmCancel;
              if (bmCancel) bmCancel.click();
              await new Promise(r => setTimeout(r, 400));
              res.landscapeByokClosed = !document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80');
            }
          }

          return res;
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      matrixResults.push(vpEval.result?.value);
    }

    const finalReport = {
      timestamp: new Date().toISOString(),
      s23UltraPortrait: m3Results,
      viewportMatrix: matrixResults,
      verdict: 'APPROVE'
    };

    // Evaluate overall pass/fail
    let allPassed = true;
    const failureReasons = [];

    if (!m3Results.header?.exists || m3Results.header.height > 56.5 || !m3Results.header.zeroHorizontalScroll) {
      allPassed = false;
      failureReasons.push('Header failed 384px invariants');
    }
    if (!m3Results.floatingControls?.directionFlippedSuccessfully) {
      allPassed = false;
      failureReasons.push('Floating direction toggle failed to flip');
    }
    if (!m3Results.floatingControls?.pinInUpperHalf) {
      allPassed = false;
      failureReasons.push('Camera re-center did not position marker in upper half');
    }
    if (!m3Results.analyticsModal?.modalOpened || !m3Results.analyticsModal?.modalFullscreenOnMobile || !m3Results.analyticsModal?.modalClosed) {
      allPassed = false;
      failureReasons.push('AnalyticsModal failed 384px mobile requirements');
    }
    if (!m3Results.byokModal?.modalOpened || !m3Results.byokModal?.demoKeyInjected || !m3Results.byokModal?.modalClosed) {
      allPassed = false;
      failureReasons.push('ByokModal failed 384px mobile requirements');
    }

    for (const vp of matrixResults) {
      if (!vp.headerValid || !vp.zeroHorizontalScroll) {
        allPassed = false;
        failureReasons.push(`Header failed on viewport ${vp.viewport}`);
      }
      if (vp.viewport.includes('Landscape')) {
        if (!vp.landscapeAnalyticsCloseVisible || !vp.landscapeAnalyticsClosed || !vp.landscapeByokClosed) {
          allPassed = false;
          failureReasons.push('Modal failed landscape 824x384 stress test');
        }
      }
      if (vp.viewport.includes('Desktop') && !vp.dirToggleHiddenOnDesktop) {
        allPassed = false;
        failureReasons.push(`Direction toggle visible on desktop ${vp.viewport}`);
      }
    }

    finalReport.allPassed = allPassed;
    finalReport.failures = failureReasons;
    finalReport.verdict = allPassed ? 'APPROVE' : 'REQUEST_CHANGES';

    console.log('[CHALLENGER 1 COMPLETE REPORT]');
    console.log(JSON.stringify(finalReport, null, 2));

    fs.writeFileSync('challenger1_m3_results.json', JSON.stringify(finalReport, null, 2), 'utf-8');

    edgeProc.kill('SIGKILL');
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('[M3 PROBE ERROR]', err);
    edgeProc.kill('SIGKILL');
    process.exit(1);
  }
}

run();
