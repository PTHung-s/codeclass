/** Debug: kiểm tra hỗ trợ WebRTC trong headless Chrome + khả năng load mediasoup-client từ CDN */
import { chromium } from 'playwright-core';
import { existsSync } from 'fs';

const BROWSER_PATH = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--enable-features=FakeDeviceForMediaStream'],
});
const page = await browser.newPage();
await page.goto('https://webrtc.github.io/samples/src/content/devices/input-output/', { waitUntil: 'domcontentloaded' });
console.log('page loaded:', await page.evaluate('location.origin'));
page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text().slice(0, 150)));
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 200)));

console.log('UA:', await page.evaluate('navigator.userAgent'));

// 1. WebRTC API có mặt?
console.log('RTCPeerConnection:', await page.evaluate('typeof RTCPeerConnection'));
console.log('RTCRtpTransceiver:', await page.evaluate('typeof RTCRtpTransceiver'));
console.log('navigator.mediaDevices:', await page.evaluate('navigator.mediaDevices === undefined ? "UNDEFINED" : (navigator.mediaDevices === null ? "NULL" : "object")'));
console.log('isSecureContext:', await page.evaluate('window.isSecureContext'));
console.log('about:blank href:', await page.evaluate('location.href'));
console.log('RTCRtpSender.getCapabilities:', await page.evaluate('typeof RTCRtpSender !== "undefined" && !!RTCRtpSender.getCapabilities'));

// 2. getUserMedia với fake device
try {
  const stream = await page.evaluate(`(async () => {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    return s.getTracks().map(t => t.kind + ':' + t.label).join(', ');
  })()`);
  console.log('getUserMedia OK:', stream);
} catch (e) {
  console.log('getUserMedia FAIL:', String(e).slice(0, 120));
}

// 3. RTCRtpSender.getCapabilities('video') — mediasoup-client Device() cần cái này
const vidCaps = await page.evaluate(`(() => {
  try { return JSON.stringify(RTCRtpSender.getCapabilities('video')?.codecs?.length); }
  catch (e) { return 'ERR: ' + e.message; }
})()`);
console.log('Sender video codecs:', vidCaps);

// 4. Load mediasoup-client từ esm.sh
try {
  await page.evaluate(`(async () => {
    const m = await import('https://esm.sh/mediasoup-client@3?dev');
    window.__Device = m.Device;
  })()`);
  console.log('mediasoup-client loaded:', await page.evaluate('typeof window.__Device'));
} catch (e) {
  console.log('mediasoup-client LOAD FAIL:', String(e).slice(0, 150));
}

// 5. Thử new Device()
try {
  const devInfo = await page.evaluate(`(() => {
    const d = new window.__Device();
    return 'device created, handler=' + d.handlerName;
  })()`);
  console.log('Device():', devInfo);
} catch (e) {
  console.log('Device() FAIL:', String(e).slice(0, 150));
}

await browser.close();
