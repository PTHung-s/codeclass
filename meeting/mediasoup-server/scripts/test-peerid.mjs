/**
 * Test E2E QUA PROXY HTTPS (codeclass.vnotemate.com/sfu) — chứng minh:
 *  - signaling wss same-origin hoạt động (hết mixed content)
 *  - token auth SFU chấp nhận join hợp lệ
 *  - clientPeerId + type round-trip
 *  - 2 peer produce/consume video thật (fake media Chrome)
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'fs';
import crypto from 'crypto';

const SFU_URL = process.env.SFU_URL || 'https://codeclass.vnotemate.com/sfu';
const SECRET = process.env.SFU_SHARED_SECRET || 'cb97fa7a80ac039676a4f62ba0c0bfed68321fc10e372c3df3d23e3b87e5a983';
const ROOM = `e2e-${Date.now() % 100000}`;

const mint = (roomId, cid, name) => {
  const payload = { roomId, cid, name, exp: Date.now() + 60000 };
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
  return `${b}.${sig}`;
};

const BROWSER_SCRIPT = String.raw`
function resolve(base){ try { const u=new URL(base); const p=u.pathname.replace(/\/$/,''); if(p) return {origin:u.origin, path:p+'/socket.io'}; } catch(e){} return {origin:base, path:'/socket.io'}; }
async function peerA(sfuUrl, roomId, token) {
  const { io } = await import('https://cdn.socket.io/4.7.5/socket.io.esm.min.js');
  const { Device } = await import('https://esm.sh/mediasoup-client@3?dev');
  const { origin, path } = resolve(sfuUrl);
  const socket = io(origin, { transports: ['websocket'], path });
  await new Promise((res, rej) => { socket.on('connect', res); socket.on('connect_error', (e)=>rej(new Error('conn:'+e.message))); setTimeout(()=>rej(new Error('timeout')),15000); });
  const join = await socket.emitWithAck('mediasoup:join', { roomId, peerName: 'Alice', clientPeerId: 'SIG-A', token });
  if (join.error) throw new Error('join: ' + join.error);
  const device = new Device(); await device.load({ routerRtpCapabilities: join.rtpCapabilities });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
  const v = document.createElement('video'); v.muted = true; v.autoplay = true; v.srcObject = stream; document.body.appendChild(v); await v.play().catch(()=>{});
  const sp = await socket.emitWithAck('mediasoup:createSendTransport', {});
  const sendT = device.createSendTransport(sp);
  sendT.on('connect', ({ dtlsParameters }, cb) => socket.emit('mediasoup:connectTransport', { transportId: sendT.id, dtlsParameters }, cb));
  sendT.on('produce', ({ kind, rtpParameters, appData }, cb) => socket.emit('mediasoup:produce', { transportId: sendT.id, kind, rtpParameters, appData }, cb));
  for (const track of stream.getTracks()) await sendT.produce({ track, appData: { peerName: 'Alice', type: 'camera' } });
  window.__keepA = socket;
  return { ok: true, produced: stream.getTracks().length };
}

async function peerB(sfuUrl, roomId, token) {
  const { io } = await import('https://cdn.socket.io/4.7.5/socket.io.esm.min.js');
  const { Device } = await import('https://esm.sh/mediasoup-client@3?dev');
  const { origin, path } = resolve(sfuUrl);
  const socket = io(origin, { transports: ['websocket'], path });
  await new Promise((res, rej) => { socket.on('connect', res); socket.on('connect_error', (e)=>rej(new Error('conn:'+e.message))); setTimeout(()=>rej(new Error('timeout')),15000); });
  const join = await socket.emitWithAck('mediasoup:join', { roomId, peerName: 'Bob', clientPeerId: 'SIG-B', token });
  if (join.error) throw new Error('join: ' + join.error);
  const device = new Device(); await device.load({ routerRtpCapabilities: join.rtpCapabilities });
  const out = { existing: join.existingProducers, consumeMeta: null, gotVideoTrack: false, trackState: '' };
  const rp = await socket.emitWithAck('mediasoup:createRecvTransport', {});
  const recvT = device.createRecvTransport(rp);
  recvT.on('connect', ({ dtlsParameters }, cb) => socket.emit('mediasoup:connectTransport', { transportId: recvT.id, dtlsParameters }, cb));
  const videoProd = (join.existingProducers || []).find((p) => p.kind === 'video');
  if (videoProd) {
    const data = await socket.emitWithAck('mediasoup:consume', { transportId: recvT.id, producerId: videoProd.producerId, rtpCapabilities: device.rtpCapabilities });
    out.consumeMeta = { producerClientPeerId: data.producerClientPeerId, producerType: data.producerType, error: data.error };
    const consumer = await recvT.consume({ id: data.consumerId, producerId: data.producerId, kind: data.kind, rtpParameters: data.rtpParameters });
    await socket.emitWithAck('mediasoup:resumeConsumer', { consumerId: data.consumerId });
    out.gotVideoTrack = consumer.track.kind === 'video';
    await new Promise((r) => setTimeout(r, 2500)); // chờ stream live
    out.trackState = consumer.track.readyState;
  }
  window.__keepB = socket;
  return out;
}
window.__peerA = peerA; window.__peerB = peerB;
`;

const BROWSER_PATH = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));
if (!BROWSER_PATH) throw new Error('No Chrome/Edge');

const args = ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--no-sandbox','--unsafely-treat-insecure-origin-as-secure=' + SFU_URL,'--disable-dev-shm-usage'];

const bA = await chromium.launch({ executablePath: BROWSER_PATH, headless: true, args });
const bB = await chromium.launch({ executablePath: BROWSER_PATH, headless: true, args });
const pA = await (await bA.newContext()).newPage();
const pB = await (await bB.newContext()).newPage();
await pA.goto(SFU_URL + '/', { waitUntil: 'domcontentloaded' });
await pB.goto(SFU_URL + '/', { waitUntil: 'domcontentloaded' });
await pA.evaluate(`(async()=>{${BROWSER_SCRIPT}})()`);
await pB.evaluate(`(async()=>{${BROWSER_SCRIPT}})()`);

const a = await pA.evaluate(({ u, r, t }) => window.__peerA(u, r, t), { u: SFU_URL, r: ROOM, t: mint(ROOM, 'SIG-A', 'Alice') });
await new Promise((r) => setTimeout(r, 1500));
const b = await pB.evaluate(({ u, r, t }) => window.__peerB(u, r, t), { u: SFU_URL, r: ROOM, t: mint(ROOM, 'SIG-B', 'Bob') });

console.log('Peer A:', JSON.stringify(a));
console.log('Peer B existingProducers:', JSON.stringify(b.existing));
console.log('Peer B consumeMeta:', JSON.stringify(b.consumeMeta), 'track:', b.gotVideoTrack, b.trackState);

const cam = (b.existing || []).find((p) => p.kind === 'video');
const checks = [
  ['A produce 2 track (cam+mic)', a.produced === 2],
  ['existing có video producer', !!cam],
  ['existing.clientPeerId === SIG-A', cam?.clientPeerId === 'SIG-A'],
  ['existing.type === camera', cam?.type === 'camera'],
  ['consume.producerClientPeerId === SIG-A', b.consumeMeta?.producerClientPeerId === 'SIG-A'],
  ['consume.producerType === camera', b.consumeMeta?.producerType === 'camera'],
  ['B nhận được video track', b.gotVideoTrack === true],
  ['video track LIVE (media chảy qua proxy+UDP)', b.trackState === 'live'],
];
console.log('\n══════ KẾT QUẢ ══════');
let pass = 0;
for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (ok) pass++; }
console.log(`\n${pass}/${checks.length} đạt`);

await bA.close(); await bB.close();
process.exit(pass === checks.length ? 0 : 1);
