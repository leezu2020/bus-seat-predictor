import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9339;
const PROFILE_DIR = path.join(process.cwd(), 'node_modules', '.cache', 'edge_ctrl_probe');

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

    const result = await send('Runtime.evaluate', {
      expression: `(async function() {
        const sheet = document.querySelector('div.fixed.inset-x-0.bottom-0');
        const header = sheet.children[0];

        // Click header to open HALF
        header.click();
        await new Promise(r => setTimeout(r, 400));

        // Find slider and buttons
        const rangeInput = sheet.querySelector('input[type="range"]');
        const minusBtn = sheet.querySelector('.bg-slate-50 button:first-of-type');
        const plusBtn = sheet.querySelector('.bg-slate-50 button:last-of-type');
        const starBtn = header.querySelector('button[aria-label*="즐겨찾기"]');

        const initialQ = Number(rangeInput.value);

        // Click plus 3 times with react wait
        plusBtn.click();
        await new Promise(r => setTimeout(r, 50));
        plusBtn.click();
        await new Promise(r => setTimeout(r, 50));
        plusBtn.click();
        await new Promise(r => setTimeout(r, 100));
        const afterPlusQ = Number(rangeInput.value);

        // Click minus 1 time
        minusBtn.click();
        await new Promise(r => setTimeout(r, 100));
        const afterMinusQ = Number(rangeInput.value);

        // React native value setter for input range
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(rangeInput, '20');
        rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
        rangeInput.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 600));

        const queueLabel = sheet.querySelector('.text-blue-600')?.textContent?.trim();

        // Bookmark test with wait
        const starLabelBefore = starBtn.getAttribute('aria-label');
        starBtn.click();
        await new Promise(r => setTimeout(r, 150));
        const starLabelAfter = starBtn.getAttribute('aria-label');

        return {
          initialQ,
          afterPlusQ,
          afterMinusQ,
          queueLabel,
          starLabelBefore,
          starLabelAfter
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('[CONTROLS PROBE RESULT]', result.result?.value);
    edgeProc.kill('SIGKILL');
    process.exit(0);
  } catch (err) {
    console.error(err);
    edgeProc.kill('SIGKILL');
    process.exit(1);
  }
}

run();
