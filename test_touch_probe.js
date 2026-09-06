import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9338;
const PROFILE_DIR = path.join(process.cwd(), 'node_modules', '.cache', 'edge_touch_probe');

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
    await sleep(1500);
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
    await send('Emulation.setDeviceMetricsOverride', {
      width: 384,
      height: 824,
      deviceScaleFactor: 1,
      mobile: true
    });
    await sleep(1000);

    // Test dragging with React re-render wait
    const result = await send('Runtime.evaluate', {
      expression: `(async function() {
        const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
        const header = sheet.children[0];
        const rect = header.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + 20;

        // Step 1: Touchstart
        header.dispatchEvent(new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 1, target: header, clientX: cx, clientY: cy })]
        }));

        // Wait 50ms for React state update
        await new Promise(r => setTimeout(r, 50));

        // Step 2: Touchmove (drag up 100px)
        header.dispatchEvent(new TouchEvent('touchmove', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 1, target: header, clientX: cx, clientY: cy - 100 })]
        }));

        // Wait 150ms
        await new Promise(r => setTimeout(r, 150));

        // Step 3: Touchend
        header.dispatchEvent(new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          changedTouches: [new Touch({ identifier: 1, target: header, clientX: cx, clientY: cy - 100 })]
        }));

        // Wait 400ms for transition
        await new Promise(r => setTimeout(r, 400));

        const isHalf = sheet.children[1] && window.getComputedStyle(sheet.children[1]).display !== 'none';
        const isFull = sheet.children[2] && window.getComputedStyle(sheet.children[2]).display !== 'none';
        return { isHalf, isFull, transform: sheet.style.transform };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('[PROBE RESULT]', result.result?.value);
    edgeProc.kill('SIGKILL');
    process.exit(0);
  } catch (err) {
    console.error(err);
    edgeProc.kill('SIGKILL');
    process.exit(1);
  }
}

run();
