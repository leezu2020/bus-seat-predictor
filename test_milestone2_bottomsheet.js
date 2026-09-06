import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9340;
const PROFILE_DIR = path.join(process.cwd(), 'node_modules', '.cache', 'edge_m2_final_profile');

if (!fs.existsSync(PROFILE_DIR)) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

console.log('[TEST] Starting Edge headless on port', PORT);
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
  console.log('[TEST] Cleaning up Edge process...');
  try {
    edgeProc.kill('SIGKILL');
  } catch (e) {}
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('uncaughtException', (err) => {
  console.error('[TEST] Uncaught Exception:', err);
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
  const testResults = {
    category1_viewports: [],
    category2_stress: {},
    category3_station_select: {},
    category4_slider: {},
    summary: {
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0
    }
  };

  function assert(name, condition, details = {}) {
    testResults.summary.totalChecks++;
    if (condition) {
      testResults.summary.passedChecks++;
      console.log(`  ✓ PASS: ${name}`);
      return true;
    } else {
      testResults.summary.failedChecks++;
      console.error(`  ✗ FAIL: ${name}`, details);
      return false;
    }
  }

  try {
    const wsUrl = await waitForCdpReady();
    console.log('[TEST] Connected to CDP:', wsUrl);

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

    console.log('[TEST] Waiting for initial page & MapLibre load...');
    let settled = false;
    for (let i = 0; i < 50; i++) {
      const check = await send('Runtime.evaluate', {
        expression: `(function() {
          const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
          const canvas = document.querySelector('.maplibregl-canvas');
          const markers = document.querySelectorAll('.cursor-pointer').length;
          return { hasSheet: !!sheet, hasCanvas: !!canvas, markers };
        })()`,
        returnByValue: true
      });
      const val = check.result?.value;
      if (val && val.hasSheet && val.hasCanvas && val.markers > 5) {
        settled = true;
        console.log('[TEST] Initial DOM ready with markers:', val);
        break;
      }
      await sleep(500);
    }
    if (!settled) {
      console.warn('[TEST] Settling took longer than 25s, proceeding anyway...');
    }
    await sleep(1000);

    // Helper: Set viewport
    async function setViewport(w, h) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: h,
        deviceScaleFactor: 1,
        mobile: true
      });
      await send('Runtime.evaluate', { expression: `window.dispatchEvent(new Event('resize'))` });
      await sleep(400);
    }

    // Helper: Evaluate bottom sheet state
    async function getSheetState() {
      const res = await send('Runtime.evaluate', {
        expression: `(function() {
          const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
          if (!sheet) return null;
          const rect = sheet.getBoundingClientRect();
          const style = window.getComputedStyle(sheet);
          
          // Child tiers
          const halfContainer = sheet.children[1];
          const fullContainer = sheet.children[2];
          const isHalfVisible = halfContainer && window.getComputedStyle(halfContainer).display !== 'none';
          const isFullVisible = fullContainer && window.getComputedStyle(fullContainer).display !== 'none';
          
          let derivedTier = 'PEEK';
          if (isHalfVisible) derivedTier = 'HALF';
          else if (isFullVisible) derivedTier = 'FULL';

          // Peek header details
          const header = sheet.children[0];
          const headerRect = header ? header.getBoundingClientRect() : null;
          const stationNameEl = header ? header.querySelector('.text-sm.font-black') : null;
          const directionBadgeEl = header ? header.querySelector('span.rounded.bg-rose-600') : null;
          const starBtn = header ? header.querySelector('button[aria-label*="즐겨찾기"]') : null;
          const isStarred = starBtn ? starBtn.getAttribute('aria-label') === '즐겨찾기 해제' : false;

          return {
            exists: true,
            tier: derivedTier,
            rect: {
              top: rect.top,
              bottom: rect.bottom,
              height: rect.height,
              width: rect.width,
              left: rect.left,
              right: rect.right
            },
            headerRect: headerRect ? {
              top: headerRect.top,
              bottom: headerRect.bottom,
              height: headerRect.height,
              width: headerRect.width
            } : null,
            visibleHeight: window.innerHeight - rect.top,
            windowHeight: window.innerHeight,
            windowWidth: window.innerWidth,
            inlineTransform: sheet.style.transform,
            computedTransform: style.transform,
            transition: style.transition,
            stationName: stationNameEl ? stationNameEl.textContent.trim() : '',
            directionBadge: directionBadgeEl ? directionBadgeEl.textContent.trim() : '',
            isStarred
          };
        })()`,
        returnByValue: true
      });
      return res.result?.value;
    }

    // Realistic Touch Drag with React State Lifecycle Wait
    async function realisticTouchDrag(deltaY, moveTimeMs = 120) {
      await send('Runtime.evaluate', {
        expression: `(async function() {
          const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
          const header = sheet.children[0];
          const rect = header.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + 20;

          // Step 1: touchstart
          header.dispatchEvent(new TouchEvent('touchstart', {
            bubbles: true,
            cancelable: true,
            touches: [new Touch({ identifier: 1, target: header, clientX: cx, clientY: cy })]
          }));

          // Allow React to process setIsDragging(true)
          await new Promise(r => setTimeout(r, 40));

          // Step 2: intermediate move steps
          const steps = 4;
          const stepDelta = ${deltaY} / steps;
          const stepWait = ${moveTimeMs} / steps;

          for (let i = 1; i <= steps; i++) {
            header.dispatchEvent(new TouchEvent('touchmove', {
              bubbles: true,
              cancelable: true,
              touches: [new Touch({ identifier: 1, target: header, clientX: cx, clientY: cy + stepDelta * i })]
            }));
            await new Promise(r => setTimeout(r, stepWait));
          }

          // Step 3: touchend
          header.dispatchEvent(new TouchEvent('touchend', {
            bubbles: true,
            cancelable: true,
            changedTouches: [new Touch({ identifier: 1, target: header, clientX: cx, clientY: cy + ${deltaY} })]
          }));
        })()`,
        awaitPromise: true
      });
      await sleep(400); // allow CSS cubic-bezier transition to settle
    }

    // Tap on header
    async function tapHeader() {
      await send('Runtime.evaluate', {
        expression: `(function() {
          const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
          const header = sheet.children[0];
          header.click();
        })()`
      });
      await sleep(400);
    }

    // =========================================================================
    // MISSION TARGET 1: Viewports & Gestures (384px S23 Ultra, 412px, 360px)
    // =========================================================================
    console.log('\n=================================================================');
    console.log('MISSION TARGET 1: Mobile Viewport Gesture & Snap Tier Testing');
    console.log('=================================================================');

    const mobileViewports = [
      { name: 'Galaxy S23 Ultra', width: 384, height: 824 },
      { name: 'Standard Galaxy/Pixel', width: 412, height: 915 },
      { name: 'Small Android Viewport', width: 360, height: 740 }
    ];

    for (const vp of mobileViewports) {
      console.log(`\n--- Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
      await setViewport(vp.width, vp.height);

      // 1. Initial State: PEEK
      let state = await getSheetState();
      // Ensure starting in PEEK
      if (state.tier !== 'PEEK') {
        await realisticTouchDrag(250, 100);
        state = await getSheetState();
      }
      assert(`${vp.name}: Initial tier is PEEK`, state.tier === 'PEEK', state);
      assert(`${vp.name}: PEEK visible height is ~92px`, Math.abs(state.visibleHeight - 92) <= 6, {
        visibleHeight: state.visibleHeight,
        expected: 92
      });
      assert(`${vp.name}: PEEK header shows station name`, state.stationName.length > 0, state);
      assert(`${vp.name}: PEEK header shows direction`, state.directionBadge === '안양행' || state.directionBadge === '구리행', state);

      // 2. Gesture PEEK -> HALF (drag upward 80px in 120ms: velocity ~ -0.66 px/ms or delta < -40)
      await realisticTouchDrag(-80, 120);
      state = await getSheetState();
      const expectedHalfHeight = vp.height * 0.48;
      assert(`${vp.name}: Upward drag transitions PEEK -> HALF`, state.tier === 'HALF', state);
      assert(`${vp.name}: HALF visible height is ~48vh (${Math.round(expectedHalfHeight)}px)`, 
        Math.abs(state.visibleHeight - expectedHalfHeight) <= 12, {
          visibleHeight: state.visibleHeight,
          expectedHalfHeight
        });

      // 3. Gesture HALF -> FULL (drag upward 80px in 120ms)
      await realisticTouchDrag(-80, 120);
      state = await getSheetState();
      const expectedFullHeight = vp.height * 0.88;
      assert(`${vp.name}: Upward drag transitions HALF -> FULL`, state.tier === 'FULL', state);
      assert(`${vp.name}: FULL visible height is ~88vh (${Math.round(expectedFullHeight)}px)`,
        Math.abs(state.visibleHeight - expectedFullHeight) <= 12, {
          visibleHeight: state.visibleHeight,
          expectedFullHeight
        });

      // 4. Gesture FULL -> HALF (drag downward 80px in 120ms)
      await realisticTouchDrag(80, 120);
      state = await getSheetState();
      assert(`${vp.name}: Downward drag transitions FULL -> HALF`, state.tier === 'HALF', state);

      // 5. Gesture HALF -> PEEK (drag downward 80px in 120ms)
      await realisticTouchDrag(80, 120);
      state = await getSheetState();
      assert(`${vp.name}: Downward drag transitions HALF -> PEEK`, state.tier === 'PEEK', state);

      // 6. Direct Leap PEEK -> FULL (high velocity upward flick: deltaY = -220px in 80ms)
      await realisticTouchDrag(-220, 80);
      state = await getSheetState();
      assert(`${vp.name}: High velocity flick transitions PEEK directly to FULL`, state.tier === 'FULL', state);

      // 7. Direct Leap FULL -> PEEK (high velocity downward flick: deltaY = +220px in 80ms)
      await realisticTouchDrag(220, 80);
      state = await getSheetState();
      assert(`${vp.name}: High velocity flick transitions FULL directly to PEEK`, state.tier === 'PEEK', state);

      testResults.category1_viewports.push({
        viewport: vp,
        finalState: state
      });
    }

    // =========================================================================
    // MISSION TARGET 2: Rapid Tapping, Drag Cancellation & Boundary Overflow
    // =========================================================================
    console.log('\n=================================================================');
    console.log('MISSION TARGET 2: Stress Testing (Rapid Tapping, Cancellation, Boundaries)');
    console.log('=================================================================');
    await setViewport(384, 824); // S23 Ultra reference

    // 1. Rapid Tapping on Header (10 rapid taps with 75ms spacing)
    console.log('[STRESS] Running 10 rapid taps on bottom sheet header bar...');
    for (let t = 0; t < 10; t++) {
      await send('Runtime.evaluate', {
        expression: `(function() {
          const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
          const header = sheet.children[0];
          header.click();
        })()`
      });
      await sleep(75);
    }
    await sleep(400); // allow transitions to settle
    let stressState = await getSheetState();
    assert('Rapid tapping does not crash or invalidate tier', ['PEEK', 'HALF', 'FULL'].includes(stressState.tier), stressState);
    assert('Transform remains valid and not NaN after rapid tapping', !stressState.inlineTransform.includes('NaN'), stressState);

    // 2. Drag Cancellation / Deadzone (< 40px drag with slow velocity)
    // Snap cleanly to PEEK first
    await realisticTouchDrag(250, 100);
    stressState = await getSheetState();
    
    // Sub-threshold drag in PEEK: deltaY = -15px (slow drag over 300ms: velocity = -0.05 px/ms < -0.25 threshold)
    console.log('[STRESS] Testing drag cancellation (drag -15px < -40px threshold)...');
    await realisticTouchDrag(-15, 300);
    let postCancelState = await getSheetState();
    assert('Sub-threshold upward drag (-15px) cancels and stays in PEEK', postCancelState.tier === 'PEEK', postCancelState);

    // Transition cleanly to HALF
    await realisticTouchDrag(-80, 120);
    let halfState = await getSheetState();
    assert('Reached HALF tier before sub-threshold test', halfState.tier === 'HALF', halfState);

    // Sub-threshold drag in HALF: deltaY = -15px (slow: 300ms)
    await realisticTouchDrag(-15, 300);
    let postHalfCancel1 = await getSheetState();
    assert('Sub-threshold upward drag in HALF cancels and stays in HALF', postHalfCancel1.tier === 'HALF', postHalfCancel1);

    // Sub-threshold downward drag in HALF: deltaY = +15px (slow: 300ms)
    await realisticTouchDrag(15, 300);
    let postHalfCancel2 = await getSheetState();
    assert('Sub-threshold downward drag in HALF cancels and stays in HALF', postHalfCancel2.tier === 'HALF', postHalfCancel2);

    // 3. Boundary Overflow & Resistance:
    // Case A: Dragging ABOVE FULL (88vh)
    console.log('[STRESS] Testing boundary resistance above 88vh (FULL tier)...');
    // Transition to FULL
    await realisticTouchDrag(-100, 120);
    let fullState = await getSheetState();
    assert('Reached FULL tier before upper boundary test', fullState.tier === 'FULL', fullState);

    // Measure mid-drag displacement when dragging upwards by -200px
    const upperDragTest = await send('Runtime.evaluate', {
      expression: `(async function() {
        const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
        const header = sheet.children[0];
        const rect = header.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + 20;

        // start touch
        header.dispatchEvent(new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 1, target: header, clientX: cx, clientY: cy })]
        }));

        await new Promise(r => setTimeout(r, 40));

        // move by -200px
        header.dispatchEvent(new TouchEvent('touchmove', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 1, target: header, clientX: cx, clientY: cy - 200 })]
        }));

        await new Promise(r => setTimeout(r, 20));
        const midDragTransform = sheet.style.transform;

        // release touch
        header.dispatchEvent(new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          changedTouches: [new Touch({ identifier: 1, target: header, clientX: cx, clientY: cy - 200 })]
        }));

        return { midDragTransform };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const midTransform = upperDragTest.result?.value?.midDragTransform || '';
    // In FULL: deltaY < 0 applies 0.15 factor: -200 * 0.15 = -30px -> translateY(calc(0px + -30px))
    assert('Upper boundary resistance applies 0.15 dampening factor (-30px for -200px drag)',
      midTransform.includes('-30px'), { midTransform, expected: 'contains -30px' });

    await sleep(400);
    let settledUpperState = await getSheetState();
    assert('Upper overflow release snaps cleanly back to FULL', settledUpperState.tier === 'FULL', settledUpperState);

    // Case B: Dragging BELOW PEEK (92px)
    console.log('[STRESS] Testing boundary resistance below 92px (PEEK tier)...');
    await realisticTouchDrag(250, 100); // flick down to PEEK
    let peekState = await getSheetState();
    assert('Reached PEEK tier before lower boundary test', peekState.tier === 'PEEK', peekState);

    const lowerDragTest = await send('Runtime.evaluate', {
      expression: `(async function() {
        const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
        const header = sheet.children[0];
        const rect = header.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + 20;

        // start touch
        header.dispatchEvent(new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 1, target: header, clientX: cx, clientY: cy })]
        }));

        await new Promise(r => setTimeout(r, 40));

        // move downwards by +200px
        header.dispatchEvent(new TouchEvent('touchmove', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 1, target: header, clientX: cx, clientY: cy + 200 })]
        }));

        await new Promise(r => setTimeout(r, 20));
        const midDragTransform = sheet.style.transform;

        // release touch
        header.dispatchEvent(new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          changedTouches: [new Touch({ identifier: 1, target: header, clientX: cx, clientY: cy + 200 })]
        }));

        return { midDragTransform };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const lowerMidTransform = lowerDragTest.result?.value?.midDragTransform || '';
    // In PEEK: base is calc(88vh - 92px). deltaY > 0 applies 0.15 factor: +200 * 0.15 = +30px.
    // CSS engine simplifies (-92px + 30px) to -62px.
    const lowerDampenedCorrectly = lowerMidTransform.includes('-62px') || lowerMidTransform.includes('30px');
    assert('Lower boundary resistance applies 0.15 dampening factor (+30px for -92px => -62px)',
      lowerDampenedCorrectly, { lowerMidTransform, expected: 'contains -62px or 30px' });

    await sleep(400);
    let settledLowerState = await getSheetState();
    assert('Lower overflow release snaps cleanly back to PEEK', settledLowerState.tier === 'PEEK', settledLowerState);

    // =========================================================================
    // MISSION TARGET 3: Station Selection in FULL tier & Map FlyTo Offset
    // =========================================================================
    console.log('\n=================================================================');
    console.log('MISSION TARGET 3: Station Selection in FULL tier & Map Camera Offset');
    console.log('=================================================================');

    // 1. Open to FULL tier
    await realisticTouchDrag(-220, 80); // direct flick to FULL
    let fullForSelect = await getSheetState();
    assert('Sheet opened to FULL tier', fullForSelect.tier === 'FULL', fullForSelect);

    // 2. Select a target station from StationTimeline (stationSeq 22: 가천대역.EX-허브)
    const selectTargetRes = await send('Runtime.evaluate', {
      expression: `(function() {
        const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
        const timeline = sheet.children[2];
        const stopItems = Array.from(timeline.querySelectorAll('div.group.relative.cursor-pointer'));
        
        let target = stopItems.find(el => el.textContent.includes('가천대역')) || stopItems[5];
        if (!target) return { found: false };

        const name = target.querySelector('.text-xs')?.textContent?.trim();
        target.click();
        return { found: true, name };
      })()`,
      returnByValue: true
    });
    const selectTarget = selectTargetRes.result?.value;
    assert('Target station element clicked in FULL StationTimeline', selectTarget?.found === true, selectTarget);

    // 3. Verify Sheet automatically snaps down to HALF tier
    await sleep(500);
    let postSelectSheet = await getSheetState();
    assert('Sheet automatically transitions from FULL down to HALF on station select',
      postSelectSheet.tier === 'HALF', postSelectSheet);
    assert('Peek header updates station name to selected station',
      postSelectSheet.stationName.includes(selectTarget?.name || '가천대역'), postSelectSheet);

    // 4. Verify Map Camera flyTo & upward offset (-100px)
    console.log('[MAP] Waiting for MapLibre flyTo animation to settle (1.4s)...');
    await sleep(1400);

    const markerPositionCheck = await send('Runtime.evaluate', {
      expression: `(function() {
        const allMarkers = Array.from(document.querySelectorAll('.maplibregl-marker'));
        const selectedMarker = allMarkers.find(m => 
          m.querySelector('.ring-4') || 
          m.querySelector('.bg-blue-600.animate-bounce') ||
          (m.textContent && m.textContent.includes('22'))
        );

        const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
        const sheetRect = sheet ? sheet.getBoundingClientRect() : null;
        const markerRect = selectedMarker ? selectedMarker.getBoundingClientRect() : null;
        const header = document.querySelector('header');
        const headerRect = header ? header.getBoundingClientRect() : null;

        return {
          markerFound: !!selectedMarker,
          markerRect: markerRect ? {
            top: markerRect.top,
            bottom: markerRect.bottom,
            left: markerRect.left,
            right: markerRect.right,
            centerY: markerRect.top + markerRect.height / 2
          } : null,
          sheetTop: sheetRect ? sheetRect.top : null,
          headerBottom: headerRect ? headerRect.bottom : null,
          windowHeight: window.innerHeight,
          windowWidth: window.innerWidth
        };
      })()`,
      returnByValue: true
    });
    const markerData = markerPositionCheck.result?.value;
    assert('Selected station marker found on map', markerData?.markerFound === true, markerData);

    if (markerData && markerData.markerRect && markerData.sheetTop) {
      const clearanceAboveSheet = markerData.sheetTop - markerData.markerRect.bottom;
      const clearanceBelowHeader = markerData.markerRect.top - (markerData.headerBottom || 0);

      console.log(`[MAP GEOMETRY] Marker CenterY: ${Math.round(markerData.markerRect.centerY)}px, SheetTop: ${Math.round(markerData.sheetTop)}px`);
      console.log(`[MAP GEOMETRY] Clearance above sheet: ${Math.round(clearanceAboveSheet)}px, Clearance below header: ${Math.round(clearanceBelowHeader)}px`);

      assert('Selected station marker is positioned above the bottom sheet (not occluded)',
        clearanceAboveSheet > 20, { clearanceAboveSheet, markerData });
      assert('Selected station marker is positioned below the header (visible in viewport)',
        clearanceBelowHeader > 10, { clearanceBelowHeader, markerData });
    }

    // =========================================================================
    // MISSION TARGET 4: Queue Slider Interaction Isolation & Recalculation
    // =========================================================================
    console.log('\n=================================================================');
    console.log('MISSION TARGET 4: Queue Slider Touch Isolation & Recalculation');
    console.log('=================================================================');

    // Currently in HALF tier
    let halfForSlider = await getSheetState();
    assert('Sheet is in HALF tier for slider test', halfForSlider.tier === 'HALF', halfForSlider);

    // 1. Touch interaction on slider thumb:
    console.log('[SLIDER] Testing touch drag on slider input...');
    const sliderTouchTest = await send('Runtime.evaluate', {
      expression: `(function() {
        const slider = document.querySelector('input[type="range"]');
        if (!slider) return { found: false };
        const sRect = slider.getBoundingClientRect();
        const startX = sRect.left + sRect.width / 2;
        const startY = sRect.top + sRect.height / 2;

        const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
        const sheetTopBefore = sheet.getBoundingClientRect().top;

        // Touch start on slider
        slider.dispatchEvent(new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 1, target: slider, clientX: startX, clientY: startY })]
        }));

        // Move horizontally and vertically (+40px Y, +50px X)
        slider.dispatchEvent(new TouchEvent('touchmove', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 1, target: slider, clientX: startX + 50, clientY: startY + 40 })]
        }));

        const sheetTopDuring = sheet.getBoundingClientRect().top;

        // Touch end
        slider.dispatchEvent(new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          changedTouches: [new Touch({ identifier: 1, target: slider, clientX: startX + 50, clientY: startY + 40 })]
        }));

        const sheetTopAfter = sheet.getBoundingClientRect().top;

        return {
          found: true,
          sheetTopBefore,
          sheetTopDuring,
          sheetTopAfter,
          sheetDisplacedDuring: Math.abs(sheetTopDuring - sheetTopBefore),
          sheetDisplacedAfter: Math.abs(sheetTopAfter - sheetTopBefore)
        };
      })()`,
      returnByValue: true
    });
    const sTouch = sliderTouchTest.result?.value;
    assert('Queue slider element found in DOM', sTouch?.found === true, sTouch);
    assert('Touching & dragging slider does NOT displace the bottom sheet (sheetTopBefore === sheetTopDuring)',
      sTouch?.sheetDisplacedDuring === 0, sTouch);
    assert('Sheet remains firmly at HALF tier after slider touch drag',
      sTouch?.sheetDisplacedAfter === 0, sTouch);

    // 2. Stepper '+' and '-' buttons & queue value recalculation
    console.log('[SLIDER] Testing stepper buttons (+/-) and recalculation...');
    const stepperTest = await send('Runtime.evaluate', {
      expression: `(async function() {
        const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
        const minusBtn = sheet.querySelector('.bg-slate-50 button:first-of-type');
        const plusBtn = sheet.querySelector('.bg-slate-50 button:last-of-type');
        const rangeInput = sheet.querySelector('input[type="range"]');

        const val0 = Number(rangeInput.value);

        // Click plus 3 times with react re-render delay
        plusBtn.click();
        await new Promise(r => setTimeout(r, 60));
        plusBtn.click();
        await new Promise(r => setTimeout(r, 60));
        plusBtn.click();
        await new Promise(r => setTimeout(r, 100));
        const val1 = Number(rangeInput.value);

        // Click minus 1 time
        minusBtn.click();
        await new Promise(r => setTimeout(r, 100));
        const val2 = Number(rangeInput.value);

        return { val0, val1, val2 };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const stepData = stepperTest.result?.value;
    assert('Clicking + increments queue value (+3)', stepData?.val1 === (stepData?.val0 + 3), stepData);
    assert('Clicking - decrements queue value (-1)', stepData?.val2 === (stepData?.val1 - 1), stepData);

    // 3. Setting range slider directly to high value (20) and verifying probability recalculation
    console.log('[SLIDER] Direct slider change to q=20 and verifying live simulation update...');
    await send('Runtime.evaluate', {
      expression: `(async function() {
        const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
        const rangeInput = sheet.querySelector('input[type="range"]');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(rangeInput, '20');
        rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
        rangeInput.dispatchEvent(new Event('change', { bubbles: true }));
      })()`
    });
    await sleep(600); // allow TanStack query refetch / debounce
    const simUpdateCheck = await send('Runtime.evaluate', {
      expression: `(function() {
        const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
        const queueLabel = sheet.querySelector('.text-blue-600')?.textContent?.trim();
        const probElements = Array.from(sheet.querySelectorAll('.font-extrabold')).map(el => el.textContent.trim());
        const hasProbPercentages = probElements.some(t => t.includes('%'));
        return { queueLabel, probElements, hasProbPercentages };
      })()`,
      returnByValue: true
    });
    const simCheck = simUpdateCheck.result?.value;
    assert('Queue label updates to 20명', simCheck?.queueLabel === '20명', simCheck);
    assert('Boarding probabilities are computed and rendered as percentages', simCheck?.hasProbPercentages === true, simCheck);

    // 4. Bookmark Star StopPropagation Test:
    console.log('[BOOKMARK] Testing bookmark star button click propagation...');
    const bookmarkTest = await send('Runtime.evaluate', {
      expression: `(async function() {
        const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
        const header = sheet.children[0];
        const starBtn = header.querySelector('button[aria-label*="즐겨찾기"]');
        if (!starBtn) return { found: false };

        const tierBefore = sheet.children[1] && window.getComputedStyle(sheet.children[1]).display !== 'none' ? 'HALF' : 'OTHER';
        const starLabelBefore = starBtn.getAttribute('aria-label');

        // Click star button
        starBtn.click();
        await new Promise(r => setTimeout(r, 150)); // wait for React bookmark state update

        const starLabelAfter = starBtn.getAttribute('aria-label');
        const tierAfter = sheet.children[1] && window.getComputedStyle(sheet.children[1]).display !== 'none' ? 'HALF' : 'OTHER';

        return {
          found: true,
          tierBefore,
          tierAfter,
          starLabelBefore,
          starLabelAfter,
          labelToggled: starLabelBefore !== starLabelAfter,
          tierRetained: tierBefore === tierAfter
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const bTest = bookmarkTest.result?.value;
    assert('Star button found on header', bTest?.found === true, bTest);
    assert('Clicking star toggles bookmark state', bTest?.labelToggled === true, bTest);
    assert('Clicking star does NOT trigger header click or change tier (stopPropagation works)', bTest?.tierRetained === true, bTest);

    // =========================================================================
    // SUMMARY & REPORT GENERATION
    // =========================================================================
    console.log('\n=================================================================');
    console.log('CHALLENGER 1 M2 SUMMARY REPORT');
    console.log('=================================================================');
    console.log(`Total Checks Executed : ${testResults.summary.totalChecks}`);
    console.log(`Passed Checks         : ${testResults.summary.passedChecks}`);
    console.log(`Failed Checks         : ${testResults.summary.failedChecks}`);
    const verdict = testResults.summary.failedChecks === 0 ? 'APPROVE' : 'REQUEST_CHANGES';
    console.log(`FINAL VERDICT         : ${verdict}`);

    fs.writeFileSync('challenger_m2_results.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: testResults.summary,
      verdict,
      details: testResults
    }, null, 2));

    ws.close();
    cleanup();
    process.exit(testResults.summary.failedChecks === 0 ? 0 : 1);
  } catch (err) {
    console.error('[TEST ERROR]', err);
    cleanup();
    process.exit(1);
  }
}

run();
