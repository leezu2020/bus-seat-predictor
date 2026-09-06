import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9346;
const PROFILE_DIR = path.join(process.cwd(), 'node_modules', '.cache', 'edge_m3_forensic_profile2');

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
    const page = list.find(p => p.type === 'page' && (p.url.includes('localhost:5173') || p.url.includes('127.0.0.1'))) || list.find(p => p.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
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
    await send('Page.navigate', { url: 'http://localhost:5173' });
    await sleep(3000);

    // === PHASE 1: MOBILE VIEWPORT (GALAXY S23 ULTRA: 384x824) ===
    await send('Emulation.setDeviceMetricsOverride', {
      width: 384,
      height: 824,
      deviceScaleFactor: 2.625,
      mobile: true,
      touch: true
    });
    await sleep(2000);

    const mobileResults = await send('Runtime.evaluate', {
      expression: `(async function() {
        const res = {};

        // 1. Header Checks
        const header = document.querySelector('header');
        const headerRect = header ? header.getBoundingClientRect() : null;
        const brandSub = header ? header.querySelector('.hidden.sm\\\\:flex') : null;
        const brandSubComputed = brandSub ? window.getComputedStyle(brandSub).display : 'none';

        const livePill = header ? header.querySelector('div.rounded-full') : null;
        const pillText = livePill ? livePill.innerText.replace(/\\s+/g, ' ').trim() : '';

        const analyticsBtn = header ? header.querySelector('button[title*="통행 분석"]') : null;
        const analyticsSpans = analyticsBtn ? Array.from(analyticsBtn.querySelectorAll('span')) : [];
        const analyticsVisibleSpan = analyticsSpans.find(s => window.getComputedStyle(s).display !== 'none');

        const byokBtn = header ? header.querySelector('button[title*="API 키"]') : null;
        const byokSpans = byokBtn ? Array.from(byokBtn.querySelectorAll('span')) : [];
        const byokVisibleSpan = byokSpans.find(s => window.getComputedStyle(s).display !== 'none');

        res.mobileHeader = {
          exists: !!header,
          height: headerRect ? Math.round(headerRect.height) : 0,
          width: headerRect ? Math.round(headerRect.width) : 0,
          zeroHorizontalScroll: document.documentElement.scrollWidth <= 384,
          brandSubtitleHidden: brandSubComputed === 'none',
          pillText: pillText,
          pillIsCompact: /^(실시간|모의)\\s+\\d+대$/.test(pillText),
          analyticsLabelHidden: !analyticsVisibleSpan,
          byokLabelHidden: !byokVisibleSpan
        };

        // 2. Floating Map Controls Checks
        const dirToggleDiv = document.querySelector('div.absolute.top-3.left-3');
        const dirToggleVisible = dirToggleDiv ? window.getComputedStyle(dirToggleDiv).display !== 'none' : false;
        const dirToggleBtn = dirToggleDiv ? dirToggleDiv.querySelector('button') : null;
        const initialDir = dirToggleBtn ? dirToggleBtn.innerText.replace(/\\s+/g, ' ').trim() : '';

        if (dirToggleBtn) {
          dirToggleBtn.click();
          await new Promise(r => setTimeout(r, 400));
        }
        const flippedDir = dirToggleBtn ? dirToggleBtn.innerText.replace(/\\s+/g, ' ').trim() : '';

        if (dirToggleBtn) {
          dirToggleBtn.click();
          await new Promise(r => setTimeout(r, 400));
        }

        const actionStackDiv = document.querySelector('div.absolute.top-3.right-3');
        const actionStackVisible = actionStackDiv ? window.getComputedStyle(actionStackDiv).display !== 'none' : false;
        const resetBoundsBtn = actionStackDiv ? actionStackDiv.querySelector('button[title*="전체 노선"]') : null;
        const recenterBtn = actionStackDiv ? actionStackDiv.querySelector('button[title*="선택 정류소"]') : null;

        res.mobileFloatingControls = {
          toggleDivVisible: dirToggleVisible,
          initialDir,
          flippedDir,
          toggleFlipped: initialDir !== flippedDir && flippedDir.includes('방면'),
          actionStackVisible,
          resetBoundsBtnExists: !!resetBoundsBtn,
          recenterBtnExists: !!recenterBtn
        };

        // 3. Analytics Modal Checks
        if (analyticsBtn) {
          analyticsBtn.click();
          await new Promise(r => setTimeout(r, 800));
        }
        const analyticsCard = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('분석실'))?.closest('.shadow-2xl');
        const analyticsRect = analyticsCard ? analyticsCard.getBoundingClientRect() : null;
        const tabButtons = analyticsCard ? Array.from(analyticsCard.querySelectorAll('button')).filter(b => b.textContent.includes('소요시간') || b.textContent.includes('도착')) : [];
        const dayButtons = analyticsCard ? Array.from(analyticsCard.querySelectorAll('button')).filter(b => ['월','화','수','목','금','토','일'].includes(b.textContent.trim())) : [];
        
        // Switch to Tab 2
        const tab2Btn = tabButtons.find(b => b.textContent.includes('소요시간'));
        if (tab2Btn) {
          tab2Btn.click();
          await new Promise(r => setTimeout(r, 500));
        }
        const echartsCanvas = analyticsCard ? (analyticsCard.querySelector('canvas') || analyticsCard.querySelector('.echarts-for-react')) : null;

        // Close
        const closeBtn = analyticsCard ? Array.from(analyticsCard.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-x')) : null;
        if (closeBtn) {
          closeBtn.click();
          await new Promise(r => setTimeout(r, 400));
        }

        res.mobileAnalyticsModal = {
          opened: !!analyticsCard,
          fullscreen: analyticsRect ? (analyticsRect.width >= 380 && analyticsRect.height >= 800) : false,
          tabCount: tabButtons.length,
          dayButtonsCount: dayButtons.length,
          echartsMounted: !!echartsCanvas,
          closedCleanly: !Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('분석실'))?.closest('.shadow-2xl')
        };

        // 4. Byok Modal Checks
        if (byokBtn) {
          byokBtn.click();
          await new Promise(r => setTimeout(r, 500));
        }
        const byokModal = document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80');
        const byokRect = byokModal ? byokModal.getBoundingClientRect() : null;
        const inputElem = byokModal ? byokModal.querySelector('input[type="password"]') : null;
        const inputFontSize = inputElem ? window.getComputedStyle(inputElem).fontSize : '';
        const demoBtn = byokModal ? Array.from(byokModal.querySelectorAll('button')).find(b => b.textContent.includes('DEMO_KEY')) : null;
        const cancelBtn = byokModal ? Array.from(byokModal.querySelectorAll('button')).find(b => b.textContent.trim() === '취소') : null;

        if (demoBtn) {
          demoBtn.click();
          await new Promise(r => setTimeout(r, 200));
        }
        const demoValue = inputElem ? inputElem.value : '';

        if (cancelBtn) {
          cancelBtn.click();
          await new Promise(r => setTimeout(r, 400));
        }

        res.mobileByokModal = {
          opened: !!byokModal,
          fitsViewport: byokRect ? byokRect.width <= 384 : false,
          inputPreventZoomFontSize: inputFontSize === '16px',
          demoKeyWorked: demoValue === 'DEMO_KEY',
          closedCleanly: !document.querySelector('.bg-slate-900.border.border-slate-700\\\\/80')
        };

        return res;
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    // === PHASE 2: DESKTOP VIEWPORT (1024x768) ===
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 1.0,
      mobile: false,
      touch: false
    });
    await sleep(2000);

    const desktopResults = await send('Runtime.evaluate', {
      expression: `(async function() {
        const res = {};

        // 1. Header Checks
        const header = document.querySelector('header');
        const brandSub = header ? header.querySelector('.hidden.sm\\\\:flex') : null;
        const brandSubComputed = brandSub ? window.getComputedStyle(brandSub).display : 'none';

        const livePill = header ? header.querySelector('div.rounded-full') : null;
        const pillText = livePill ? livePill.innerText.replace(/\\s+/g, ' ').trim() : '';

        const analyticsBtn = header ? header.querySelector('button[title*="통행 분석"]') : null;
        const analyticsSpans = analyticsBtn ? Array.from(analyticsBtn.querySelectorAll('span')) : [];
        const analyticsVisibleSpan = analyticsSpans.find(s => window.getComputedStyle(s).display !== 'none');

        const byokBtn = header ? header.querySelector('button[title*="API 키"]') : null;
        const byokSpans = byokBtn ? Array.from(byokBtn.querySelectorAll('span')) : [];
        const byokVisibleSpan = byokSpans.find(s => window.getComputedStyle(s).display !== 'none');

        res.desktopHeader = {
          brandSubtitleVisible: brandSubComputed === 'flex',
          pillText: pillText,
          pillHasFullText: pillText.includes('대 운행') || pillText.includes('모의 스트림'),
          analyticsLabelVisible: !!analyticsVisibleSpan && analyticsVisibleSpan.textContent.includes('통행 분석'),
          byokLabelVisible: !!byokVisibleSpan && (byokVisibleSpan.textContent.includes('API 키') || byokVisibleSpan.textContent.includes('Key 등록'))
        };

        // 2. Floating Controls Checks
        const dirToggleDiv = document.querySelector('div.absolute.top-3.left-3');
        const dirToggleDisplay = dirToggleDiv ? window.getComputedStyle(dirToggleDiv).display : 'none';

        const actionStackDiv = document.querySelector('div.absolute.top-3.right-3') || document.querySelector('div.absolute.sm\\\\:top-4.sm\\\\:right-4');
        const actionStackDisplay = actionStackDiv ? window.getComputedStyle(actionStackDiv).display : 'none';

        res.desktopFloatingControls = {
          toggleHiddenOnDesktop: dirToggleDisplay === 'none',
          actionStackVisible: actionStackDisplay === 'flex'
        };

        // 3. Analytics Modal Desktop Check
        if (analyticsBtn) {
          analyticsBtn.click();
          await new Promise(r => setTimeout(r, 800));
        }
        const analyticsCard = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('분석실'))?.closest('.shadow-2xl');
        const analyticsRect = analyticsCard ? analyticsCard.getBoundingClientRect() : null;
        const closeBtn = analyticsCard ? Array.from(analyticsCard.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-x')) : null;
        if (closeBtn) {
          closeBtn.click();
          await new Promise(r => setTimeout(r, 400));
        }

        res.desktopAnalyticsModal = {
          opened: !!analyticsCard,
          isContainedCard: analyticsRect ? (analyticsRect.width < 1000 && analyticsRect.height < 750) : false
        };

        return res;
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    const finalReport = {
      mobile: mobileResults.result?.value,
      desktop: desktopResults.result?.value
    };

    console.log('[FORENSIC M3 FULL RESULTS]');
    console.log(JSON.stringify(finalReport, null, 2));

    fs.writeFileSync('forensic_m3_results.json', JSON.stringify(finalReport, null, 2), 'utf-8');

    edgeProc.kill('SIGKILL');
    process.exit(0);
  } catch (err) {
    console.error('[FORENSIC ERROR]', err);
    try { edgeProc.kill('SIGKILL'); } catch (e) {}
    process.exit(1);
  }
}

run();
