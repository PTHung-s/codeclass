import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import 'dotenv/config';
import { roomManager } from './room.manager.js';
import { registerMeetingHandlers } from './sockets/meeting.handler.js';
import {
  buildRoomSyncPayload,
  getCanonicalSkillsForPrompt,
  isValidInternalSecret,
  pushCodeClassEvent,
} from './codeclassBridge.js';
import {
  adaptiveTimers,
  breakoutGraceTimers,
  breakoutTimers,
  clearAdaptiveQuestionTimer,
  closeSfuRoom,
  musicTimers,
  removeRoomUploadsDir,
} from './sockets/shared.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { generateChatReply, generateStructuredText, getAiProviderInfo } from './aiClient.js';
import {
  ADAPTIVE_GENERATE_SCHEMA,
  ADAPTIVE_RECOMMEND_SCHEMA,
  QUIZ_RESPONSE_SCHEMA,
  buildDistractorSummary,
  difficultyInstruction,
  loadUploadedAssignmentImage,
  normalizeQuizQuestions,
  parseJsonSafely,
  questionTypeInstruction,
} from './aiQuiz.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Export for use in meeting.handler
export const getMusicDirectory = () => path.join(__dirname, '../public/music');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Allowlist CORS — bỏ wildcard. Thêm origin qua env ALLOWED_ORIGINS (phân tách bằng dấu ,)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS
  || 'https://codeclass.vnotemate.com,http://localhost:5173,http://localhost:5000,http://localhost:4443')
  .split(',').map((s) => s.trim()).filter(Boolean);
const corsOriginOk = (origin?: string): boolean => !origin || ALLOWED_ORIGINS.includes(origin);

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => cb(null, corsOriginOk(origin)),
    methods: ["GET", "POST"]
  },
  // Khi deploy dưới subfolder /meet/: Caddy forward /meet/socket.io/* → server.
  // Socket.IO phải lắng nghe path /meet/socket.io/ thay vì mặc định /socket.io/
  path: process.env.SOCKET_PATH || '/socket.io',
  maxHttpBufferSize: 15e6 // 15MB — đủ cho PDF/ảnh đính kèm, giảm dư địa DoS
});

app.use(cors({ origin: (origin, cb) => cb(null, corsOriginOk(origin)) }));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// Rate-limit đơn giản (in-memory, theo IP) cho các endpoint AI tốn tiền
const aiBuckets = new Map<string, { count: number; ts: number }>();
const aiRateLimit = (req: any, res: any, next: any) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const b = aiBuckets.get(ip);
  if (!b || now - b.ts > 60_000) { aiBuckets.set(ip, { count: 1, ts: now }); return next(); }
  b.count++;
  if (b.count > 25) return res.status(429).json({ error: 'Quá nhiều yêu cầu AI, vui lòng thử lại sau.' });
  next();
};
app.use('/api/ai', aiRateLimit);
// dọn bucket cũ định kỳ để không phình bộ nhớ
setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of aiBuckets) if (now - b.ts > 120_000) aiBuckets.delete(ip);
}, 60_000).unref?.();

// Serve static files from client build
// Serve SPA dưới subfolder /meet/ khi deploy production (VITE_APP_BASE=/meet/)
const APP_BASE = process.env.APP_BASE || '';
if (APP_BASE) {
  // 1) API routes dưới prefix: '/meet/api/rooms' → '/api/rooms' (route gốc xử lý)
  app.use((req, res, next) => {
    // Bỏ qua socket.io path — Socket.IO Server tự xử lý path=/meet/socket.io/
    if (req.url.startsWith(APP_BASE + '/socket.io')) return next();
    if (req.url.startsWith(APP_BASE + '/')) {
      req.url = req.url.slice(APP_BASE.length); // strip '/meet' một lần, giữ '/api/...'
    } else if (req.url === APP_BASE) {
      req.url = '/';
    }
    next();
  });
  // 2) Static + SPA fallback dưới prefix (đặt TRƯỚC API routes không được — Express
  //    app.use(APP_BASE, static) tự strip prefix nên để ở đây là đủ)
  app.use(APP_BASE, express.static(path.join(__dirname, '../../client/dist')));
  app.get(APP_BASE + '/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
  app.get(APP_BASE, (req, res) => {
    res.redirect(APP_BASE + '/');
  });
}
app.use(express.static(path.join(__dirname, '../../client/dist')));

// Serve music files & uploaded assignment files
app.use('/music', express.static(path.join(__dirname, '../public/music')));
const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');
app.use('/uploads', express.static(UPLOADS_DIR));

// API to get music playlist
app.get('/api/music/playlist', (req, res) => {
  const musicDir = path.join(__dirname, '../public/music');
  
  try {
    if (!fs.existsSync(musicDir)) {
      return res.json({ error: 'Music directory not found', path: musicDir, files: [] });
    }
    const files = fs.readdirSync(musicDir).filter((f: string) => f.toLowerCase().endsWith('.mp3'));
    res.json({ path: musicDir, files });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ─── SSO CodeClass: verify token hộ client (chung origin với codeclass.vnotemate.com) ───
interface CcUser { id: string; name: string; role: string; avatarUrl?: string | null }
const CC_API = process.env.CODECLASS_API || 'http://127.0.0.1:3001';
const ccCache = new Map<string, { user: CcUser | null; exp: number }>();
async function verifyCodeClassToken(token?: string | null): Promise<CcUser | null> {
  if (!token) return null;
  const hit = ccCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;
  try {
    const r = await fetch(`${CC_API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: (AbortSignal as any).timeout(6000),
    });
    if (!r.ok) {
      // token sai/hết hạn → cache kết quả âm 30s để không gọi liên tục
      ccCache.set(token, { user: null, exp: Date.now() + 30_000 });
      return null;
    }
    const u: any = await r.json();
    const user: CcUser = { id: u.id, name: u.fullName || u.nickname || u.email, role: u.role, avatarUrl: u.avatarUrl || null };
    ccCache.set(token, { user, exp: Date.now() + 120_000 });
    return user;
  } catch {
    return null;
  }
}
// Xuất qua globalThis cho meeting.handler dùng (tránh import vòng)
(globalThis as any).verifyCodeClassToken = verifyCodeClassToken;

// Định kỳ dọn entries hết hạn trong ccCache để tránh rò rỉ bộ nhớ
setInterval(() => {
  const now = Date.now();
  for (const [tk, entry] of ccCache) {
    if (entry.exp <= now) ccCache.delete(tk);
  }
}, 5 * 60_000).unref?.();

/** Chỉ giáo viên/admin CodeClass hoặc chủ phòng có hostSecret hợp lệ mới gọi được các endpoint AI tạo đề. */
const requireHostOrTeacher = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (bearer) {
    const ccUser = await verifyCodeClassToken(bearer);
    if (ccUser && (ccUser.role === 'teacher' || ccUser.role === 'admin')) {
      return next();
    }
  }
  const { roomId, hostSecret } = req.body || {};
  if (typeof roomId === 'string' && roomId) {
    const room = roomManager.getRoom(roomId);
    if (room && roomManager.isValidHostSecret(room, hostSecret)) {
      return next();
    }
  }
  return res.status(403).json({ error: 'Chỉ giáo viên hoặc chủ phòng mới có quyền tạo câu hỏi AI.' });
};

app.get('/api/profile', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = await verifyCodeClassToken(token);
  if (!user) return res.status(401).json({ error: 'Chưa đăng nhập CodeClass' });
  res.json({ user });
});

app.get('/api/rooms', (req, res) => {
  res.json({ rooms: roomManager.listRooms() });
});

app.post('/api/rooms', (req, res) => {
  const { name, password, hostName, courseId, hostUserId } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Tên phòng là bắt buộc' });
  }
  if (!hostName || typeof hostName !== 'string') {
    return res.status(400).json({ error: 'Tên host là bắt buộc' });
  }
  const roomId = roomManager.createRoom(name, password, hostName, undefined, {
    courseId: typeof courseId === 'string' && courseId.trim() ? courseId.trim() : undefined,
    hostUserId: typeof hostUserId === 'string' && hostUserId.trim() ? hostUserId.trim() : undefined,
  });
  const room = roomManager.getRoom(roomId);
  io.emit('room:list', roomManager.listRooms());
  if (room) void pushCodeClassEvent('room:sync', buildRoomSyncPayload(room));
  res.json({ id: roomId, hostSecret: room?.hostSecret || '' });
});

const requireInternalOrTeacher = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  if (isValidInternalSecret(req)) return next();
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (bearer) {
    const ccUser = await verifyCodeClassToken(bearer);
    if (ccUser && (ccUser.role === 'teacher' || ccUser.role === 'admin')) return next();
  }
  return res.status(403).json({ error: 'Không có quyền truy cập nội bộ.' });
};

app.get('/api/internal/rooms', requireInternalOrTeacher, (_req, res) => {
  const rooms = Array.from(roomManager.rooms.values())
    .filter((r) => !r.isBreakout)
    .map((r) => buildRoomSyncPayload(r));
  res.json({ rooms });
});

app.delete('/api/internal/rooms/:id', requireInternalOrTeacher, (req, res) => {
  const roomId = String(req.params.id || '');
  const room = roomManager.getRoom(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Phòng không tồn tại' });
  }

  io.to(roomId).emit('room:deleted');
  for (const bid of room.breakouts || []) {
    io.to(bid).emit('room:deleted');
    roomManager.deleteRoom(bid);
    void closeSfuRoom(bid);
  }
  roomManager.deleteRoom(roomId);
  removeRoomUploadsDir(roomId);
  io.emit('room:list', roomManager.listRooms());
  void closeSfuRoom(roomId);
  const mt = musicTimers.get(roomId);
  if (mt) { clearTimeout(mt); musicTimers.delete(roomId); }
  const at = adaptiveTimers.get(roomId);
  if (at) { clearTimeout(at); adaptiveTimers.delete(roomId); }
  clearAdaptiveQuestionTimer(roomId);
  const bt = breakoutTimers.get(roomId);
  if (bt) { clearTimeout(bt); breakoutTimers.delete(roomId); }
  const bgt = breakoutGraceTimers.get(roomId);
  if (bgt) { clearTimeout(bgt); breakoutGraceTimers.delete(roomId); }
  void pushCodeClassEvent('room:deleted', { roomId });
  res.json({ ok: true });
});

// AI Chat Endpoint (hỗ trợ OpenAI-compatible & Gemini)
app.post('/api/ai/chat', async (req, res) => {
  const { message, history, attachments, roomId, userName, sessionToken } = req.body || {};
  const aiInfo = getAiProviderInfo();

  if (!aiInfo.configured) {
    return res.status(500).json({ error: 'AI API Key not configured' });
  }

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Chặn payload quá khổ → tránh phình request Gemini / DoS
  if (Array.isArray(attachments)) {
    if (attachments.length > 5) return res.status(400).json({ error: 'Quá nhiều tệp đính kèm (tối đa 5).' });
    if (attachments.some((a: any) => a?.fileData && String(a.fileData).length > 6_000_000))
      return res.status(400).json({ error: 'Tệp đính kèm quá lớn.' });
  }

  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const ccUser = await verifyCodeClassToken(bearer);
  const historyKey = ccUser
    ? `cc:${ccUser.id}`
    : (typeof sessionToken === 'string' && sessionToken.trim() ? `anon:${sessionToken.trim()}` : null);

  try {
    const systemInstruction =
      'Bạn là một giảng viên lập trình cực kỳ nghiêm khắc và khó tính. Nhưng lại rất tận tâm với học sinh, luôn giải thích và hướng dẫn mọi thứ thật dễ hiểu, ngay cả học sinh lớp 5 cũng hiểu được. ' +
      'Nhiệm vụ của bạn là hỗ trợ sinh viên hiểu đề bài, tìm ra lỗi sai trong code của họ và gợi ý hướng giải quyết đúng. ' +
      'QUY TẮC CỐT LÕI: ' +
      '1. TUYỆT ĐỐI KHÔNG viết code hộ sinh viên dưới bất kỳ hình thức nào. ' +
      '2. Không cung cấp lời giải trực tiếp hay spoil quá sâu; hãy để sinh viên tự tư duy. ' +
      '3. Chỉ ra vị trí hoặc logic sai và giải thích khái niệm để sinh viên tự sửa. ' +
      '4. Trả lời cực kỳ ngắn gọn, súc tích, đi thẳng vào vấn đề. ' +
      '5. Mỗi câu trả lời KHÔNG ĐƯỢC VƯỢT QUÁ 10 câu văn. ' +
      '6. Nếu bạn thấy phần giải thích dài hoặc hướng dẫn cần nhiều bước thì cứ tách nhỏ hỏi và trao đổi với học sinh qua nhiều lần hội thoại. ' +
      '7. Nếu bạn thấy cần thêm thông tin gì như là đề, bài làm của học sinh hay các loại thông tin khác thì luôn yêu cầu học sinh cung cấp thêm để không bịa thông tin. ' +
      '8. Luôn giải thích mọi thứ thật dễ hiểu, giống như học sinh chưa từng biết kiến thức đó nhé. Ngôn ngữ: Tiếng Việt.';

    const text = await generateChatReply({
      systemInstruction,
      message: String(message),
      history: Array.isArray(history) ? history : [],
      attachments: Array.isArray(attachments) ? attachments : [],
    });

    // Save history to room manager keyed by participantKey (fallback userName) + markDirty
    const saveKey = historyKey || (typeof userName === 'string' && userName.trim() ? userName.trim() : null);
    if (roomId && saveKey) {
      const room = roomManager.getRoom(roomId);
      if (room) {
        if (!room.aiHistory) room.aiHistory = new Map();
        
        const userHistory = room.aiHistory.get(saveKey) || [];
        const newUserMsg = { 
          role: 'user', 
          parts: [{ text: message }],
          attachments: attachments
        };
        const newModelMsg = { 
          role: 'model', 
          parts: [{ text: text }] 
        };
        
        const updatedHistory = [...userHistory, newUserMsg, newModelMsg].slice(-50);
        room.aiHistory.set(saveKey, updatedHistory);
        roomManager.markDirty();
      }
    }

    res.json({ reply: text });
  } catch (error: any) {
    console.error('AI Chat Error:', error);
    res.status(500).json({ error: 'Failed to get AI response', details: error.message });
  }
});

// Xóa lịch sử chat AI bền vững theo phòng + định danh người dùng
app.delete('/api/ai/history', async (req, res) => {
  const { roomId, sessionToken } = req.body || {};
  if (!roomId || typeof roomId !== 'string') {
    return res.status(400).json({ error: 'roomId là bắt buộc' });
  }
  const room = roomManager.getRoom(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Phòng không tồn tại' });
  }
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const ccUser = await verifyCodeClassToken(bearer);
  const historyKey = ccUser
    ? `cc:${ccUser.id}`
    : (typeof sessionToken === 'string' && sessionToken.trim() ? `anon:${sessionToken.trim()}` : null);
  if (!historyKey) {
    return res.status(400).json({ error: 'Thiếu định danh phiên' });
  }
  if (room.aiHistory) {
    room.aiHistory.delete(historyKey);
    // Dọn luôn key cũ theo tên nếu thuộc đúng chủ sở hữu đã xác thực trong phòng
    for (const p of room.participants.values()) {
      const pKey = p.ccId ? `cc:${p.ccId}` : (p.sessionToken ? `anon:${p.sessionToken}` : null);
      if (pKey === historyKey && p.name) {
        room.aiHistory.delete(p.name);
      }
    }
    roomManager.markDirty();
  }
  res.json({ ok: true });
});

app.post('/api/ai/generate-quiz', requireHostOrTeacher, async (req, res) => {
  const {
    topic,
    context,
    difficulty = 'mixed',
    questionType = 'mixed',
    language = '',
    sourceCode = '',
    assignmentName = '',
    assignmentPath = '',
    replaceQuestion = '',
  } = req.body || {};
  const count = Math.min(15, Math.max(1, Number(req.body?.count) || 3)); // clamp chống lạm dụng (tối đa 15 câu/lượt)
  const aiInfo = getAiProviderInfo();
  if (!aiInfo.configured) {
    console.error('Quiz Gen Error: API Key missing');
    return res.status(500).json({ error: 'API Key not found' });
  }

  const cleanTopic = String(topic || '').trim().slice(0, 400);
  const cleanCode = typeof sourceCode === 'string' ? sourceCode.trim().slice(0, 4000) : '';
  const cleanAssignmentName = typeof assignmentName === 'string' ? assignmentName.trim().slice(0, 200) : '';
  const assignmentImg = loadUploadedAssignmentImage(typeof assignmentPath === 'string' ? assignmentPath : '');
  const cleanLang = typeof language === 'string' ? language.trim().slice(0, 40) : '';

  if (!cleanTopic && !cleanCode && !cleanAssignmentName && !assignmentImg) {
    return res.status(400).json({ error: 'Vui lòng nhập chủ đề hoặc chọn ngữ cảnh code/đề bài.' });
  }

  // Rút gọn danh sách câu đã có (chỉ lấy nội dung question để tiết kiệm token)
  const existingQuestions: string[] = Array.isArray(context)
    ? context
        .map((c: any) => (typeof c === 'string' ? c : String(c?.question || '')))
        .filter(Boolean)
        .slice(-30)
    : [];
  if (typeof replaceQuestion === 'string' && replaceQuestion.trim()) {
    existingQuestions.push(replaceQuestion.trim());
  }

  try {
    const skillHints = await getCanonicalSkillsForPrompt();
    const buildPrompt = (needed: number, avoidList: string[]) => `Bạn là giảng viên lập trình chuyên nghiệp.
Hãy tạo ĐÚNG ${needed} câu hỏi trắc nghiệm tiếng Việt chất lượng cao.
${cleanTopic ? `Chủ đề yêu cầu: "${cleanTopic}"` : 'Hãy tạo câu hỏi bám sát trực tiếp đoạn code / đề bài đính kèm.'}
${cleanLang ? `Ngôn ngữ lập trình chính của lớp: ${cleanLang} (hãy gắn nhãn \`\`\`${cleanLang} cho khối code).` : ''}
${difficultyInstruction(difficulty)}
${questionTypeInstruction(questionType)}
${cleanAssignmentName ? `Đề bài đang chiếu trên lớp: "${cleanAssignmentName}"` : ''}
${cleanCode ? `\nĐoạn code đang mở trên lớp (tham khảo để ra câu hỏi sát bài học):\n\`\`\`${cleanLang || ''}\n${cleanCode}\n\`\`\`` : ''}
${skillHints ? `\nDanh sách skillId chuẩn CodeClass (chọn 1 skillId khớp nhất cho mỗi câu hoặc để trống): ${skillHints}` : ''}
${avoidList.length > 0 ? `\nCác câu đã có (KHÔNG được lặp lại ý hoặc đề tương tự):\n${avoidList.map((q, i) => `${i + 1}. ${q.slice(0, 200)}`).join('\n')}` : ''}

ĐỊNH DẠNG JSON BẮT BUỘC (trả về DUY NHẤT 1 JSON object):
{
  "questions": [
    {
      "question": "Nội dung câu hỏi (dùng Markdown cho code)",
      "options": ["Phương án 1", "Phương án 2", "Phương án 3", "Phương án 4"],
      "correctAnswer": 0,
      "explanation": "Giải thích súc tích tại sao đáp án đúng và các bẫy hay gặp",
      "difficulty": "easy | medium | hard",
      "skillId": "mã skillId từ danh sách hoặc để trống"
    }
  ]
}

QUY TẮC BẮT BUỘC:
- Mỗi câu hỏi có ĐÚNG 4 phương án ngắn gọn, rõ ràng, khác nhau, KHÔNG tự viết tiền tố "A. ", "B. ", "C. ", "D. " ở đầu phương án.
- Các phương án nhiễu phải hợp lý (phản ánh lỗi sai phổ biến của học sinh).
- correctAnswer là số nguyên 0..3 ứng với phương án đúng duy nhất.
- Dùng Markdown chuẩn cho code (\`inline\` và khối \`\`\`${cleanLang || 'python'} ... \`\`\` có dòng trống trước/sau).`;

    const callOnce = async (needed: number, avoidList: string[]) => {
      const rawText = await generateStructuredText({
        prompt: buildPrompt(needed, avoidList),
        image: assignmentImg,
        geminiSchema: QUIZ_RESPONSE_SCHEMA,
        expectJsonObject: true,
        temperature: 0.7,
      });
      const parsed = parseJsonSafely(rawText);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
      return normalizeQuizQuestions(list, avoidList);
    };

    let questions = await callOnce(count, existingQuestions);

    // Nếu AI trả thiếu câu hoặc lọc trùng còn thiếu → thử bổ sung 1 lần
    if (questions.length < count) {
      const missing = count - questions.length;
      try {
        const extra = await callOnce(missing, [...existingQuestions, ...questions.map((q) => q.question)]);
        questions = [...questions, ...extra].slice(0, count);
      } catch {
        /* giữ nguyên các câu hợp lệ đã có nếu lần retry gặp lỗi */
      }
    }

    if (questions.length === 0) {
      return res.status(500).json({ error: 'AI không sinh được câu hỏi hợp lệ, vui lòng thử lại.' });
    }

    console.log(`✅ [${aiInfo.provider}:${aiInfo.model}] Generated ${questions.length} structured & shuffled questions`);
    return res.json({ questions });
  } catch (error: any) {
    console.error('Quiz Gen Error:', error);
    res.status(500).json({ error: 'AI generation failed', details: error.message });
  }
});

// Adaptive Quiz: AI recommends 5 topics based on student weaknesses + distractor analysis
app.post('/api/ai/adaptive-recommend', requireHostOrTeacher, async (req, res) => {
  const { questionHistory, topic, language = '' } = req.body || {};
  const aiInfo = getAiProviderInfo();
  if (!aiInfo.configured) return res.status(500).json({ error: 'API Key not found' });

  try {
    const historyContext = buildDistractorSummary(questionHistory);

    const prompt = `Bạn là giảng viên lập trình đang phân tích kết quả trắc nghiệm adaptive theo thời gian thực.
${topic ? `Chủ đề chung của buổi học: ${String(topic).slice(0, 200)}` : ''}
${language ? `Ngôn ngữ lập trình của lớp: ${String(language).slice(0, 40)}` : ''}

Kết quả và lỗi chọn nhầm ở các câu đã ra:
${historyContext}

NHIỆM VỤ:
Phân tích lỗ hổng kiến thức dựa trên tỷ lệ sai VÀ các phương án sai phổ biến học sinh vừa chọn nhầm, rồi đề xuất ĐÚNG 5 chủ đề/khái niệm cụ thể nên hỏi tiếp theo (ưu tiên khắc phục điểm yếu trước, sau đó mới mở rộng nâng cao).

ĐỊNH DẠNG JSON BẮT BUỘC (trả về DUY NHẤT 1 JSON object):
{
  "topics": [
    {
      "title": "Tên chủ đề rõ ràng, cụ thể",
      "reason": "Lý do ngắn gọn nêu rõ điểm yếu/mục tiêu",
      "suggestedDifficulty": "easy | medium | hard"
    }
  ]
}
Ngôn ngữ: Tiếng Việt.`;

    const rawText = await generateStructuredText({
      prompt,
      geminiSchema: ADAPTIVE_RECOMMEND_SCHEMA,
      expectJsonObject: true,
      temperature: 0.65,
    });
    const data = parseJsonSafely(rawText);
    const topics = Array.isArray(data?.topics)
      ? data.topics
          .filter((t: any) => t && typeof t.title === 'string' && t.title.trim())
          .slice(0, 5)
          .map((t: any) => ({
            title: String(t.title).trim(),
            reason: String(t.reason || '').trim(),
            suggestedDifficulty:
              t.suggestedDifficulty === 'easy' || t.suggestedDifficulty === 'medium' || t.suggestedDifficulty === 'hard'
                ? t.suggestedDifficulty
                : 'medium',
          }))
      : [];

    if (topics.length === 0) {
      return res.status(500).json({ error: 'AI chưa đề xuất được chủ đề hợp lệ.' });
    }
    res.json({ topics });
  } catch (error: any) {
    console.error('Adaptive Recommend Error:', error);
    res.status(500).json({ error: 'AI recommendation failed', details: error.message });
  }
});

// Adaptive Quiz: Generate 2 questions x 2 distinct versions for a specific topic
app.post('/api/ai/adaptive-generate', requireHostOrTeacher, async (req, res) => {
  const { topic, questionHistory, difficulty = 'mixed', language = '', existingQueue = [] } = req.body || {};
  const aiInfo = getAiProviderInfo();
  if (!aiInfo.configured) return res.status(500).json({ error: 'API Key not found' });

  try {
    const existingQuestions: string[] = [
      ...(Array.isArray(questionHistory) ? questionHistory.map((qr: any) => String(qr?.question?.question || '')) : []),
      ...(Array.isArray(existingQueue) ? existingQueue.map((q: any) => (typeof q === 'string' ? q : String(q?.question || ''))) : []),
    ]
      .filter(Boolean)
      .slice(-30);

    const cleanLang = typeof language === 'string' ? language.trim().slice(0, 40) : '';
    const skillHints = await getCanonicalSkillsForPrompt();

    const prompt = `Bạn là giảng viên lập trình. Hãy tạo câu hỏi trắc nghiệm cho chủ đề: "${String(topic || '').slice(0, 240)}".
${cleanLang ? `Ngôn ngữ lập trình: ${cleanLang} (dùng \`\`\`${cleanLang} cho khối code).` : ''}
${difficultyInstruction(difficulty)}
${skillHints ? `Danh sách skillId chuẩn CodeClass (gắn 1 mã phù hợp nhất): ${skillHints}` : ''}
${existingQuestions.length > 0 ? `\nCác câu đã hỏi hoặc đang trong hàng đợi (KHÔNG được trùng):\n${existingQuestions.map((q, i) => `${i + 1}. ${q.slice(0, 180)}`).join('\n')}` : ''}

NHIỆM VỤ:
1. versionA: 2 câu hỏi trắc nghiệm MỚI (thiên về củng cố bản chất / ví dụ ngắn).
2. versionB: 2 câu hỏi KHÁC HOÀN TOÀN về nội dung nhưng cùng chủ đề (thiên về đọc hiểu code / tình huống bẫy).

ĐỊNH DẠNG JSON BẮT BUỘC (trả về DUY NHẤT 1 JSON object):
{
  "versionA": [
    {"question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": 0, "explanation": "...", "difficulty": "easy | medium | hard", "skillId": "..."}
  ],
  "versionB": [
    {"question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": 0, "explanation": "...", "difficulty": "easy | medium | hard", "skillId": "..."}
  ]
}

QUY TẮC:
- Mỗi câu có ĐÚNG 4 phương án ngắn gọn, KHÔNG tự thêm tiền tố "A. ", "B. ", "C. ", "D. ".
- correctAnswer là số nguyên 0..3. Dùng Markdown chuẩn cho code. Ngôn ngữ: Tiếng Việt.`;

    const rawText = await generateStructuredText({
      prompt,
      geminiSchema: ADAPTIVE_GENERATE_SCHEMA,
      expectJsonObject: true,
      temperature: 0.75,
    });
    const parsed = parseJsonSafely(rawText);

    const versionA = normalizeQuizQuestions(parsed?.versionA || [], existingQuestions);
    const versionB = normalizeQuizQuestions(
      parsed?.versionB || [],
      [...existingQuestions, ...versionA.map((q) => q.question)],
    );

    if (versionA.length === 0 && versionB.length === 0) {
      return res.status(500).json({ error: 'AI không sinh được câu hỏi hợp lệ.' });
    }
    res.json({ versionA, versionB });
  } catch (error: any) {
    console.error('Adaptive Generate Error:', error);
    res.status(500).json({ error: 'AI generation failed', details: error.message });
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  registerMeetingHandlers(io, socket);
});

// Serve index.html for all other routes (SPA)
app.use((req, res, next) => {
  // Skip API, socket.io, uploads, and music routes
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/socket.io') ||
    req.path.startsWith('/uploads') ||
    req.path.startsWith('/music')
  ) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../../client/dist/index.html')); // SPA fallback (root)
});

const PORT = process.env.PORT || 5000;
// Khôi phục phòng đã lưu TRƯỚC khi mở cổng (tránh join vào phòng chưa load xong)
roomManager.loadFromFile();
server.listen(PORT, () => {
  const ai = getAiProviderInfo();
  console.log(`Server running on port ${PORT} (AI: ${ai.configured ? `${ai.provider}/${ai.model}` : 'disabled'})`);
});
