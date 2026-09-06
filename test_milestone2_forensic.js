import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9334;
const PROFILE_DIR = path.join(process.cwd(), 'node_modules', '.cache', 'edge_m2_test_profile');

if (!fs.existsSync(PROFILE_DIR)) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

console.log('[TEST-M2] Starting Edge on port', PORT);
const edgeProc = spawn(EDGE_PATH, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE_DIR}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu-shader-disk-cache',
  'http://localhost:5173'
], { stdio: 'ignore' });

function cleanup() {
  console.log('[TEST-M2] Cleaning up Edge process...');
  try {
    edgeProc.kill('SIGKILL');
  } catch (e) {}
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('uncaughtException', (err) => {
  console.error('[TEST-M2] Uncaught Exception:', err);
  cleanup();
  process.exit(1);
});

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForCdpReady() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
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

async function run() {
  const testResults = [];
  try {
    const wsUrl = await waitForCdpReady();
    console.log('[TEST-M2] Connected to CDP:', wsUrl);

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

    // Emulate Galaxy S23 Ultra portrait (384x824)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 384,
      height: 824,
      deviceScaleFactor: 2.8,
      mobile: true,
      touch: true
    });

    console.log('[TEST-M2] Emulated Galaxy S23 Ultra (384x824, touch=true). Waiting for route data & DOM settle...');
    await sleep(2500);

    // TEST 1: Check mobile layout isolation (aside hidden, map visible, bottom sheet present)
    console.log('\n--- Test 1: Mobile Viewport Decoupling (S23 Ultra) ---');
    const layoutRes = await send('Runtime.evaluate', {
      expression: `(function() {
        const aside = document.querySelector('aside');
        const main = document.querySelector('main');
        const canvas = document.querySelector('.maplibregl-canvas');
        const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
        return {
          asideDisplay: aside ? window.getComputedStyle(aside).display : null,
          mainWidth: main ? main.clientWidth : 0,
          mainHeight: main ? main.clientHeight : 0,
          canvasExists: !!canvas,
          sheetExists: !!sheet,
          sheetTransform: sheet ? sheet.style.transform : null
        };
      })()`,
      returnByValue: true
    });
    const layout = layoutRes.result.value;
    const test1Pass = layout.asideDisplay === 'none' && layout.mainWidth === 384 && layout.canvasExists && layout.sheetExists;
    testResults.push({ name: 'Layout Decoupling & Bottom Sheet Presence', pass: test1Pass, details: layout });
    console.log(`Test 1 Result: ${test1Pass ? 'PASS' : 'FAIL'}`, layout);

    // TEST 2: Bottom Sheet Initial State (PEEK)
    console.log('\n--- Test 2: Bottom Sheet Initial State (PEEK) ---');
    const peekRes = await send('Runtime.evaluate', {
      expression: `(function() {
        try {
          const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
          const peekBar = sheet ? sheet.firstElementChild : null;
          const stationTitle = peekBar ? peekBar.querySelector('.truncate')?.textContent : null;
          const dirBadge = peekBar ? peekBar.querySelector('span')?.textContent : null;
          const textContent = peekBar ? peekBar.textContent : '';
          const hasBusEtaOrSeats = textContent.includes('개 전') || textContent.includes('도착') || textContent.includes('석') || textContent.includes('운행 중');
          const hasBookmarkStar = peekBar ? !!peekBar.querySelector('button') : false;
          return {
            transform: sheet?.style.transform,
            hasPeekBar: !!peekBar,
            stationTitle,
            dirBadge,
            hasBusEtaOrSeats,
            hasBookmarkStar,
            rawText: textContent
          };
        } catch(e) {
          return { error: e.toString() };
        }
      })()`,
      returnByValue: true
    });
    console.log('[TEST-M2] peekRes raw:', peekRes);
    const peek = peekRes.result?.value;
    const test2Pass = peek && peek.hasPeekBar && peek.transform.includes('88vh') && !!peek.stationTitle;
    testResults.push({ name: 'Initial PEEK Tier State & Elements', pass: test2Pass, details: peek });
    console.log(`Test 2 Result: ${test2Pass ? 'PASS' : 'FAIL'}`, peek);

    // TEST 3: Tap / Click Header to Expand to HALF tier
    console.log('\n--- Test 3: Tap Header -> Transition to HALF tier ---');
    await send('Runtime.evaluate', {
      expression: `(function() {
        const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
        const header = sheet ? sheet.firstElementChild : null;
        if (header) {
          header.click();
        }
      })()`
    });
    await sleep(600);

    const halfRes = await send('Runtime.evaluate', {
      expression: `(function() {
        const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
        const simCard = sheet ? sheet.querySelector('input[type="range"]') : null;
        const simProbs = Array.from(document.querySelectorAll('.fixed.inset-x-0.bottom-0 strong')).map(el => el.textContent);
        return {
          transform: sheet?.style.transform,
          hasSimCard: !!simCard,
          hasRangeInput: !!simCard,
          sliderValue: simCard ? simCard.value : null,
          simProbsCount: simProbs.length
        };
      })()`,
      returnByValue: true
    });
    const half = halfRes.result.value;
    const test3Pass = half && half.transform.includes('40vh') && half.hasSimCard;
    testResults.push({ name: 'Header Click -> HALF Tier with SimulationCard', pass: test3Pass, details: half });
    console.log(`Test 3 Result: ${test3Pass ? 'PASS' : 'FAIL'}`, half);

    // TEST 4: Queue count slider interaction
    console.log('\n--- Test 4: Queue Count Slider Interaction ---');
    await send('Runtime.evaluate', {
      expression: `(function() {
        const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
        if (!sheet) return;
        const buttons = Array.from(sheet.querySelectorAll('button'));
        const plusBtn = buttons.find(b => b.textContent.trim() === '+');
        if (plusBtn) {
          plusBtn.click();
          plusBtn.click();
        }
      })()`
    });
    await sleep(400);

    const sliderChangeRes = await send('Runtime.evaluate', {
      expression: `(function() {
        const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
        const range = sheet ? sheet.querySelector('input[type="range"]') : null;
        return {
          newSliderValue: range ? range.value : null,
          queueLabel: sheet ? sheet.querySelector('.text-blue-600')?.textContent : null
        };
      })()`,
      returnByValue: true
    });
    const sliderData = sliderChangeRes.result.value;
    const test4Pass = sliderData.queueLabel && (sliderData.queueLabel.includes('6명') || sliderData.queueLabel.includes('7명'));
    testResults.push({ name: 'Queue Count Slider (+ button) Updates State', pass: test4Pass, details: sliderData });
    console.log(`Test 4 Result: ${test4Pass ? 'PASS' : 'FAIL'}`, sliderData);

    // TEST 5: Expand to FULL tier (Tap button "전체 1650 노선 정류장 보기")
    console.log('\n--- Test 5: Expand to FULL tier (Route Timeline View) ---');
    await send('Runtime.evaluate', {
      expression: `(function() {
        const buttons = Array.from(document.querySelectorAll('.fixed.inset-x-0.bottom-0 button'));
        const routeBtn = buttons.find(b => b.textContent.includes('전체 1650 노선 정류장 보기'));
        if (routeBtn) {
          routeBtn.click();
        }
      })()`
    });
    await sleep(600);

    const fullRes = await send('Runtime.evaluate', {
      expression: `(function() {
        const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
        const dirButtons = Array.from(document.querySelectorAll('.fixed.inset-x-0.bottom-0 button')).filter(b => b.textContent.includes('방면'));
        const timelineStops = document.querySelectorAll('.fixed.inset-x-0.bottom-0 .group.relative.flex.items-start');
        const liveBuses = document.querySelectorAll('.fixed.inset-x-0.bottom-0 .animate-fadeIn');
        return {
          transform: sheet?.style.transform,
          dirButtonTexts: dirButtons.map(b => b.textContent.trim()),
          timelineStopCount: timelineStops.length,
          liveBusBadgeCount: liveBuses.length
        };
      })()`,
      returnByValue: true
    });
    const fullData = fullRes.result.value;
    const test5Pass = fullData.transform.includes('0px') && fullData.timelineStopCount >= 40 && fullData.dirButtonTexts.length === 2;
    testResults.push({ name: 'Expand to FULL Tier (Station Timeline & Direction Tabs)', pass: test5Pass, details: fullData });
    console.log(`Test 5 Result: ${test5Pass ? 'PASS' : 'FAIL'}`, fullData);

    // TEST 6: Station Selection from Timeline -> Snaps back to HALF tier
    console.log('\n--- Test 6: Station Click in Timeline -> Snaps to HALF & updates station ---');
    await send('Runtime.evaluate', {
      expression: `(function() {
        // Select the 5th stop in the timeline
        const stops = document.querySelectorAll('.fixed.inset-x-0.bottom-0 .group.relative.flex.items-start');
        if (stops.length > 5) {
          stops[4].click();
        }
      })()`
    });
    await sleep(600);

    const selectRes = await send('Runtime.evaluate', {
      expression: `(function() {
        const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
        const currentStationTitle = sheet?.querySelector('.truncate')?.textContent;
        return {
          transform: sheet?.style.transform,
          currentStationTitle
        };
      })()`,
      returnByValue: true
    });
    const selectData = selectRes.result.value;
    const test6Pass = selectData.transform.includes('40vh') && !!selectData.currentStationTitle;
    testResults.push({ name: 'Station Selection Snaps to HALF with Selected Station', pass: test6Pass, details: selectData });
    console.log(`Test 6 Result: ${test6Pass ? 'PASS' : 'FAIL'}`, selectData);

    // TEST 7: Genuine Touch Gesture Drag Down (HALF -> PEEK)
    console.log('\n--- Test 7: Touch Drag Gesture (HALF -> PEEK) ---');
    await send('Runtime.evaluate', {
      expression: `(function() {
        const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
        const handle = sheet ? sheet.firstElementChild : null;
        if (!handle) return false;

        // TouchStart
        handle.dispatchEvent(new TouchEvent('touchstart', {
          touches: [new Touch({ identifier: 1, target: handle, clientY: 400 })],
          bubbles: true, cancelable: true
        }));
        return true;
      })()`
    });
    await sleep(100);

    await send('Runtime.evaluate', {
      expression: `(function() {
        const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
        const handle = sheet ? sheet.firstElementChild : null;
        if (!handle) return false;

        // TouchMove down by 150px
        handle.dispatchEvent(new TouchEvent('touchmove', {
          touches: [new Touch({ identifier: 1, target: handle, clientY: 550 })],
          bubbles: true, cancelable: true
        }));
        return true;
      })()`
    });
    await sleep(100);

    await send('Runtime.evaluate', {
      expression: `(function() {
        const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
        const handle = sheet ? sheet.firstElementChild : null;
        if (!handle) return false;

        // TouchEnd
        handle.dispatchEvent(new TouchEvent('touchend', {
          changedTouches: [new Touch({ identifier: 1, target: handle, clientY: 550 })],
          bubbles: true, cancelable: true
        }));
        return true;
      })()`
    });
    await sleep(600);

    const gestureRes = await send('Runtime.evaluate', {
      expression: `(function() {
        const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
        return {
          transform: sheet?.style.transform
        };
      })()`,
      returnByValue: true
    });
    const gestureData = gestureRes.result.value;
    const test7Pass = gestureData.transform.includes('88vh') && gestureData.transform.includes('92px');
    testResults.push({ name: 'Touch Gesture Drag Down Snaps to PEEK', pass: test7Pass, details: gestureData });
    console.log(`Test 7 Result: ${test7Pass ? 'PASS' : 'FAIL'}`, gestureData);

    // TEST 8: Desktop Breakpoint (1024px) Layout Preservation
    console.log('\n--- Test 8: Desktop Viewport Transition (1024px) ---');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false
    });
    await send('Runtime.evaluate', { expression: `window.dispatchEvent(new Event('resize'))` });
    await sleep(500);

    const desktopRes = await send('Runtime.evaluate', {
      expression: `(function() {
        const aside = document.querySelector('aside');
        const sheet = document.querySelector('.fixed.inset-x-0.bottom-0');
        return {
          asideDisplay: aside ? window.getComputedStyle(aside).display : null,
          asideWidth: aside ? aside.clientWidth : 0,
          sheetDisplay: sheet ? window.getComputedStyle(sheet).display : null
        };
      })()`,
      returnByValue: true
    });
    const desktopData = desktopRes.result.value;
    const test8Pass = desktopData.asideDisplay === 'flex' && desktopData.asideWidth >= 400 && desktopData.sheetDisplay === 'none';
    testResults.push({ name: 'Desktop Split Layout Restored & Bottom Sheet Hidden', pass: test8Pass, details: desktopData });
    console.log(`Test 8 Result: ${test8Pass ? 'PASS' : 'FAIL'}`, desktopData);

    console.log('\n================ TEST SUMMARY ================');
    const allPassed = testResults.every(t => t.pass);
    console.log(`All 8 Milestone 2 Tests Passed: ${allPassed ? 'YES (100%)' : 'NO'}`);

    fs.writeFileSync('forensic_m2_results.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      testResults,
      allPassed
    }, null, 2));

    ws.close();
    cleanup();
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('[TEST ERROR]', err);
    cleanup();
    process.exit(1);
  }
}

run();
