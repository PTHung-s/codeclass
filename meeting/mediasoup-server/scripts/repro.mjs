/** Reproduce chính xác flow loadtest: String.raw + IIFE evaluate + __runClient */
import { chromium } from 'playwright-core';
import { existsSync } from 'fs';

const BROWSER_PATH = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 120)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 120)); });

await page.goto('https://webrtc.github.io/samples/src/content/devices/input-output/', { waitUntil: 'domcontentloaded' });

const script = String.raw`
async function runClient(sfuUrl, roomId, peerName) {
  const { io } = await import('https://cdn.socket.io/4.7.5/socket.io.esm.min.js');
  const { Device } = await import('https://esm.sh/mediasoup-client@3?dev');
  const d = new Device();
  return 'handler=' + d.handlerName;
}
window.__runClient = runClient;
`;

await page.evaluate(`(async () => { ${script} })()`);
const r = await page.evaluate(`window.__runClient ? window.__runClient("http://x", "r", "p") : "NO_FN"`);
console.log('RESULT:', r);
await browser.close();
