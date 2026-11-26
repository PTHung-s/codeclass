/**
 * Test auth SFU: join không token / token sai → phải bị từ chối;
 * token HMAC hợp lệ (cùng secret với app server) → được chấp nhận.
 */
import { io } from 'socket.io-client';
import crypto from 'crypto';

const SFU_URL = process.env.SFU_URL || 'http://180.93.115.104:4443';
const SECRET = process.env.SFU_SHARED_SECRET || 'cb97fa7a80ac039676a4f62ba0c0bfed68321fc10e372c3df3d23e3b87e5a983';
const ROOM = `auth-${Date.now() % 100000}`;

const mint = (roomId, cid) => {
  const payload = { roomId, cid, name: 'tester', exp: Date.now() + 60000 };
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
  return `${b}.${sig}`;
};

const connect = () => new Promise((res, rej) => {
  const s = io(SFU_URL, { transports: ['websocket'] });
  s.on('connect', () => res(s));
  s.on('connect_error', rej);
  setTimeout(() => rej(new Error('timeout')), 10000);
});

const results = [];
async function tryJoin(label, token, expectOk) {
  const s = await connect();
  const r = await s.emitWithAck('mediasoup:join', { roomId: ROOM, peerName: 'tester', clientPeerId: 'X', token });
  const gotOk = !r.error;
  const pass = gotOk === expectOk;
  results.push([label, pass, `error=${r.error || 'none'} ok=${gotOk}`]);
  s.disconnect();
}

await tryJoin('join KHÔNG token → bị chặn', undefined, false);
await tryJoin('join token SAI → bị chặn', 'garbage.sig', false);
await tryJoin('join token ĐÚNG → được phép', mint(ROOM, 'X'), true);
await tryJoin('join token cho room KHÁC → bị chặn', mint('other-room', 'X'), false);

console.log('\n══════ KẾT QUẢ AUTH SFU ══════');
let pass = 0;
for (const [name, ok, detail] of results) { console.log(`${ok ? '✅' : '❌'} ${name}  [${detail}]`); if (ok) pass++; }
console.log(`\n${pass}/${results.length} đạt`);
process.exit(pass === results.length ? 0 : 1);
