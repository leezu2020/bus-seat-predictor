import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
const PROFILE_DIR = path.join(process.cwd(), 'node_modules', '.cache', 'edge_m1_test_profile');

if (!fs.existsSync(PROFILE_DIR)) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

console.log('[TEST] Starting Edge on port', PORT);
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

    console.log('[TEST] Waiting for page load, route data fetch & MapLibre initialization...');
    let settled = false;
    for (let i = 0; i < 50; i++) {
      const check = await send('Runtime.evaluate', {
        expression: `(function() {
          const aside = document.querySelector('aside');
          const main = document.querySelector('main');
          const canvas = document.querySelector('.maplibregl-canvas');
          // Station markers are rendered inside map markers
          const markerCount = document.querySelectorAll('.cursor-pointer').length;
          return { hasAside: !!aside, hasMain: !!main, hasCanvas: !!canvas, markerCount };
        })()`,
        returnByValue: true
      });
      const val = check.result?.value;
      if (val && val.hasCanvas && val.markerCount > 5) {
        settled = true;
        console.log('[TEST] Route data settled with markers:', val);
        break;
      }
      await sleep(500);
    }

    if (!settled) {
      console.warn('[TEST] Markers did not exceed 5 within 25s, proceeding...');
    }

    // Give map a moment to finish any initial transitions
    await sleep(1000);

    // Mark witness on canvas for instance retention test
    await send('Runtime.evaluate', {
      expression: `(function() {
        const canvas = document.querySelector('.maplibregl-canvas');
        if (canvas) {
          canvas.dataset.challengerWitness = "preserved_instance_m1";
          window.__challengerWitnessCanvas = canvas;
          window.__challengerGl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          console.log('[BROWSER] Witness attached to canvas element.');
        }
      })()`
    });

    // Test matrix of viewports
    const viewports = [
      { name: 'Mobile S23 Ultra portrait', width: 384, height: 824, isMobile: true },
      { name: 'Mobile 412px (Galaxy/Pixel)', width: 412, height: 915, isMobile: true },
      { name: 'Mobile 360px (Small Android)', width: 360, height: 740, isMobile: true },
      { name: 'Mobile 430px (iPhone 14 Pro Max)', width: 430, height: 932, isMobile: true },
      { name: 'Landscape S23 Ultra', width: 824, height: 384, isMobile: true },
      { name: 'Desktop 1024px', width: 1024, height: 768, isMobile: false },
      { name: 'Desktop 1280px', width: 1280, height: 800, isMobile: false },
      { name: 'Desktop 1920px (FHD)', width: 1920, height: 1080, isMobile: false },
    ];

    const results = [];

    for (const vp of viewports) {
      console.log(`\n=== Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.isMobile
      });

      // Dispatch resize and wait for layout/ResizeObserver to process
      await send('Runtime.evaluate', {
        expression: `window.dispatchEvent(new Event('resize'))`
      });
      await sleep(600);

      const evalRes = await send('Runtime.evaluate', {
        expression: `(function() {
          const docEl = document.documentElement;
          const body = document.body;
          const aside = document.querySelector('aside');
          const main = document.querySelector('main');
          const canvas = document.querySelector('.maplibregl-canvas');
          const header = document.querySelector('header');
          
          // Find legend element specifically
          const legend = Array.from(document.querySelectorAll('div')).find(d => 
            d.className && typeof d.className === 'string' && d.className.includes('bottom-24')
          ) || Array.from(document.querySelectorAll('div')).filter(d => 
            d.textContent && d.textContent.includes('여유 (16석+)') && d.childElementCount >= 3
          ).pop();
            
          const controls = document.querySelector('button[title="전체 노선 보기"]')?.parentElement;

          const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
          const clientWidth = docEl.clientWidth;
          const hasHorizontalOverflow = scrollWidth > clientWidth + 1; // 1px rounding tolerance

          const asideStyle = aside ? window.getComputedStyle(aside) : null;
          const mainStyle = main ? window.getComputedStyle(main) : null;
          const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
          const asideRect = aside ? aside.getBoundingClientRect() : null;
          const mainRect = main ? main.getBoundingClientRect() : null;
          const headerRect = header ? header.getBoundingClientRect() : null;
          const legendRect = legend ? legend.getBoundingClientRect() : null;
          const controlsRect = controls ? controls.getBoundingClientRect() : null;

          const headerHasOverflow = header ? (header.scrollWidth > header.clientWidth + 1) : false;

          // Witness check
          const witnessRetained = canvas ? (
            canvas.dataset.challengerWitness === "preserved_instance_m1" && 
            canvas === window.__challengerWitnessCanvas
          ) : false;

          const legendBottomOffset = legendRect ? (window.innerHeight - legendRect.bottom) : null;
          const controlsTopOffset = controlsRect ? controlsRect.top : null;

          return {
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            scrollWidth,
            clientWidth,
            hasHorizontalOverflow,
            headerHasOverflow,
            aside: {
              exists: !!aside,
              display: asideStyle?.display,
              width: asideRect?.width,
              height: asideRect?.height,
              left: asideRect?.left,
              top: asideRect?.top,
              zIndex: asideStyle?.zIndex
            },
            main: {
              exists: !!main,
              position: mainStyle?.position,
              width: mainRect?.width,
              height: mainRect?.height,
              left: mainRect?.left,
              top: mainRect?.top,
              zIndex: mainStyle?.zIndex
            },
            canvas: {
              exists: !!canvas,
              width: canvasRect?.width,
              height: canvasRect?.height,
              left: canvasRect?.left,
              top: canvasRect?.top,
              witnessRetained
            },
            header: {
              exists: !!header,
              width: headerRect?.width,
              height: headerRect?.height,
              right: headerRect?.right,
              zIndex: header ? window.getComputedStyle(header).zIndex : null
            },
            legend: {
              exists: !!legend,
              left: legendRect?.left,
              bottom: legendBottomOffset,
              top: legendRect?.top,
              width: legendRect?.width,
              height: legendRect?.height,
              zIndex: legend ? window.getComputedStyle(legend).zIndex : null,
              isClipped: legendRect ? (legendRect.left < 0 || legendRect.right > window.innerWidth || legendRect.top < 0 || legendRect.bottom > window.innerHeight) : false
            },
            controls: {
              exists: !!controls,
              right: controlsRect ? (window.innerWidth - controlsRect.right) : null,
              top: controlsTopOffset,
              zIndex: controls ? window.getComputedStyle(controls).zIndex : null,
              isClipped: controlsRect ? (controlsRect.left < 0 || controlsRect.right > window.innerWidth || controlsRect.top < 0 || controlsRect.bottom > window.innerHeight) : false
            }
          };
        })()`,
        returnByValue: true
      });

      const data = evalRes.result.value;
      const isMobileBp = vp.width < 640;

      // Assertions
      const assertions = {
        horizontalOverflow: !data.hasHorizontalOverflow && !data.headerHasOverflow,
        asideVisibilityMatchesBreakpoint: isMobileBp ? (data.aside.display === 'none' || data.aside.width === 0) : (data.aside.display === 'flex' && data.aside.width >= 400),
        mainCoversExpectedSpace: isMobileBp ? (data.main.width === vp.width && data.main.left === 0) : (data.main.left >= 400 && data.main.width === (vp.width - data.aside.width)),
        canvasPresentAndSized: data.canvas.exists && data.canvas.width > 0 && data.canvas.height > 0,
        mapRetainedWithoutRemount: data.canvas.witnessRetained,
        legendNotClipped: !data.legend.isClipped,
        controlsNotClipped: !data.controls.isClipped,
        mobileLegendElevated: isMobileBp ? (data.legend.bottom >= 80) : (data.legend.bottom <= 40),
        zIndexCorrect: parseInt(data.header.zIndex) >= parseInt(data.controls.zIndex)
      };

      const allPassed = Object.values(assertions).every(Boolean);
      results.push({
        viewport: vp,
        data,
        assertions,
        pass: allPassed
      });

      console.log(`- Horizontal overflow: ${data.hasHorizontalOverflow || data.headerHasOverflow ? 'FAIL (OVERFLOW)' : 'PASS (Clean)'}`);
      console.log(`- Aside: display=${data.aside.display}, width=${data.aside.width}px (Expected: ${isMobileBp ? 'none/0px' : 'flex/>=400px'})`);
      console.log(`- Main: position=${data.main.position}, left=${data.main.left}px, width=${data.main.width}px`);
      console.log(`- Canvas: width=${data.canvas.width}px, height=${data.canvas.height}px, retained=${data.canvas.witnessRetained}`);
      console.log(`- Legend: bottom-offset=${data.legend.bottom}px (width=${data.legend.width}px), clipped=${data.legend.isClipped}`);
      console.log(`- Controls: top=${data.controls.top}px, clipped=${data.controls.isClipped}`);
      console.log(`- Z-index: Header=${data.header.zIndex}, Controls=${data.controls.zIndex}, Legend=${data.legend.zIndex}, Main=${data.main.zIndex}`);
      console.log(`=> Result: ${allPassed ? 'PASS' : 'FAIL'}`);
      if (!allPassed) {
        console.log('Failed assertions:', Object.entries(assertions).filter(([_, v]) => !v));
      }
    }

    // Dynamic Viewport Shift Cycle Stress Test (Rapid Transitions)
    console.log('\n=== Stress Test: Rapid Viewport Shift Cycle (Instance Retention) ===');
    const cycle = [384, 824, 1024, 1920, 360, 430, 384];
    let retentionFailures = 0;
    for (let i = 0; i < cycle.length; i++) {
      const w = cycle[i];
      const h = w === 824 ? 384 : 800;
      await send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: h,
        deviceScaleFactor: 1,
        mobile: w < 640
      });
      await send('Runtime.evaluate', { expression: `window.dispatchEvent(new Event('resize'))` });
      await sleep(200);

      const check = await send('Runtime.evaluate', {
        expression: `(function() {
          const canvas = document.querySelector('.maplibregl-canvas');
          const currentGl = canvas ? (canvas.getContext('webgl2') || canvas.getContext('webgl')) : null;
          return {
            retained: canvas && canvas.dataset.challengerWitness === "preserved_instance_m1" && canvas === window.__challengerWitnessCanvas,
            glRetained: currentGl === window.__challengerGl,
            width: canvas ? canvas.clientWidth : 0,
            height: canvas ? canvas.clientHeight : 0
          };
        })()`,
        returnByValue: true
      });
      const cData = check.result.value;
      if (!cData.retained || !cData.glRetained) {
        retentionFailures++;
        console.error(`FAIL at shift to ${w}px: Canvas remounted or WebGL context lost!`);
      } else {
        console.log(`Shift ${i+1}/${cycle.length} (${w}px): Preserved! Canvas clientWidth=${cData.width}px, clientHeight=${cData.height}px, WebGL Context=Active`);
      }
    }

    console.log('\n================ SUMMARY ================');
    const totalVps = results.length;
    const passedVps = results.filter(r => r.pass).length;
    console.log(`Viewport tests passed: ${passedVps}/${totalVps}`);
    console.log(`Retention stress failures: ${retentionFailures}`);

    // Output JSON result file for report generator
    fs.writeFileSync('challenger_m1_results.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      viewportResults: results,
      retentionFailures,
      overallPass: passedVps === totalVps && retentionFailures === 0
    }, null, 2));

    ws.close();
    cleanup();
    process.exit(passedVps === totalVps && retentionFailures === 0 ? 0 : 1);
  } catch (err) {
    console.error('[TEST ERROR]', err);
    cleanup();
    process.exit(1);
  }
}

run();
