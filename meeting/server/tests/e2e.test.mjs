import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { inflateRawSync } from 'node:zlib';

const req = createRequire(new URL('../../client/package.json', import.meta.url));
const { io } = req('socket.io-client');

const PORT = 5099;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'codeclass-meet-test-'));
const ROOMS_FILE = path.join(TMP_DIR, 'rooms.json');
const SERVER_DIR = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const EXPIRED_ROOM_ID = 'expired_room_31d';
const EXPIRED_UPLOADS_DIR = path.join(SERVER_DIR, 'data', 'uploads', EXPIRED_ROOM_ID);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${url}/api/rooms`);
      if (r.ok) return;
    } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error('Server did not start in time');
}

function connectClient() {
  return new Promise((resolve, reject) => {
    const s = io(BASE_URL, { transports: ['websocket'], forceNew: true });
    const t = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
    s.on('connect', () => { clearTimeout(t); resolve(s); });
    s.on('connect_error', (e) => { clearTimeout(t); reject(e); });
  });
}

function emitAck(sock, event, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Ack timeout for ${event}`)), timeoutMs);
    sock.emit(event, payload, (res) => { clearTimeout(t); resolve(res); });
  });
}

function waitEvent(sock, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Event timeout for ${event}`)), timeoutMs);
    sock.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
}

function parseZip(buf) {
  const files = {};
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const compLen = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.subarray(off + 30, off + 30 + nameLen).toString('utf8');
    const dataStart = off + 30 + nameLen + extraLen;
    const raw = inflateRawSync(buf.subarray(dataStart, dataStart + compLen));
    files[name] = raw.toString('utf8');
    off = dataStart + compLen;
  }
  return files;
}

async function runTests() {
  // Pre-seed Suite 16: expired room >30 days + upload dir on disk
  fs.mkdirSync(EXPIRED_UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(EXPIRED_UPLOADS_DIR, 'stale.png'), 'stale');
  fs.writeFileSync(
    ROOMS_FILE,
    JSON.stringify({
      [EXPIRED_ROOM_ID]: {
        id: EXPIRED_ROOM_ID,
        name: 'Expired Room',
        password: '',
        hostId: '',
        hostName: 'OldHost',
        participants: { $M: [] },
        createdAt: Date.now() - 31 * 864e5,
        messages: [],
        forcePin: false,
        assignments: [],
      },
    }),
  );

  const serverProc = spawn('node', ['dist/index.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      ROOMS_FILE,
      ALLOWED_ORIGINS: `${BASE_URL},http://localhost:${PORT}`,
      AI_API_KEY: '',
      AI_BASE_URL: '',
      GOOGLE_AI_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  serverProc.stdout.on('data', (d) => { logs += d.toString(); });
  serverProc.stderr.on('data', (d) => { logs += d.toString(); });

  try {
    await waitForServer(BASE_URL);
    console.log('✅ Server booted on port', PORT);

    // 16. Verify expired room (>30d) & its uploads directory were cleaned on startup
    assert.equal(fs.existsSync(EXPIRED_UPLOADS_DIR), false, 'Expired 30d room uploads folder must be removed on boot');

    // 1. Room creation + hostSecret
    const createRes = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Classroom', password: '', hostName: 'ThayGiao' }),
    });
    assert.equal(createRes.status, 200);
    const { id: roomId, hostSecret } = await createRes.json();
    assert.ok(roomId && hostSecret && hostSecret.length >= 32, 'Expected roomId and hostSecret');

    // Public list must NOT expose hostSecret or expired room
    const listRes = await (await fetch(`${BASE_URL}/api/rooms`)).json();
    assert.equal(listRes.rooms.find((r) => r.id === EXPIRED_ROOM_ID), undefined);
    assert.equal(listRes.rooms.find((r) => r.id === roomId).hostSecret, undefined);

    // 13. AI Quiz Host Auth checks
    for (const ep of ['/api/ai/generate-quiz', '/api/ai/adaptive-recommend', '/api/ai/adaptive-generate']) {
      const noAuth = await fetch(`${BASE_URL}${ep}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, topic: 'Python' }),
      });
      assert.equal(noAuth.status, 403, `${ep} without auth must return 403`);

      const wrongSecret = await fetch(`${BASE_URL}${ep}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostSecret: 'wrong-secret', topic: 'Python' }),
      });
      assert.equal(wrongSecret.status, 403, `${ep} with wrong hostSecret must return 403`);

      const validSecret = await fetch(`${BASE_URL}${ep}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostSecret, topic: 'Python', count: 1 }),
      });
      assert.notEqual(validSecret.status, 403, `${ep} with valid hostSecret must pass auth check`);
    }

    // 15. Trust Proxy rate-limit bucket isolation via X-Forwarded-For
    let hit429 = false;
    for (let i = 0; i < 27; i++) {
      const r = await fetch(`${BASE_URL}/api/ai/generate-quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.10' },
        body: JSON.stringify({ roomId }),
      });
      if (r.status === 429) { hit429 = true; break; }
    }
    assert.equal(hit429, true, 'Forwarded IP A should hit AI rate limit after 25 requests');
    const otherIp = await fetch(`${BASE_URL}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.11' },
      body: JSON.stringify({ roomId }),
    });
    assert.equal(otherIp.status, 403, 'Distinct X-Forwarded-For IP must NOT share rate limit bucket');

    const host = await connectClient();
    const s1 = await connectClient();
    const s2 = await connectClient();
    const outsider = await connectClient();
    let s2New = null;
    let s1Fresh = null;
    let host2 = null;
    try {
      // 2. Host joins with hostSecret -> gets host=true
      const hJoin = await emitAck(host, 'room:join', {
        roomId, name: 'ThayGiao', password: '', hostSecret,
      });
      assert.equal(hJoin.ok, true);
      assert.equal(hJoin.host, true);
      assert.ok(hJoin.sessionToken);

      // Anonymous impostor typing hostName WITHOUT hostSecret -> NOT host
      const impostorJoin = await emitAck(s1, 'room:join', {
        roomId, name: 'ThayGiao', password: '',
      });
      assert.equal(impostorJoin.ok, true);
      assert.equal(impostorJoin.host, false, 'Anonymous user typing hostName must NOT get host!');
      const s1Token = impostorJoin.sessionToken;

      // 14. Raise Hand + state whitelist (cannot spoof role or points via peer:update-state)
      const hostSawState = waitEvent(host, 'peer:update-state');
      s1.emit('peer:update-state', {
        roomId,
        state: { isHandRaised: true, role: 'teacher', points: 9999 },
      });
      const stateEvt = await hostSawState;
      assert.equal(stateEvt.socketId, s1.id);
      assert.equal(stateEvt.state.isHandRaised, true);
      assert.equal(stateEvt.state.role, undefined, 'peer:update-state must drop non-whitelisted role');
      assert.equal(stateEvt.state.points, undefined, 'peer:update-state must drop non-whitelisted points');

      // 3. s2 joins -> verify peer:joined does NOT leak sensitive fields to s1, and includes isHandRaised
      const s1PeerJoinedPromise = new Promise((res) => s1.once('peer:joined', res));
      const hostPeerJoinedPromise = new Promise((res) => host.once('peer:joined', res));

      const s2Join = await emitAck(s2, 'room:join', { roomId, name: 'HocSinhB', password: '' });
      assert.equal(s2Join.ok, true);
      const s2Token = s2Join.sessionToken;
      const s1SnapshotInS2 = s2Join.peers.find((p) => p.socketId === s1.id);
      assert.equal(s1SnapshotInS2?.isHandRaised, true, 'room:join snapshot must include isHandRaised');
      assert.equal(s1SnapshotInS2?.role, null, 'spoofed role must not stick');
      assert.equal(s1SnapshotInS2?.points, 0, 'spoofed points must not stick');

      const s1SawS2 = await s1PeerJoinedPromise;
      const hostSawS2 = await hostPeerJoinedPromise;
      assert.equal(s1SawS2.code, undefined, 'peer:joined to student must NOT leak code');
      assert.equal(s1SawS2.violationHistory, undefined, 'peer:joined to student must NOT leak violationHistory');
      assert.equal(s1SawS2.sessionToken, undefined, 'peer:joined must NOT leak sessionToken');
      assert.ok('violations' in hostSawS2, 'Host receives host peer details');

      // 4. Reconnect session hijacking prevention + code saving + no host overwrite
      host.emit('code:sync', { roomId, code: 'print("HOST CODE")', language: { name: 'python', version: '3.10.0' } });
      s1.emit('code:sync', { roomId, code: 'print("STUDENT 1 CODE")', language: { name: 'python', version: '3.10.0' } });
      s2.emit('code:sync', { roomId, code: '#include <iostream>\nint main(){return 0;}', language: { name: 'cpp', version: '10.2.0' } });
      await sleep(100);

      const hCodeRespPromise = waitEvent(host, 'code:response');
      host.emit('code:request', { roomId, targetSocketId: host.id });
      const hCheckOwn = await hCodeRespPromise;
      assert.equal(hCheckOwn.code, 'print("HOST CODE")', 'Student code:sync must NEVER overwrite Host code!');

      let s2GotTampered = false;
      s2.once('code:sync', () => { s2GotTampered = true; });
      s1.emit('code:sync', { roomId, targetSocketId: s2.id, code: 'HACKED' });
      let s1GotCodeResponse = false;
      s1.once('code:response', () => { s1GotCodeResponse = true; });
      s1.emit('code:request', { roomId, targetSocketId: s2.id });
      await sleep(100);
      assert.equal(s2GotTampered, false, 'Student must NOT targeted code:sync another peer');
      assert.equal(s1GotCodeResponse, false, 'Student must NOT receive code:response');

      let s2GotDelta = false;
      s2.once('code:delta', () => { s2GotDelta = true; });
      const hostGotDeltaPromise = new Promise((res) => host.once('code:delta', res));
      s1.emit('code:delta', {
        roomId,
        changes: [{ rangeOffset: 22, rangeLength: 0, text: '\nprint(123)' }],
        language: { name: 'python', version: '3.10.0' },
      });
      const hostDelta = await hostGotDeltaPromise;
      assert.equal(hostDelta.socketId, s1.id);
      await sleep(80);
      assert.equal(s2GotDelta, false, 'Student code:delta must NOT broadcast to other students');

      const hijackerJoin = await emitAck(outsider, 'room:join', { roomId, name: 'HocSinhB' });
      assert.equal(hijackerJoin.ok, true);
      assert.equal(hijackerJoin.ownState.code, '', 'Different sessionToken typing same name must NOT steal s2 code!');
      outsider.emit('room:leave', { roomId });
      await sleep(60);

      const s2Rejoin = await emitAck(s2, 'room:join', { roomId, name: 'HocSinhB', sessionToken: s2Token });
      assert.ok(s2Rejoin.ownState.code.includes('iostream'), 'Matching sessionToken must restore own code');

      // 5. Chat spoofing & outsider blocking & pin-sync auth
      let outsiderGotChat = false;
      outsider.once('chat:history', () => { outsiderGotChat = true; });
      outsider.emit('chat:history', { roomId });
      let gotSpoofedPin = false;
      host.once('room:pin-sync', () => { gotSpoofedPin = true; });
      s1.emit('room:pin-sync', { roomId, action: 'pin', participantIdentity: s1.id, source: 1 });

      const chatPromise = new Promise((res) => host.once('chat:message', res));
      s1.emit('chat:send', { roomId, message: { senderId: host.id, senderName: 'FAKE HOST', broadcast: true, text: 'Hello' } });
      const chatMsg = await chatPromise;
      assert.equal(chatMsg.senderId, s1.id);
      assert.equal(chatMsg.senderName, 'ThayGiao');
      assert.equal(chatMsg.broadcast, undefined, 'Client cannot spoof broadcast flag');
      await sleep(80);
      assert.equal(outsiderGotChat, false, 'Outsider must NOT read chat:history');
      assert.equal(gotSpoofedPin, false, 'Non-host must NOT trigger room:pin-sync');

      // 6. Normal Quiz: sanitized answers, server grading, duplicate block, fair LP
      const studentQuizPromise = new Promise((res) => s1.once('quiz:started', res));
      host.emit('quiz:start', {
        roomId,
        quiz: {
          id: 'q1',
          title: 'Quiz Test',
          questions: [
            { id: 'qq1', question: '1+1=?', options: ['1', '2', '3', '4'], correctAnswer: 1, explanation: 'Because 1+1=2' },
            { id: 'qq2', question: '2+2=?', options: ['3', '4', '5', '6'], correctAnswer: 1, explanation: '4' },
          ],
        },
      });
      const { quiz: stuQuiz } = await studentQuizPromise;
      assert.equal(stuQuiz.questions[0].correctAnswer, undefined, 'Quiz must strip correctAnswer for students');
      assert.equal(stuQuiz.questions[0].explanation, undefined, 'Quiz must strip explanation for students');

      const sub1 = await emitAck(s1, 'quiz:submit', {
        roomId,
        answers: [
          { questionId: 'qq1', selectedOption: 1 },
          { questionId: 'qq2', selectedOption: 1 },
        ],
      });
      assert.equal(sub1.ok, true);
      assert.equal(sub1.response.score, 2);
      assert.equal(sub1.rank, 1);
      assert.equal(sub1.review[0].correctAnswer, 1);

      const dupSub = await emitAck(s1, 'quiz:submit', {
        roomId,
        answers: [{ questionId: 'qq1', selectedOption: 0 }],
      });
      assert.ok(dupSub.error, 'Duplicate quiz submit must be blocked');

      const sub2 = await emitAck(s2, 'quiz:submit', {
        roomId,
        answers: [
          { questionId: 'qq1', selectedOption: 1 },
          { questionId: 'qq2', selectedOption: 0 },
        ],
      });
      assert.equal(sub2.ok, true);
      assert.equal(sub2.response.score, 1);
      assert.equal(sub2.rank, 2);

      const pointsAfterQuizPromise = new Promise((res) => host.once('peer:update-points', res));
      host.emit('quiz:end', { roomId });
      const { points } = await pointsAfterQuizPromise;
      const p1 = points.find((x) => x.socketId === s1.id).points;
      const p2 = points.find((x) => x.socketId === s2.id).points;
      assert.equal(p1, 3, 'Top 1 in 2-student quiz should get +3 LP');
      assert.equal(p2, 2, 'Top 2 in 2-student quiz must get +2 LP (NOT -1!)');

      // 7. Adaptive Quiz: strip answers, duplicate ignore, auto-finish on disconnect
      const adaptStartRes = await emitAck(host, 'adaptive:start', { roomId, title: 'Adaptive Test' });
      assert.equal(adaptStartRes.ok, true);
      const s1AdaptQPromise = new Promise((res) => s1.once('adaptive:question', res));
      host.emit('adaptive:push-question', {
        roomId,
        question: { id: 'aq1', question: '3*3=?', options: ['6', '9', '12', '3'], correctAnswer: 1, explanation: '3x3=9' },
      });
      const { question: stuAQ } = await s1AdaptQPromise;
      assert.equal(stuAQ.correctAnswer, undefined, 'Adaptive question must strip correctAnswer for students');

      const s1ConfirmPromise = new Promise((res) => s1.once('adaptive:answer-confirmed', res));
      s1.emit('adaptive:answer', { roomId, selectedOption: 1 });
      const confirm1 = await s1ConfirmPromise;
      assert.equal(confirm1.isCorrect, true);
      assert.equal(confirm1.correctAnswer, 1);

      s1.emit('adaptive:answer', { roomId, selectedOption: 1 });
      const qStatsPromise = new Promise((res) => host.once('adaptive:question-stats', res));
      s2.disconnect();
      const { scores: adaptScores } = await qStatsPromise;
      const s1AdaptScore = adaptScores.find((x) => x.socketId === s1.id)?.score;
      assert.equal(s1AdaptScore, 1, 'Duplicate adaptive answer must be ignored; disconnect finalizes question');

      const adaptEndRes = await emitAck(host, 'adaptive:end', { roomId });
      assert.equal(adaptEndRes.ok, true);

      s2New = await connectClient();
      await emitAck(s2New, 'room:join', { roomId, name: 'HocSinhB', sessionToken: s2Token });

      // 8. SaveCode + code:ranSaved + code:exportZip
      const savePy = await emitAck(s1, 'code:save', {
        roomId,
        title: 'Bai Python',
        code: 'print("hello")',
        language: { name: 'python', version: '3.10.0' },
      });
      assert.equal(savePy.ok, true);
      s1.emit('code:ranSaved', { roomId, id: savePy.id });

      const saveCpp = await emitAck(s2New, 'code:save', {
        roomId,
        title: 'Bai Cpp',
        code: 'int main() { return 0; }',
        language: { name: 'cpp', version: '10.2.0' },
      });
      assert.equal(saveCpp.ok, true);
      await sleep(80);

      const zipRes = await emitAck(host, 'code:exportZip', { roomId });
      assert.equal(zipRes.ok, true);
      const zipBuf = Buffer.from(zipRes.base64, 'base64');
      assert.equal(zipBuf.subarray(0, 2).toString('utf8'), 'PK');
      const zipFiles = parseZip(zipBuf);
      const allNames = Object.keys(zipFiles);
      const allContents = Object.values(zipFiles).join('\n');
      assert.equal(allContents.includes('HOST CODE'), false, 'Export ZIP must exclude anonymous Host!');
      const pyEntry = allNames.find((n) => n.endsWith('.py') && n.includes('Bai Python'));
      const cppEntry = allNames.find((n) => n.endsWith('.cpp') && n.includes('Bai Cpp'));
      assert.ok(pyEntry, 'Expected Python saved file in ZIP');
      assert.ok(cppEntry, 'Expected C++ saved file in ZIP');
      assert.ok(zipFiles[pyEntry].startsWith('# '), 'Python export should use # comment prefix');
      assert.ok(zipFiles[cppEntry].startsWith('// '), 'C++ export should use // comment prefix');
      assert.ok(zipFiles['BANG-DIEM.csv'].includes('"1"'), 'BANG-DIEM.csv should reflect runCount=1 from code:ranSaved');

      // 9. Music Pause/Resume elapsed preservation
      const playPromise = new Promise((res) => host.once('music:sync', res));
      host.emit('music:toggle', { roomId, isPlaying: true });
      const m1 = await playPromise;
      if (m1.currentTrack) {
        await sleep(1100);
        const pausePromise = new Promise((res) => host.once('music:sync', res));
        host.emit('music:toggle', { roomId, isPlaying: false });
        const mPaused = await pausePromise;
        assert.ok(mPaused.pausedAt > mPaused.startTime);
        const pausedElapsed = mPaused.pausedAt - mPaused.startTime;

        await sleep(500);
        const resumePromise = new Promise((res) => host.once('music:sync', res));
        host.emit('music:toggle', { roomId, isPlaying: true });
        const mResumed = await resumePromise;
        const resumedElapsed = Date.now() - mResumed.startTime;
        assert.ok(
          Math.abs(resumedElapsed - pausedElapsed) < 400,
          `Pause/Resume should preserve offset (~${pausedElapsed}ms), got ${resumedElapsed}ms`,
        );
      }

      // 10. Assignments disk upload + assignment:page + delete cleanup
      const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const addAsgnRes = await emitAck(host, 'assignment:add', {
        roomId,
        assignment: { id: 'a1', name: 'test.png', type: 'image', data: tinyPng },
      });
      assert.equal(addAsgnRes.ok, true);
      assert.ok(addAsgnRes.assignment.data.startsWith('/uploads/'), 'Assignment must be stored on disk under /uploads/');
      const fetchUpload = await fetch(`${BASE_URL}${addAsgnRes.assignment.data}`);
      assert.equal(fetchUpload.status, 200);

      const pagePromise = new Promise((res) => s1.once('assignment:page', res));
      host.emit('assignment:page', { roomId, index: 0 });
      const pageEvt = await pagePromise;
      assert.equal(pageEvt.index, 0);

      host.emit('assignment:delete', { roomId, assignmentId: 'a1' });
      await sleep(100);
      const fetchDeleted = await fetch(`${BASE_URL}${addAsgnRes.assignment.data}`);
      assert.equal(fetchDeleted.status, 404, 'Deleted assignment file must be removed from disk');

      // 11. exam:getState + room:leave cleanup
      const examStartRes = await emitAck(host, 'exam:setMonitoring', { roomId, active: true });
      assert.equal(examStartRes.ok, true);
      const examPinRes = await emitAck(host, 'exam:pinScreen', { roomId, targetSocketId: s1.id });
      assert.equal(examPinRes.ok, true);
      const examCheck = await emitAck(s2New, 'exam:getState', { roomId });
      assert.equal(examCheck.ok, true);
      assert.equal(examCheck.exam.pinnedScreenId, s1.id);

      const examStateAfterLeave = new Promise((res) => s2New.once('exam:state', res));
      s1.emit('room:leave', { roomId });
      const updatedExam = await examStateAfterLeave;
      assert.equal(updatedExam.pinnedScreenId, null, 'room:leave must clear pinnedScreenId');

      // 12. DELETE /api/ai/history + non-host delete block + host delete cleanup
      const delAiRes = await fetch(`${BASE_URL}/api/ai/history`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, sessionToken: s1Token }),
      });
      assert.equal(delAiRes.status, 200);

      // 17. Audio Routing (default 'all', 'selected' + hostFocus, saved groups, reconnect remap, remote mute)
      const s1Re = await emitAck(s1, 'room:join', {
        roomId, name: 'An', password: '', sessionToken: s1Token,
      });
      assert.equal(s1Re.ok, true);
      assert.equal(s1Re.audioMode, 'all', 'Default audioMode must be all');

      const denyAudio = await emitAck(s1, 'audio:setAllowed', { roomId, mode: 'selected', allowed: [] });
      assert.ok(denyAudio.error, 'Non-host cannot change audio routing');
      const denyMute = await emitAck(s1, 'audio:mutePeer', { roomId, targetSocketId: s2New.id });
      assert.ok(denyMute.error, 'Non-host cannot mute peer');

      const saveGrpBroadcast = waitEvent(s1, 'audio:allowed');
      const saveGrpRes = await emitAck(host, 'audio:saveGroups', {
        roomId,
        groups: [{ id: 'grp_1', name: 'Nhom A', memberIds: [s1.id] }],
      });
      assert.equal(saveGrpRes.ok, true);
      assert.equal(saveGrpRes.groups[0].memberIds[0], s1.id);
      await saveGrpBroadcast;

      const audioAllowedEvt = waitEvent(s1, 'audio:allowed');
      const setAudioRes = await emitAck(host, 'audio:setAllowed', {
        roomId,
        mode: 'selected',
        allowed: [s1.id],
        hostFocus: true,
      });
      assert.equal(setAudioRes.ok, true);
      const aEvt = await audioAllowedEvt;
      assert.equal(aEvt.mode, 'selected');
      assert.equal(aEvt.hostFocus, true);
      assert.deepEqual(aEvt.allowed, [s1.id]);

      // Reconnect s1 -> hearHost & audioGroups must remap to new socketId
      s1Fresh = await connectClient();
      s1.disconnect();
      await sleep(80);
      const s1FreshJoin = await emitAck(s1Fresh, 'room:join', {
        roomId, name: 'An', password: '', sessionToken: s1Token,
      });
      assert.equal(s1FreshJoin.ok, true);
      assert.ok(s1FreshJoin.hearHost.includes(s1Fresh.id), 'hearHost must remap on reconnect');
      assert.ok(s1FreshJoin.audioGroups[0].memberIds.includes(s1Fresh.id), 'audioGroups must remap on reconnect');

      const forceMuteP1 = waitEvent(s1Fresh, 'audio:forceMute');
      const mutePeerRes = await emitAck(host, 'audio:mutePeer', { roomId, targetSocketId: s1Fresh.id });
      assert.equal(mutePeerRes.ok, true);
      await forceMuteP1;

      const forceMuteP2 = waitEvent(s2New, 'audio:forceMute');
      const muteAllRes = await emitAck(host, 'audio:muteAll', { roomId });
      assert.equal(muteAllRes.ok, true);
      await forceMuteP2;

      await emitAck(host, 'audio:setAllowed', { roomId, mode: 'all', allowed: [], hostFocus: false });

      // 18. Breakout Assignments Inheritance/Live-Sync & Canonical Code Save + Export Zip
      const brkAsgnRes = await emitAck(host, 'assignment:add', {
        roomId,
        assignment: { id: 'a_brk', name: 'main.png', type: 'image', data: tinyPng },
      });
      assert.equal(brkAsgnRes.ok, true);
      const mainUploadUrl = brkAsgnRes.assignment.data;

      const brk1Create = await emitAck(host, 'breakout:create', {
        roomId,
        count: 1,
        mode: 'manual',
        names: ['Nhom Code'],
      });
      assert.equal(brk1Create.ok, true);
      const brk1Id = brk1Create.rooms[0].id;

      const moveToBrk = waitEvent(s1Fresh, 'breakout:move');
      await emitAck(host, 'breakout:assign', { roomId, socketId: s1Fresh.id, targetId: brk1Id });
      const mv1 = await moveToBrk;
      assert.equal(mv1.roomId, brk1Id);

      const s1BrkJoin = await emitAck(s1Fresh, 'room:join', {
        roomId: brk1Id, name: 'An', password: '', sessionToken: s1Token,
      });
      assert.equal(s1BrkJoin.ok, true);
      assert.ok(s1BrkJoin.assignments.some((a) => a.id === 'a_brk'), 'Breakout must inherit assignments from main room');

      const liveSyncAsgn = waitEvent(s1Fresh, 'assignment:add');
      const liveAsgnRes = await emitAck(host, 'assignment:add', {
        roomId,
        assignment: { id: 'a_live', name: 'live.png', type: 'image', data: tinyPng },
      });
      assert.equal(liveAsgnRes.ok, true);
      const liveEvt = await liveSyncAsgn;
      assert.equal(liveEvt.assignment.id, 'a_live');

      const saveInBrk = await emitAck(s1Fresh, 'code:save', {
        roomId: brk1Id,
        title: 'BaiBrk',
        code: 'print(42)',
        language: { name: 'python', version: '3.10.0' },
      });
      assert.equal(saveInBrk.ok, true);

      const allSavedRes = await emitAck(host, 'code:allSaved', { roomId });
      assert.equal(allSavedRes.ok, true);
      const allStudentTitles = allSavedRes.students.map((s) => s.items.map((x) => x.title)).flat();
      assert.ok(allStudentTitles.includes('BaiBrk'), 'Main room code:allSaved must include code saved inside breakout');

      const exportRes = await emitAck(host, 'code:exportZip', { roomId });
      assert.equal(exportRes.ok, true);
      assert.equal(typeof exportRes.base64, 'string');
      const zipStr = Buffer.from(exportRes.base64, 'base64').toString('latin1');
      assert.ok(zipStr.includes('BaiBrk'), 'Main room exportZip buffer must include BaiBrk');

      await emitAck(host, 'breakout:close', { roomId });
      await sleep(80);

      // Rejoin main room and verify saved code survived breakout close + main upload still HTTP 200
      const s1BackMain = await emitAck(s1Fresh, 'room:join', {
        roomId, name: 'An', password: '', sessionToken: s1Token,
      });
      assert.equal(s1BackMain.ok, true);
      const savedListAfter = await emitAck(s1Fresh, 'code:mySaved', { roomId });
      assert.equal(savedListAfter.ok, true);
      assert.ok(savedListAfter.items.some((x) => x.title === 'BaiBrk'), 'Code saved in breakout must persist on mainRoom after close');
      const fetchMainStillOk = await fetch(`${BASE_URL}${mainUploadUrl}`);
      assert.equal(fetchMainStillOk.status, 200, 'Deleting breakout room must NOT remove mainRoom assignment uploads');

      // 19. Host Reconnect inside Breakout + Breakout Room Add / Rename / Delete
      const brk2Create = await emitAck(host, 'breakout:create', {
        roomId, count: 2, mode: 'manual', names: ['T1', 'T2'],
      });
      assert.equal(brk2Create.ok, true);
      const addRoomRes = await emitAck(host, 'breakout:addRoom', { roomId, name: 'T3' });
      assert.equal(addRoomRes.ok, true);
      const t2Id = brk2Create.rooms[1].id;
      const renRes = await emitAck(host, 'breakout:renameRoom', { roomId, breakoutId: t2Id, name: 'T2-Renamed' });
      assert.equal(renRes.ok, true);

      host2 = await connectClient();
      host.disconnect();
      await sleep(80);
      const hostRejoinInBrk = await emitAck(host2, 'room:join', {
        roomId: brk2Create.rooms[0].id, name: 'ThayGiao', password: '', hostSecret,
      });
      assert.equal(hostRejoinInBrk.ok, true);
      assert.equal(hostRejoinInBrk.host, true, 'Host reconnecting directly into breakout must keep host');

      const delSingleRes = await emitAck(host2, 'breakout:deleteRoom', { roomId, breakoutId: t2Id });
      assert.equal(delSingleRes.ok, true, 'Reconnected host inside breakout must control main breakout rooms');
      const listAfterDel = await emitAck(host2, 'breakout:list', { roomId });
      assert.equal(listAfterDel.rooms.length, 2);
      assert.equal(listAfterDel.rooms.some((r) => r.id === t2Id), false);

      // 20. Grace Period Recall
      const mvGraceAssign = waitEvent(s1Fresh, 'breakout:move');
      await emitAck(host2, 'breakout:assign', { roomId, socketId: s1Fresh.id, targetId: brk2Create.rooms[0].id });
      await mvGraceAssign;
      await emitAck(s1Fresh, 'room:join', {
        roomId: brk2Create.rooms[0].id, name: 'An', password: '', sessionToken: s1Token,
      });

      const closingEvtP = waitEvent(s1Fresh, 'breakout:closing');
      const graceMoveBackP = waitEvent(s1Fresh, 'breakout:move');
      const recallGraceRes = await emitAck(host2, 'breakout:recall', { roomId, graceSeconds: 1 });
      assert.equal(recallGraceRes.ok, true);
      const cEvt = await closingEvtP;
      assert.ok(cEvt.endsAt > Date.now() - 500, 'breakout:closing must broadcast countdown');
      const gMove = await graceMoveBackP;
      assert.equal(gMove.roomId, roomId, 'Student must auto-move to mainRoom after grace timer');
      await emitAck(s1Fresh, 'room:join', { roomId, name: 'An', password: '', sessionToken: s1Token });
      await emitAck(host2, 'breakout:close', { roomId });
      await emitAck(host2, 'room:join', { roomId, name: 'ThayGiao', password: '', hostSecret });

      // 21. Self-Select Breakout Mode
      const brkSelf = await emitAck(host2, 'breakout:create', {
        roomId, count: 2, mode: 'manual', allowSelfSelect: false, names: ['Self1', 'Self2'],
      });
      assert.equal(brkSelf.ok, true);
      const selfRoomId = brkSelf.rooms[0].id;

      const blockedSelf = await emitAck(s1Fresh, 'breakout:selfJoin', { roomId, targetId: selfRoomId });
      assert.ok(blockedSelf.error, 'selfJoin must be blocked when allowSelfSelect=false');

      const toggleSelf = await emitAck(host2, 'breakout:setSettings', { roomId, allowSelfSelect: true });
      assert.equal(toggleSelf.ok, true);

      const pubList = await emitAck(s1Fresh, 'breakout:publicList', { roomId });
      assert.equal(pubList.ok, true);
      assert.equal(pubList.allowSelfSelect, true);
      assert.equal(pubList.rooms.length, 2);

      const selfMoveP = waitEvent(s1Fresh, 'breakout:move');
      const okSelf = await emitAck(s1Fresh, 'breakout:selfJoin', { roomId, targetId: selfRoomId });
      assert.equal(okSelf.ok, true);
      const sMoveEvt = await selfMoveP;
      assert.equal(sMoveEvt.roomId, selfRoomId);

      const outsiderSelf = await emitAck(outsider, 'breakout:selfJoin', { roomId, targetId: selfRoomId });
      assert.ok(outsiderSelf.error, 'Outsider must NOT selfJoin breakout room');

      await emitAck(host2, 'breakout:close', { roomId });
      host2.emit('assignment:delete', { roomId, assignmentId: 'a_brk' });
      host2.emit('assignment:delete', { roomId, assignmentId: 'a_live' });
      await sleep(80);

      // 22. Realtime Floating Reactions (whitelist, broadcast, rate-limit, outsider block)
      const reactionRecvP = waitEvent(host2, 'room:reaction');
      const okReact = await emitAck(s1Fresh, 'room:reaction', { roomId, emoji: '🎉' });
      assert.equal(okReact.ok, true);
      const rEvt = await reactionRecvP;
      assert.equal(rEvt.emoji, '🎉');
      assert.equal(rEvt.socketId, s1Fresh.id);

      const spamReact = await emitAck(s1Fresh, 'room:reaction', { roomId, emoji: '👏' });
      assert.ok(spamReact.error, 'Rapid reactions within rate limit must be throttled');

      const badEmoji = await emitAck(s2New, 'room:reaction', { roomId, emoji: '<script>' });
      assert.ok(badEmoji.error, 'Non-whitelisted emoji must be rejected');

      const outReact = await emitAck(outsider, 'room:reaction', { roomId, emoji: '👍' });
      assert.ok(outReact.error, 'Outsider must NOT send room:reaction');

      // 23. AI Quiz Helpers (prefix stripping, shuffle correctness & non-bias, dedup, distractor summary)
      const aiQuizMod = await import('../dist/aiQuiz.js');
      assert.equal(aiQuizMod.stripOptionPrefix('A. Python'), 'Python');
      assert.equal(aiQuizMod.stripOptionPrefix('b) C++'), 'C++');
      assert.equal(aiQuizMod.stripOptionPrefix('(C) JavaScript'), 'JavaScript');

      const seenIdx = new Set();
      for (let i = 0; i < 25; i++) {
        const sh = aiQuizMod.shuffleQuizQuestion({
          question: '2 + 2 bằng mấy?',
          options: ['A. 4', 'B. 3', 'C. 5', 'D. 6'],
          correctAnswer: 0,
          explanation: 'Vì 2 + 2 = 4',
        });
        assert.ok(sh, 'Valid question must normalize');
        assert.equal(sh.options[sh.correctAnswer], '4', 'Shuffled correctAnswer must still point to 4');
        seenIdx.add(sh.correctAnswer);
      }
      assert.ok(seenIdx.size >= 2, 'Option shuffle must vary correctAnswer position across runs');
      assert.equal(aiQuizMod.shuffleQuizQuestion({ question: 'Bad', options: ['only1'], correctAnswer: 0 }), null);

      const deduped = aiQuizMod.normalizeQuizQuestions(
        [
          { question: 'Câu đã có?', options: ['1', '2', '3', '4'], correctAnswer: 0, explanation: '' },
          { question: 'Câu mới hoàn toàn?', options: ['1', '2', '3', '4'], correctAnswer: 1, explanation: 'ok' },
          { question: 'Câu mới hoàn toàn?', options: ['1', '2', '3', '4'], correctAnswer: 2, explanation: 'dup' },
        ],
        ['Câu đã có?'],
      );
      assert.equal(deduped.length, 1, 'normalizeQuizQuestions must deduplicate existing & duplicate entries');

      const distractorText = aiQuizMod.buildDistractorSummary([
        {
          question: { question: 'Output cua print(1+1)?', options: ['2', '11', '1', 'Error'], correctAnswer: 0 },
          results: [
            { selectedOption: 0, isCorrect: true },
            { selectedOption: 1, isCorrect: false },
            { selectedOption: 1, isCorrect: false },
          ],
          correctCount: 1,
          totalCount: 3,
        },
      ]);
      assert.ok(distractorText.includes('33% đúng') && distractorText.includes('chọn nhầm B'), 'Distractor summary must include top wrong option');

      // 24. Quiz timeLimit/endsAt + Adaptive force-reveal & per-question timeout + distribution
      const quizStartedP = waitEvent(s1Fresh, 'quiz:started');
      host2.emit('quiz:start', {
        roomId,
        quiz: {
          id: 'q_tl',
          title: 'Timed Quiz',
          timeLimit: 120,
          questions: [{ id: 'qt1', question: '1+1?', options: ['2', '3', '4', '5'], correctAnswer: 0, explanation: '2' }],
        },
      });
      const qStartedEvt = await quizStartedP;
      assert.equal(qStartedEvt.quiz.timeLimit, 120);
      assert.ok(qStartedEvt.quiz.endsAt > Date.now(), 'Quiz with timeLimit must broadcast endsAt');
      assert.equal(qStartedEvt.quiz.questions[0].correctAnswer, undefined, 'Student must not receive correctAnswer');
      const quizEndedP = waitEvent(s1Fresh, 'quiz:ended');
      host2.emit('quiz:end', { roomId });
      await quizEndedP;

      const adStartRes = await emitAck(host2, 'adaptive:start', { roomId, title: 'Adaptive Force Test' });
      assert.equal(adStartRes.ok, true);

      const adQ1P = waitEvent(s1Fresh, 'adaptive:question');
      host2.emit('adaptive:push-question', {
        roomId,
        timeLimit: 60,
        question: { id: 'aq1', question: 'Test Q1?', options: ['A1', 'B1', 'C1', 'D1'], correctAnswer: 2, explanation: 'C1' },
      });
      const adQ1 = await adQ1P;
      assert.ok(adQ1.endsAt > Date.now(), 'Adaptive question with timeLimit must include endsAt');
      // Chỉ s1Fresh trả lời, s2New cố tình AFK → host bấm force-reveal
      s1Fresh.emit('adaptive:answer', { roomId, selectedOption: 2 });
      await sleep(80);
      const statsForceP = waitEvent(s1Fresh, 'adaptive:question-stats');
      const forceRes = await emitAck(host2, 'adaptive:force-reveal', { roomId });
      assert.equal(forceRes.ok, true);
      const stForce = await statsForceP;
      assert.equal(stForce.questionResult.forced, true);
      assert.equal(stForce.questionResult.distribution[2], 1, 'Distribution must count student pick');
      assert.equal(stForce.questionResult.totalCount, 2);

      // Câu 2: timeLimit = 1s và cả 2 học sinh đều AFK → server tự chốt sau 1s
      const statsAutoP = waitEvent(s1Fresh, 'adaptive:question-stats');
      host2.emit('adaptive:push-question', {
        roomId,
        timeLimit: 1,
        question: { id: 'aq2', question: 'Timeout Q2?', options: ['A', 'B', 'C', 'D'], correctAnswer: 0, explanation: 'A' },
      });
      const stAuto = await statsAutoP;
      assert.equal(stAuto.questionResult.forced, true, 'Per-question timer must auto-finalize when expired');
      await emitAck(host2, 'adaptive:end', { roomId });

      // 25. Live Quiz Append Questions, Extend Time & Anti-Cheat Supplement Submit
      const liveStartP = waitEvent(s1Fresh, 'quiz:started');
      host2.emit('quiz:start', {
        roomId,
        quiz: {
          id: 'q_live_append',
          title: 'Live Append Quiz',
          timeLimit: 60,
          questions: [
            { id: 'la_1', question: 'Q1?', options: ['A', 'B', 'C', 'D'], correctAnswer: 0, explanation: 'A' },
          ],
        },
      });
      await liveStartP;

      // s1Fresh submits Q1 right away (1/1); s2New has not submitted yet
      const s1FirstSub = await emitAck(s1Fresh, 'quiz:submit', {
        roomId,
        answers: [{ questionId: 'la_1', selectedOption: 0 }],
      });
      assert.equal(s1FirstSub.ok, true);
      assert.equal(s1FirstSub.response.score, 1);

      // Non-host cannot append questions
      const denyAppend = await emitAck(s1Fresh, 'quiz:append-questions', {
        roomId,
        questions: [{ id: 'la_bad', question: 'Hack?', options: ['1', '2', '3', '4'], correctAnswer: 0 }],
      });
      assert.ok(denyAppend.error, 'Non-host must NOT append questions to live quiz');

      // Host appends 2 questions + extends time by 120s
      const s2AppendedP = waitEvent(s2New, 'quiz:questions-appended');
      const appendRes = await emitAck(host2, 'quiz:append-questions', {
        roomId,
        extraSeconds: 120,
        questions: [
          { id: 'la_2', question: 'Q2?', options: ['1', '2', '3', '4'], correctAnswer: 1, explanation: '2' },
          { id: 'la_3', question: 'Q3?', options: ['1', '2', '3', '4'], correctAnswer: 2, explanation: '3' },
        ],
      });
      assert.equal(appendRes.ok, true);
      assert.equal(appendRes.added, 2);
      assert.equal(appendRes.totalQuestions, 3);
      const s2AppEvt = await s2AppendedP;
      assert.equal(s2AppEvt.questions.length, 2);
      assert.equal(s2AppEvt.questions[0].correctAnswer, undefined, 'Appended questions to students must NOT leak correctAnswer');

      // s1Fresh tries to spoof/overwrite Q1 + answers Q2 (right) and Q3 (wrong) via quiz:submit-extra
      const hostUpdRespP = waitEvent(host2, 'quiz:response-updated');
      const extraSub = await emitAck(s1Fresh, 'quiz:submit-extra', {
        roomId,
        answers: [
          { questionId: 'la_1', selectedOption: 3 }, // must be ignored (already graded!)
          { questionId: 'la_2', selectedOption: 1 }, // correct
          { questionId: 'la_3', selectedOption: 0 }, // wrong
        ],
      });
      assert.equal(extraSub.ok, true);
      assert.equal(extraSub.response.answers.length, 3);
      assert.equal(extraSub.response.score, 2, 'Score must keep Q1=1 + Q2=1 + Q3=0 = 2');
      const updHostEvt = await hostUpdRespP;
      assert.equal(updHostEvt.response.score, 2);

      // s2New submits all 3 questions normally
      const s2AllSub = await emitAck(s2New, 'quiz:submit', {
        roomId,
        answers: [
          { questionId: 'la_1', selectedOption: 0 },
          { questionId: 'la_2', selectedOption: 1 },
          { questionId: 'la_3', selectedOption: 2 },
        ],
      });
      assert.equal(s2AllSub.ok, true);
      assert.equal(s2AllSub.response.score, 3);

      // Host extends time manually (+60s)
      const timeUpdP = waitEvent(s2New, 'quiz:time-updated');
      const extRes = await emitAck(host2, 'quiz:extend-time', { roomId, extraSeconds: 60 });
      assert.equal(extRes.ok, true);
      const tEvt = await timeUpdP;
      assert.ok(tEvt.endsAt > Date.now() + 100_000, 'quiz:extend-time must extend endsAt');

      const liveEndP = waitEvent(s1Fresh, 'quiz:ended');
      host2.emit('quiz:end', { roomId });
      await liveEndP;

      // 26. Exam Monitoring Hardening: shareStatus + displaySurface persistence, pinScreen reconnect migration, violationHistory auto-log
      const examTok = 'exam_reconn_token_260001';
      const sExamA = await connectClient();
      const sExamB = await connectClient();
      try {
        const joinA = await emitAck(sExamA, 'room:join', {
          roomId,
          name: 'HS Exam',
          password: '',
          sessionToken: examTok,
        });
        assert.equal(joinA.ok, true);

        assert.equal((await emitAck(host2, 'exam:setMonitoring', { roomId, active: true })).ok, true);
        assert.equal((await emitAck(host2, 'exam:requireShare', { roomId, active: true })).ok, true);

        const shareStatP = waitEvent(host2, 'exam:shareStatus');
        sExamA.emit('exam:reportShare', { roomId, sharing: true, surface: 'browser' });
        const shareEvt = await shareStatP;
        assert.equal(shareEvt.socketId, sExamA.id);
        assert.equal(shareEvt.sharing, true);
        assert.equal(shareEvt.surface, 'browser');

        // Host exam:getState restores shareStatus + surface; student exam:getState must NOT expose shareStatus
        const hostExamState = await emitAck(host2, 'exam:getState', { roomId });
        assert.equal(hostExamState.ok, true);
        assert.equal(hostExamState.exam.shareStatus[sExamA.id]?.surface, 'browser');
        const stuExamState = await emitAck(s2New, 'exam:getState', { roomId });
        assert.equal(stuExamState.ok, true);
        assert.equal(stuExamState.exam.shareStatus, undefined, 'Students must NOT receive full shareStatus map');

        // Pin sExamA, then reconnect as sExamB with same sessionToken → pinnedScreenId + shareStatus must migrate & broadcast
        assert.equal((await emitAck(host2, 'exam:pinScreen', { roomId, targetSocketId: sExamA.id })).ok, true);
        const pinMigratedP = waitEvent(host2, 'exam:pinnedScreen');
        const joinB = await emitAck(sExamB, 'room:join', {
          roomId,
          name: 'HS Exam',
          password: '',
          sessionToken: examTok,
        });
        assert.equal(joinB.ok, true);
        const pinMigrated = await pinMigratedP;
        assert.equal(pinMigrated.targetSocketId, sExamB.id, 'Reconnect must broadcast updated exam:pinnedScreen');

        const hostAfterReconn = await emitAck(host2, 'exam:getState', { roomId });
        assert.equal(hostAfterReconn.exam.pinnedScreenId, sExamB.id);
        assert.equal(hostAfterReconn.exam.shareStatus[sExamB.id]?.surface, 'browser');

        // Violations must auto-record timestamped violationHistory entries & emit violationEntry to Host
        const viol1P = waitEvent(host2, 'user:violation');
        sExamB.emit('user:violation', { roomId, type: 'tab-switch' });
        const viol1 = await viol1P;
        assert.equal(viol1.violations, 1);
        assert.equal(viol1.violationEntry?.type, 'tab-switch');
        assert.ok(viol1.violationEntry?.reason && viol1.violationEntry?.timestamp > 0);

        const viol2P = waitEvent(host2, 'user:violation');
        sExamB.emit('user:violation', { roomId, type: 'external-paste', text: 'print("copied")' });
        const viol2 = await viol2P;
        assert.equal(viol2.pasteCount, 1);
        assert.equal(viol2.violationEntry?.type, 'external-paste');

        // Stopping monitoring clears monitoring, requireShare, pinnedScreenId, shareStatus
        assert.equal((await emitAck(host2, 'exam:setMonitoring', { roomId, active: false })).ok, true);
        const clearedExam = await emitAck(host2, 'exam:getState', { roomId });
        assert.equal(clearedExam.exam.monitoring, false);
        assert.equal(clearedExam.exam.requireShare, false);
        assert.equal(clearedExam.exam.pinnedScreenId, null);
        assert.deepEqual(clearedExam.exam.shareStatus, {});
      } finally {
        sExamA.close();
        sExamB.close();
      }

      const badDel = await emitAck(s2New, 'room:delete', { roomId, password: '' });
      assert.ok(badDel.error, 'Non-host without hostSecret must NOT delete room');

      const goodDel = await emitAck(host2, 'room:delete', { roomId, password: '', hostSecret });
      assert.equal(goodDel.ok, true);
      console.log('🎉 ALL 26 END-TO-END VERIFICATION SUITES PASSED!');
    } finally {
      host.close();
      host2?.close();
      s1.close();
      s1Fresh?.close();
      s2.close();
      s2New?.close();
      outsider.close();
    }
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err);
    console.error('Server logs:\n', logs);
    process.exitCode = 1;
  } finally {
    serverProc.kill('SIGKILL');
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.rmSync(EXPIRED_UPLOADS_DIR, { recursive: true, force: true });
    process.exit(process.exitCode || 0);
  }
}

runTests();
