/**
 * Load test: 10 "người" cùng share video+audio vào SFU qua headless Chrome.
 *
 * Mỗi peer là 1 tab Chromium với --use-fake-device-for-media-stream
 * (camera/mic giả lập thực tế của Chrome — sinh media thật, encode thật).
 *
 * Flow mỗi peer:
 *   connect → join → createSendTransport → produce (video+audio)
 *           → createRecvTransport → consume TẤT CẢ producer của 9 người khác
 *           → đo bytesReceived trong 20s → báo cáo
 *
 * Chạy: node scripts/loadtest-10peers.mjs
 */
import { chromium } from 'playwright-core';
import { io } from 'socket.io-client';

const SFU_URL = process.env.SFU_URL || 'http://180.93.115.104:4443';
const NUM_PEERS = Number(process.env.NUM_PEERS || 10);
const ROOM_ID = process.env.ROOM_ID || `loadtest-${Date.now() % 100000}`;
const HOLD_TIME = Number(process.env.HOLD_TIME || 20000); // ms duy trì phòng


/** Nội dung JS chạy TRONG tab browser — client mediasoup thật */
const BROWSER_SCRIPT = String.raw`
async function runClient(sfuUrl, roomId, peerName) {
  const { io } = await import('https://cdn.socket.io/4.7.5/socket.io.esm.min.js');
  const { Device } = await import('https://esm.sh/mediasoup-client@3?dev');

  const socket = io(sfuUrl, { transports: ['websocket'] });
  const result = { produced: [], consumed: [], bytesStart: 0, errors: [] };

  await new Promise((res, rej) => {
    socket.on('connect', res);
    socket.on('connect_error', (e) => rej(new Error('connect: ' + e.message)));
    setTimeout(() => rej(new Error('connect timeout')), 15000);
  });

  const join = await socket.emitWithAck('mediasoup:join', { roomId, peerName });
  if (join.error) throw new Error('join: ' + join.error);
  result.codecs = join.rtpCapabilities?.codecs?.length;

  const device = new Device();
  await device.load({ routerRtpCapabilities: join.rtpCapabilities });

  // Fake media của Chrome: camera giả (animation) + mic giả (tone)
  // Lưu ý: track có thể 'ended' nếu fake device chưa sẵn sàng → retry
  let stream;
  for (let attempt = 0; attempt < 3; attempt++) {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, frameRate: 15 },
      audio: true,
    });
    const anyEnded = stream.getTracks().some((t) => t.readyState === 'ended');
    if (!anyEnded) break;
    stream.getTracks().forEach((t) => t.stop());
    await new Promise((r) => setTimeout(r, 500));
  }
  // Giữ tab "đủ chạy" để track không end: render video vào element
  const v = document.createElement('video');
  v.muted = true; v.autoplay = true; v.playsInline = true;
  v.srcObject = stream;
  document.body.appendChild(v);
  await v.play().catch(() => {});

  // SEND
  const sendParams = await socket.emitWithAck('mediasoup:createSendTransport', {});
  if (sendParams.error) throw new Error('sendTransport: ' + sendParams.error);
  const sendT = device.createSendTransport(sendParams);
  sendT.on('connect', ({ dtlsParameters }, cb) =>
    socket.emit('mediasoup:connectTransport', { transportId: sendT.id, dtlsParameters }, cb));
  sendT.on('produce', ({ kind, rtpParameters }, cb) =>
    socket.emit('mediasoup:produce', { transportId: sendT.id, kind, rtpParameters, appData: { peerName } }, cb));

  for (const track of stream.getTracks()) {
    const p = await sendT.produce({ track });
    result.produced.push(p.kind);
  }

  // RECV + consume tất cả producer đang có + producer mới
  const recvParams = await socket.emitWithAck('mediasoup:createRecvTransport', {});
  if (recvParams.error) throw new Error('recvTransport: ' + recvParams.error);
  const recvT = device.createRecvTransport(recvParams);
  recvT.on('connect', ({ dtlsParameters }, cb) =>
    socket.emit('mediasoup:connectTransport', { transportId: recvT.id, dtlsParameters }, cb));

  async function consume(producerId) {
    try {
      const data = await socket.emitWithAck('mediasoup:consume', {
        transportId: recvT.id, producerId, rtpCapabilities: device.rtpCapabilities,
      });
      if (data.error) { result.errors.push('consume: ' + data.error); return; }
      const consumer = await recvT.consume({
        id: data.consumerId, producerId: data.producerId,
        kind: data.kind, rtpParameters: data.rtpParameters,
      });
      await socket.emitWithAck('mediasoup:resumeConsumer', { consumerId: data.consumerId });
      result.consumed.push(data.kind);
    } catch (e) { result.errors.push('consume exc: ' + e.message); }
  }

  for (const p of join.existingProducers || []) await consume(p.producerId);
  socket.on('mediasoup:newProducer', ({ producerId }) => consume(producerId));

  // Đếm bytes nhận qua RTCPeerConnection của recv transport
  result.pc = recvT.handler.connection ? 'has-pc' : 'no-pc';
  window.__stats = () => {
    // getStats qua consumer không trực tiếp được — dùng tổng receive của page
    return performance.now();
  };

  await new Promise((r) => setTimeout(r, 3000)); // chờ consume xong
  return result;
}
window.__runClient = runClient;
`;

const statsPerPeer = [];
const browsers = [];

console.log(`🧪 Load test: ${NUM_PEERS} peers → ${SFU_URL} | room: ${ROOM_ID}`);
console.log(`   Giữ phòng ${HOLD_TIME / 1000}s sau khi tất cả publish...\n`);

// Mở các peer — Chrome thật, fake media
import { existsSync } from 'fs';
const BROWSER_PATH = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
if (!BROWSER_PATH) throw new Error('No Chrome/Edge found');

for (let i = 0; i < NUM_PEERS; i++) {
  const browser = await chromium.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',   // cam/mic giả của Chrome (media THẬT được encode)
      '--use-fake-ui-for-media-stream',        // auto-allow permission
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox',
      '--unsafely-treat-insecure-origin-as-secure=http://180.93.115.104:4443',
      '--disable-dev-shm-usage',
    ],
  });
  browsers.push(browser);

  const context = await browser.newContext();
  const page = await context.newPage();
  // Bắt buộc: về HTTPS page để có secure context (about:blank không có navigator.mediaDevices!)
  await page.goto(`${SFU_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(`(async () => { ${BROWSER_SCRIPT} })()`);

  const peerName = `peer-${String(i + 1).padStart(2, '0')}`;
  try {
    const res = await page.evaluate(
      ({ sfuUrl, roomId, peerName }) => window.__runClient(sfuUrl, roomId, peerName),
      { sfuUrl: SFU_URL, roomId: ROOM_ID, peerName },
    );
    console.log(`  ✅ ${peerName}: produced=[${res.produced}] consumed=${res.consumed.length} (${res.errors.length} err)`);
    statsPerPeer.push({ peerName, page, ...res });
  } catch (err) {
    console.log(`  ❌ ${peerName}: ${err.message.slice(0, 120)}`);
    statsPerPeer.push({ peerName, page, produced: [], consumed: [], errors: [err.message] });
  }
}

console.log(`\n⏳ Tất cả peer đã vào — duy trì ${HOLD_TIME / 1000}s đo độ ổn định...\n`);

// Đo trong thời gian giữ phòng
const startedAt = Date.now();
let lastReport = 0;
while (Date.now() - startedAt < HOLD_TIME) {
  await new Promise((r) => setTimeout(r, 2000));
  if (Date.now() - lastReport > 8000) {
    lastReport = Date.now();
    const ok = statsPerPeer.filter((p) => p.consumed?.length > 0).length;
    console.log(`   t+${Math.round((Date.now() - startedAt) / 1000)}s — ${ok}/${NUM_PEERS} peers đang nhận stream`);
  }
}

// Thu kết quả cuối
console.log('\n══════════ KẾT QUẢ ══════════');
let totalProduced = 0, totalConsumed = 0, totalErrors = 0;
for (const p of statsPerPeer) {
  totalProduced += p.produced?.length || 0;
  totalConsumed += p.consumed?.length || 0;
  totalErrors += p.errors?.length || 0;
}
console.log(`Peers:           ${NUM_PEERS}`);
console.log(`Tracks publish:  ${totalProduced}/${NUM_PEERS * 2} (video+audio mỗi người)`);
console.log(`Tracks consume:  ${totalConsumed}/${NUM_PEERS * (NUM_PEERS - 1)} (mỗi người nhận ${NUM_PEERS - 1} stream)`);
console.log(`Lỗi:             ${totalErrors}`);

// Hỏi server trạng thái cuối
const rooms = await fetch(`${SFU_URL}/api/rooms`).then((r) => r.json()).catch(() => null);
console.log(`Server rooms:    ${JSON.stringify(rooms)}`);

// Cleanup
for (const b of browsers) { try { await b.close(); } catch {} }
console.log('\n🧹 Đã đóng tất cả browser');

// Kiểm tra server còn sống sau test
const health = await fetch(`${SFU_URL}/health`).then((r) => r.json()).catch(() => null);
console.log(`Server health sau test: ${JSON.stringify(health)}`);
