import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Peer, Message, MusicState, AudioGroup, BreakoutSummary } from '../types';
import type { AiMessage, AiAttachment } from '../types/ai';
import type { Quiz, QuizResponse, QuizStats, AdaptiveSession, AdaptiveQuestionResult, QuizQuestion } from '../types/quiz';

interface MeetingState {
  roomId: string | null;
  roomName: string | null;
  userName: string | null;
  localStream: MediaStream | null;
  peers: Peer[];
  messages: Message[];
  isHost: boolean;
  hostId: string | null;
  pinnedPeerId: string | null;
  syncedPin: { identity: string; source: any } | null;
  activeTab: 'chat' | 'info' | 'users' | 'ai' | 'quiz' | 'stats' | 'music' | 'exam' | 'breakout' | null;
  setActiveTab: (tab: 'chat' | 'info' | 'users' | 'ai' | 'quiz' | 'stats' | 'music' | 'exam' | 'breakout' | null) => void;
  
  // AI Assistant State
  aiMessages: AiMessage[];
  aiInput: string;
  aiAttachments: AiAttachment[];
  setAiInput: (input: string) => void;
  addAiMessage: (msg: AiMessage) => void;
  setAiMessages: (msgs: AiMessage[]) => void;
  clearAiMessages: () => void;
  attachToAi: (content: string, label: string, type: AiAttachment['type'], fileData?: string, mimeType?: string) => void;
  removeAiAttachment: (id: string) => void;
  clearAiAttachments: () => void;
  
  // Quiz State
  activeQuiz: Quiz | null;
  quizResponses: QuizResponse[];
  quizStats: QuizStats | null;
  myQuizSubmission: {
    score: number;
    timeTaken: number;
    rank?: number;
    totalSubmissions?: number;
    answers: Array<{ questionId: string; selectedOption: number; isCorrect: boolean }>;
    review?: Array<{ id: string; correctAnswer: number; explanation?: string }>;
  } | null;
  setActiveQuiz: (quiz: Quiz | null) => void;
  appendActiveQuizQuestions: (questions: QuizQuestion[], timeMeta?: { timeLimit?: number; endsAt?: number | null }) => void;
  updateActiveQuizTime: (timeLimit?: number, endsAt?: number | null) => void;
  addQuizResponse: (response: QuizResponse) => void;
  upsertQuizResponse: (response: QuizResponse) => void;
  setQuizResponses: (responses: QuizResponse[]) => void;
  setQuizStats: (stats: QuizStats | null) => void;
  setMyQuizSubmission: (sub: MeetingState['myQuizSubmission']) => void;

  // Persistence for Quiz Creation
  draftQuiz: Partial<Quiz>;
  setDraftQuiz: (quiz: Partial<Quiz>) => void;

  // Adaptive Quiz State
  activeAdaptive: AdaptiveSession | null;
  adaptiveCurrentQuestion: QuizQuestion | null;
  adaptiveQuestionEndsAt: number | null;
  adaptiveTimeLimitSec: number;
  adaptiveQuestionIndex: number;
  adaptiveMyAnswer: number | null;
  adaptiveMyResult: boolean | null;
  adaptiveMyCorrectAnswer: number | null;
  adaptiveMyExplanation: string | null;
  adaptiveAnswerProgress: { count: number; total: number };
  adaptiveQuestionResults: AdaptiveQuestionResult[];
  adaptiveScores: { socketId: string; userName: string; score: number }[];
  adaptiveRankings: { socketId: string; userName: string; score: number }[] | null;
  adaptiveCountdown: number;
  adaptiveQuestionQueue: QuizQuestion[];
  addToAdaptiveQueue: (questions: QuizQuestion[]) => void;
  removeFromAdaptiveQueue: (id: string) => void;
  reorderAdaptiveQueue: (fromIdx: number, toIdx: number) => void;
  updateAdaptiveQueueItem: (question: QuizQuestion) => void;
  shiftAdaptiveQueue: () => QuizQuestion | undefined;
  setAdaptiveQuestionQueue: (queue: QuizQuestion[]) => void;
  setActiveAdaptive: (session: AdaptiveSession | null) => void;
  setAdaptiveCurrentQuestion: (question: QuizQuestion | null, index: number, endsAt?: number | null) => void;
  setAdaptiveTimeLimitSec: (sec: number) => void;
  setAdaptiveMyAnswer: (answer: number | null) => void;
  setAdaptiveMyResult: (result: boolean | null) => void;
  setAdaptiveMyAnswerResult: (isCorrect: boolean, correctAnswer?: number, explanation?: string) => void;
  setAdaptiveAnswerProgress: (progress: { count: number; total: number }) => void;
  addAdaptiveQuestionResult: (result: AdaptiveQuestionResult) => void;
  setAdaptiveScores: (scores: { socketId: string; userName: string; score: number }[]) => void;
  setAdaptiveQuestionResults: (results: AdaptiveQuestionResult[]) => void;
  setAdaptiveRankings: (rankings: { socketId: string; userName: string; score: number }[] | null) => void;
  setAdaptiveCountdown: (seconds: number) => void;
  resetAdaptive: () => void;

  // Code Editor State
  isCodeEditorOpen: boolean;
  codeEditorWidth: number;
  code: string;
  selectedLanguage: { name: string; version: string };
  output: string;
  isRunning: boolean;
  lastRunMeta: { status: 'ok' | 'error'; durationMs: number; at: number } | null;
  stdin: string;
  currentSavedId: string | null;
  setCurrentSavedId: (id: string | null) => void;
  myPoints: number;
  setMyPoints: (pts: number) => void;
  
  // Peer Code State (for admin to view others' code)
  peerCodes: Map<string, { 
    code: string; 
    language: { name: string; version: string };
    activityStats?: Array<{ timestamp: number; added: number; deleted: number }>;
  }>;
  peerCursors: Map<string, { lineNumber: number; column: number; selection?: any }>;
  viewingPeerCode: string | null;
  
  setRoom: (id: string, name: string, userName?: string) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  addPeer: (peer: Peer) => void;
  removePeer: (socketId: string) => void;
  updatePeerStream: (socketId: string, stream: MediaStream) => void;
  updatePeerState: (socketId: string, state: Partial<{ isMuted: boolean, isCameraOff: boolean, isActive: boolean, isHandRaised: boolean }>) => void;
  addMessage: (msg: Message) => void;
  setMessages: (msgs: Message[]) => void;
  unreadMessageCount: number;
  resetUnreadMessages: () => void;
  setPeers: (peers: Peer[]) => void;
  setIsHost: (isHost: boolean) => void;
  setHostId: (hostId: string | null) => void;
  setPinnedPeerId: (id: string | null) => void;
  setSyncedPin: (pin: { identity: string; source: any } | null) => void;
  
  // Code Editor Actions
  toggleCodeEditor: () => void;
  setCodeEditorWidth: (width: number) => void;
  setCode: (code: string) => void;
  setSelectedLanguage: (language: { name: string; version: string }) => void;
  setOutput: (output: string) => void;
  setIsRunning: (isRunning: boolean) => void;
  setLastRunMeta: (meta: { status: 'ok' | 'error'; durationMs: number; at: number } | null) => void;
  setStdin: (stdin: string) => void;
  
  // Peer Code Actions
  updatePeerCode: (socketId: string, code: string, language: { name: string; version: string }) => void;
  updatePeerActivityStats: (socketId: string, stats: Array<{ timestamp: number; added: number; deleted: number }>) => void;
  updatePeerViolations: (socketId: string, violations: number) => void;
  updatePeerCopyCount: (socketId: string, copyCount: number) => void;
  updatePeerPasteCount: (socketId: string, pasteCount: number) => void;
  updatePeerPoints: (pointsData: Array<{ socketId: string, points: number }>) => void;
  addPeerViolationHistory: (socketId: string, history: { type: string; reason: string; timestamp: number }) => void;
  setViewingPeerCode: (socketId: string | null) => void;
  removePeerCode: (socketId: string) => void;
  updatePeerCursor: (socketId: string, cursor: { lineNumber: number; column: number; selection?: any }) => void;
  removePeerCursor: (socketId: string) => void;
  
  // Sidebar State & Actions
  showDebug: boolean;
  setShowDebug: (show: boolean) => void;
  showPeerViewer: boolean;
  setShowPeerViewer: (show: boolean) => void;

  // Music State
  musicState: MusicState;
  setMusicState: (state: Partial<MusicState>) => void;
  musicProgress: { currentTime: number; duration: number };
  setMusicProgress: (progress: { currentTime: number; duration: number }) => void;
  isMusicPollOpen: boolean;
  setIsMusicPollOpen: (open: boolean) => void;
  musicVolume: number;
  setMusicVolume: (volume: number) => void;
  
  // Media State
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isHandRaised: boolean;
  selectedMicId: string;
  selectedCamId: string;
  setMicEnabled: (enabled: boolean) => void;
  setCameraEnabled: (enabled: boolean) => void;
  setHandRaised: (raised: boolean) => void;
  setSelectedMicId: (id: string) => void;
  setSelectedCamId: (id: string) => void;

  // Token HMAC do app-server cấp khi room:join — client trình lên SFU để được phép media
  sfuToken: string | null;
  setSfuToken: (t: string | null) => void;

  // Phòng hiện tại là breakout (phòng nhóm con)? + id lớp chính
  isBreakout: boolean;
  parentId: string | null;
  setIsBreakout: (v: boolean, parentId?: string | null) => void;

  // Tài khoản CodeClass (SSO) — nếu có
  cc: { id: string; name: string; role: string; avatarUrl?: string | null } | null;
  setCc: (u: { id: string; name: string; role: string; avatarUrl?: string | null } | null) => void;

  /** Tăng lên khi SFU cần nối lại (socket reconnect) — useSFU phụ thuộc epoch này */
  sfuEpoch: number;
  bumpSfuEpoch: () => void;

  /** Mốc tự gọi về của phòng nhóm (ms) — null = không hẹn; đồng bộ cho cả học sinh */
  breakoutEndsAt: number | null;
  setBreakoutEndsAt: (v: number | null) => void;

  // Ai được nghe host (host tick trên card học sinh). hostId đã có ở trên.
  audioMode: 'all' | 'selected';
  hearHost: string[];
  hostFocus: boolean;
  audioGroups: AudioGroup[];
  /** Tóm tắt các phòng nhóm (cho thanh đi tuần nhanh & tab Phòng nhóm) */
  breakoutSummary: BreakoutSummary | null;
  setBreakoutSummary: (s: BreakoutSummary | null) => void;
  /** Thông báo sắp gọi về / đóng nhóm (grace countdown 30s) */
  breakoutClosing: { endsAt: number; reason: 'recall' | 'close'; mainRoomId: string; mainRoomName: string } | null;
  setBreakoutClosing: (c: MeetingState['breakoutClosing']) => void;
  /** Nhóm nào đang bấm "Cần giúp đỡ" */
  breakoutHelpAlerts: Record<string, { roomName: string; name: string; at: number }>;
  addBreakoutHelpAlert: (roomId: string, info: { roomName: string; name: string; at: number }) => void;
  clearBreakoutHelpAlert: (roomId: string) => void;
  /** socket.id của CHÍNH mình (kênh signaling) — cần để áp luật audio */
  mySocketId: string | null;
  setMySocketId: (id: string | null) => void;

  // ─── Giám sát thi cử ───
  /** Host đang bật chế độ giám sát */
  examMonitoring: boolean;
  /** Host đã yêu cầu cả lớp chia sẻ màn hình */
  examRequireShare: boolean;
  /** Màn hình đang được ghim cho CẢ LỚP xem (tối đa 1) */
  examPinnedScreenId: string | null;
  /** ai đã/chưa chia sẻ màn hình (host theo dõi) */
  examShareStatus: Record<string, boolean>;
  /** loại bề mặt đang chia sẻ ('monitor' | 'window' | 'browser' | 'unknown') */
  examShareSurface: Record<string, string>;
  setExamMonitoring: (v: boolean) => void;
  setExamRequireShare: (v: boolean) => void;
  setExamPinnedScreenId: (id: string | null) => void;
  setExamShareStatus: (socketId: string, sharing: boolean, surface?: string) => void;
  hydrateExamShareStatus: (map: Record<string, { sharing: boolean; surface?: string }>) => void;
  resetExam: () => void;
  setHearHost: (allowed: string[]) => void;
  setAudioState: (payload: {
    mode?: 'all' | 'selected';
    allowed?: string[];
    hostFocus?: boolean;
    groups?: AudioGroup[];
  }) => void;
  /** Áp luật bất đối xứng: tôi có được nghe peer này không? */
  canHear: (peerId: string) => boolean;

  // SFU media state — stream map theo clientPeerId (= signaling socket.id)
  remoteCamStreams: Record<string, MediaStream>;
  remoteScreenStreams: Record<string, MediaStream>;
  setRemoteCamStream: (id: string, stream: MediaStream) => void;
  setRemoteScreenStream: (id: string, stream: MediaStream) => void;
  /** Xoá hẳn luồng screen của 1 peer (khác với gán stream rỗng) */
  removeRemoteScreenStream: (id: string) => void;
  removeRemoteStreams: (id: string) => void;
  // Ai đó đang share màn hình: 'self' hoặc clientPeerId; null = không có
  screenSharePeerId: string | null;
  setScreenSharePeerId: (id: string | null) => void;
  localScreenStream: MediaStream | null;
  setLocalScreenStream: (s: MediaStream | null) => void;
  // Active speaker: key = 'self' hoặc clientPeerId
  speaking: Record<string, boolean>;
  setSpeaking: (id: string, val: boolean) => void;
  clearSpeaking: (id: string) => void;
  
  // Assignment State
  assignments: Array<{ id: string; data: string; type: 'image' | 'pdf'; name: string }>;
  currentAssignmentIndex: number;
  setAssignments: (assignments: Array<{ id: string; data: string; type: 'image' | 'pdf'; name: string }>) => void;
  addAssignment: (assignment: { id: string; data: string; type: 'image' | 'pdf'; name: string }) => void;
  removeAssignment: (id: string) => void;
  updateAssignments: (assignments: Array<{ id: string; data: string; type: 'image' | 'pdf'; name: string }>) => void;
  setCurrentAssignmentIndex: (index: number) => void;
  
  reset: () => void;
}

export const useMeetingStore = create<MeetingState>()(persist((set, get) => ({
  roomId: null,
  roomName: null,
  userName: null,
  localStream: null,
  peers: [],
  messages: [],
  isHost: false,
  hostId: null,
  pinnedPeerId: null,
  syncedPin: null,
  
  // AI Assistant Initial State
  aiMessages: [],
  aiInput: '',
  aiAttachments: [],
  setAiInput: (input: string) => set({ aiInput: input }),
  addAiMessage: (msg: AiMessage) => set((state) => {
    // Limit to 100 AI messages to prevent memory bloat
    const newMessages = [...state.aiMessages, { ...msg, id: msg.id || Date.now().toString() + Math.random() }];
    const limitedMessages = newMessages.length > 100 ? newMessages.slice(-100) : newMessages;
    return { aiMessages: limitedMessages };
  }),
  setAiMessages: (msgs: AiMessage[]) => set({ aiMessages: msgs }),
  clearAiMessages: () => set({ aiMessages: [] }),
  attachToAi: (content: string, label: string, type: AiAttachment['type'], fileData?: string, mimeType?: string) => set((state) => {
    // Nếu nội dung trống thì không đính kèm
    if (!content || !content.trim()) return { activeTab: 'ai' };

    // Tránh trùng lặp nội dung giống hệt nhau
    const isDuplicate = state.aiAttachments.some((a: AiAttachment) => a.content === content && a.type === type && a.fileData === fileData);
    if (isDuplicate) return { activeTab: 'ai' };

    const newAttachment: AiAttachment = {
      id: `${type}-${Date.now()}`,
      label,
      content,
      type,
      fileData,
      mimeType
    };
    
    return { 
      aiAttachments: [...state.aiAttachments, newAttachment],
      activeTab: 'ai' 
    };
  }),
  removeAiAttachment: (id: string) => set((state) => ({
    aiAttachments: state.aiAttachments.filter((a: AiAttachment) => a.id !== id)
  })),
  clearAiAttachments: () => set({ aiAttachments: [] }),

  // Quiz Actions
  activeQuiz: null,
  quizResponses: [],
  quizStats: null,
  myQuizSubmission: null,
  setActiveQuiz: (quiz) => set({ activeQuiz: quiz, quizResponses: [], quizStats: null, myQuizSubmission: null }),
  appendActiveQuizQuestions: (questions, timeMeta) => set((state) => {
    if (!state.activeQuiz || !Array.isArray(questions) || questions.length === 0) return state;
    const seen = new Set(state.activeQuiz.questions.map((q) => q.id));
    const uniqueNew = questions.filter((q) => q && q.id && !seen.has(q.id));
    if (uniqueNew.length === 0 && !timeMeta) return state;
    return {
      activeQuiz: {
        ...state.activeQuiz,
        questions: [...state.activeQuiz.questions, ...uniqueNew],
        ...(timeMeta?.timeLimit !== undefined ? { timeLimit: timeMeta.timeLimit } : {}),
        ...(timeMeta?.endsAt !== undefined ? { endsAt: timeMeta.endsAt } : {}),
      },
    };
  }),
  updateActiveQuizTime: (timeLimit, endsAt) => set((state) => {
    if (!state.activeQuiz) return state;
    return {
      activeQuiz: {
        ...state.activeQuiz,
        ...(timeLimit !== undefined ? { timeLimit } : {}),
        ...(endsAt !== undefined ? { endsAt } : {}),
      },
    };
  }),
  addQuizResponse: (response) => set((state) => ({ 
    quizResponses: [...state.quizResponses, response] 
  })),
  upsertQuizResponse: (response) => set((state) => {
    const idx = state.quizResponses.findIndex((r) => r.userId === response.userId || r.userName === response.userName);
    if (idx === -1) return { quizResponses: [...state.quizResponses, response] };
    const next = [...state.quizResponses];
    next[idx] = response;
    return { quizResponses: next };
  }),
  setQuizResponses: (responses) => set({ quizResponses: responses }),
  setQuizStats: (stats) => set({ quizStats: stats }),
  setMyQuizSubmission: (sub) => set({ myQuizSubmission: sub }),

  // Draft Quiz Persistence
  draftQuiz: { title: '', questions: [] },
  setDraftQuiz: (quiz) => set({ draftQuiz: quiz }),

  // Adaptive Quiz Initial State
  activeAdaptive: null,
  adaptiveCurrentQuestion: null,
  adaptiveQuestionEndsAt: null,
  adaptiveTimeLimitSec: 45,
  adaptiveQuestionIndex: 0,
  adaptiveMyAnswer: null,
  adaptiveMyResult: null,
  adaptiveMyCorrectAnswer: null,
  adaptiveMyExplanation: null,
  adaptiveAnswerProgress: { count: 0, total: 0 },
  adaptiveQuestionResults: [],
  adaptiveScores: [],
  adaptiveRankings: null,
  adaptiveCountdown: 0,
  adaptiveQuestionQueue: [],
  addToAdaptiveQueue: (questions) => set((state) => ({ adaptiveQuestionQueue: [...state.adaptiveQuestionQueue, ...questions] })),
  removeFromAdaptiveQueue: (id) => set((state) => ({ adaptiveQuestionQueue: state.adaptiveQuestionQueue.filter(q => q.id !== id) })),
  reorderAdaptiveQueue: (fromIdx, toIdx) => set((state) => {
    const arr = [...state.adaptiveQuestionQueue];
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= arr.length || toIdx >= arr.length) return state;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    return { adaptiveQuestionQueue: arr };
  }),
  updateAdaptiveQueueItem: (question) => set((state) => ({
    adaptiveQuestionQueue: state.adaptiveQuestionQueue.map((q) => (q.id === question.id ? question : q)),
  })),
  shiftAdaptiveQueue: () => {
    let first: QuizQuestion | undefined;
    set((state) => {
      first = state.adaptiveQuestionQueue[0];
      return { adaptiveQuestionQueue: state.adaptiveQuestionQueue.slice(1) };
    });
    return first;
  },
  setAdaptiveQuestionQueue: (queue) => set({ adaptiveQuestionQueue: queue }),
  setActiveAdaptive: (session) => set({ activeAdaptive: session, adaptiveQuestionResults: [], adaptiveScores: [], adaptiveRankings: null, adaptiveCurrentQuestion: null, adaptiveQuestionEndsAt: null, adaptiveQuestionIndex: 0, adaptiveMyAnswer: null, adaptiveMyResult: null, adaptiveMyCorrectAnswer: null, adaptiveMyExplanation: null, adaptiveAnswerProgress: { count: 0, total: 0 }, adaptiveCountdown: 0, adaptiveQuestionQueue: [] }),
  setAdaptiveCurrentQuestion: (question, index, endsAt) => set({
    adaptiveCurrentQuestion: question,
    adaptiveQuestionEndsAt: question ? (endsAt ?? null) : null,
    adaptiveQuestionIndex: index,
    adaptiveMyAnswer: null,
    adaptiveMyResult: null,
    adaptiveMyCorrectAnswer: null,
    adaptiveMyExplanation: null,
    adaptiveAnswerProgress: { count: 0, total: 0 },
  }),
  setAdaptiveTimeLimitSec: (sec) => set({ adaptiveTimeLimitSec: sec }),
  setAdaptiveMyAnswer: (answer) => set({ adaptiveMyAnswer: answer }),
  setAdaptiveMyResult: (result) => set({ adaptiveMyResult: result }),
  setAdaptiveMyAnswerResult: (isCorrect, correctAnswer, explanation) => set({
    adaptiveMyResult: isCorrect,
    adaptiveMyCorrectAnswer: typeof correctAnswer === 'number' ? correctAnswer : null,
    adaptiveMyExplanation: explanation || null,
  }),
  setAdaptiveAnswerProgress: (progress) => set({ adaptiveAnswerProgress: progress }),
  addAdaptiveQuestionResult: (result) => set((state) => ({ adaptiveQuestionResults: [...state.adaptiveQuestionResults, result] })),
  setAdaptiveScores: (scores) => set({ adaptiveScores: scores }),
  setAdaptiveQuestionResults: (results) => set({ adaptiveQuestionResults: results }),
  setAdaptiveRankings: (rankings) => set({ adaptiveRankings: rankings }),
  setAdaptiveCountdown: (seconds) => set({ adaptiveCountdown: seconds }),
  resetAdaptive: () => set({ activeAdaptive: null, adaptiveCurrentQuestion: null, adaptiveQuestionEndsAt: null, adaptiveQuestionIndex: 0, adaptiveMyAnswer: null, adaptiveMyResult: null, adaptiveMyCorrectAnswer: null, adaptiveMyExplanation: null, adaptiveAnswerProgress: { count: 0, total: 0 }, adaptiveQuestionResults: [], adaptiveScores: [], adaptiveRankings: null, adaptiveCountdown: 0, adaptiveQuestionQueue: [] }),

  // Code Editor Initial State
  isCodeEditorOpen: false,
  codeEditorWidth: 50,
  code: '# Write your code here\n',
  selectedLanguage: { name: 'python', version: '3.10.0' },
  output: '',
  isRunning: false,
  stdin: '',
  currentSavedId: null,
  setCurrentSavedId: (id) => set({ currentSavedId: id }),
  myPoints: 0,
  setMyPoints: (pts) => set({ myPoints: pts }),
  
  // Peer Code Initial State
  peerCodes: new Map(),
  peerCursors: new Map(),
  viewingPeerCode: null,
  
  // Sidebar State
  activeTab: null,
  showDebug: false,
  showPeerViewer: false,
  
  // Media State
  isMicEnabled: true,
  isCameraEnabled: true,
  isHandRaised: false,
  selectedMicId: '',
  selectedCamId: '',
  sfuToken: null,
  setSfuToken: (t) => set({ sfuToken: t }),
  isBreakout: false,
  parentId: null,
  setIsBreakout: (v, parentId) => set({ isBreakout: v, parentId: parentId ?? null }),
  cc: null,
  setCc: (u) => set({ cc: u }),
  sfuEpoch: 0,
  bumpSfuEpoch: () => set((s) => ({ sfuEpoch: s.sfuEpoch + 1 })),
  breakoutEndsAt: null,
  setBreakoutEndsAt: (v) => set({ breakoutEndsAt: v }),
  audioMode: 'all',
  hearHost: [],
  hostFocus: false,
  audioGroups: [],
  breakoutSummary: null,
  setBreakoutSummary: (s) => set({ breakoutSummary: s }),
  breakoutClosing: null,
  setBreakoutClosing: (c) => set({ breakoutClosing: c }),
  breakoutHelpAlerts: {},
  addBreakoutHelpAlert: (id, info) => set((s) => ({
    breakoutHelpAlerts: { ...s.breakoutHelpAlerts, [id]: info },
  })),
  clearBreakoutHelpAlert: (id) => set((s) => {
    if (!(id in s.breakoutHelpAlerts)) return s;
    const next = { ...s.breakoutHelpAlerts };
    delete next[id];
    return { breakoutHelpAlerts: next };
  }),
  mySocketId: null,
  setMySocketId: (id) => set({ mySocketId: id }),
  examMonitoring: false,
  examRequireShare: false,
  examPinnedScreenId: null,
  examShareStatus: {},
  examShareSurface: {},
  setExamMonitoring: (v) => set({ examMonitoring: !!v }),
  setExamRequireShare: (v) => set({ examRequireShare: !!v }),
  setExamPinnedScreenId: (id) => set({ examPinnedScreenId: id || null }),
  setExamShareStatus: (socketId, sharing, surface) => set((s) => {
    const nextSurface = { ...s.examShareSurface };
    if (sharing && surface) nextSurface[socketId] = surface;
    else if (!sharing) delete nextSurface[socketId];
    return {
      examShareStatus: { ...s.examShareStatus, [socketId]: !!sharing },
      examShareSurface: nextSurface,
    };
  }),
  hydrateExamShareStatus: (map) => set(() => {
    const status: Record<string, boolean> = {};
    const surface: Record<string, string> = {};
    for (const [sid, info] of Object.entries(map || {})) {
      if (!info) continue;
      status[sid] = !!info.sharing;
      if (info.sharing && info.surface) surface[sid] = info.surface;
    }
    return { examShareStatus: status, examShareSurface: surface };
  }),
  resetExam: () => set({
    examMonitoring: false, examRequireShare: false,
    examPinnedScreenId: null, examShareStatus: {}, examShareSurface: {},
  }),
  setHearHost: (allowed) => set({ hearHost: Array.isArray(allowed) ? allowed : [] }),
  setAudioState: (payload) => set((s) => ({
    audioMode: payload.mode !== undefined ? payload.mode : s.audioMode,
    hearHost: Array.isArray(payload.allowed) ? payload.allowed : s.hearHost,
    hostFocus: payload.hostFocus !== undefined ? !!payload.hostFocus : s.hostFocus,
    audioGroups: Array.isArray(payload.groups) ? payload.groups : s.audioGroups,
  })),
  canHear: (peerId) => {
    const { hostId, hearHost, isHost, audioMode, hostFocus } = get();
    if (!peerId) return false;
    if (audioMode === 'all') return true;
    const me = get().mySocketId;
    if (isHost) return hostFocus ? hearHost.includes(peerId) : true;
    if (peerId === hostId) return !!me && hearHost.includes(me);
    return !!me && hearHost.includes(me) && hearHost.includes(peerId);
  },

  // Assignment State
  assignments: [],
  currentAssignmentIndex: 0,

  setRoom: (id, name, userName) => set({ roomId: id, roomName: name, userName: userName }),
  setLocalStream: (stream) => set({ localStream: stream }),
  addPeer: (peer) => set((state) => {
    const existsBySocket = state.peers.find(p => p.socketId === peer.socketId);
    if (existsBySocket) {
      return { 
        peers: state.peers.map(p => p.socketId === peer.socketId ? { ...p, ...peer } : p) 
      };
    }
    if (peer.code) {
      const newPeerCodes = new Map(state.peerCodes);
      newPeerCodes.set(peer.socketId, { 
        code: peer.code, 
        language: peer.language || state.selectedLanguage 
      });
      return { peers: [...state.peers, peer], peerCodes: newPeerCodes };
    }
    return { peers: [...state.peers, peer] };
  }),
  removePeer: (socketId) => set((state) => ({
    peers: state.peers.filter((p) => p.socketId !== socketId)
  })),
  updatePeerStream: (socketId, stream) => set((state) => ({
    peers: state.peers.map((p) => p.socketId === socketId ? { ...p, stream } : p)
  })),
  updatePeerState: (socketId, peerState) => set((state) => ({
    peers: state.peers.map((p) => p.socketId === socketId ? { ...p, ...peerState } : p)
  })),
  unreadMessageCount: 0,
  addMessage: (msg) => set((state) => {
    // Limit to 200 messages to prevent memory bloat
    const newMessages = [...state.messages, msg];
    const limitedMessages = newMessages.length > 200 ? newMessages.slice(-200) : newMessages;
    return {
      messages: limitedMessages,
      unreadMessageCount: state.activeTab !== 'chat' ? state.unreadMessageCount + 1 : 0
    };
  }),
  setMessages: (msgs) => set({ messages: msgs }),
  resetUnreadMessages: () => set({ unreadMessageCount: 0 }),
  setPeers: (peers) => set((state) => {
    // Also populate peerCodes if peers have code data
    const newPeerCodes = new Map(state.peerCodes);
    
    peers.forEach(p => {
      if (p.code) {
        newPeerCodes.set(p.socketId, { 
          code: p.code, 
          language: p.language || state.selectedLanguage 
        });
      }
    });
    return { peers, peerCodes: newPeerCodes };
  }),
  setIsHost: (isHost) => set({ isHost }),
  setHostId: (hostId) => set({ hostId }),
  setPinnedPeerId: (id) => set({ pinnedPeerId: id }),
  setSyncedPin: (syncedPin) => set({ syncedPin }),
  
  // Code Editor Actions
  toggleCodeEditor: () => set((state) => ({ isCodeEditorOpen: !state.isCodeEditorOpen })),
  setCodeEditorWidth: (width) => set({ codeEditorWidth: Math.max(20, Math.min(80, width)) }),
  setCode: (code) => set({ code }),
  setSelectedLanguage: (language) => set({ selectedLanguage: language }),
  setOutput: (output) => set((state) => ({ output, lastRunMeta: output ? state.lastRunMeta : null })),
  setIsRunning: (isRunning) => set({ isRunning }),
  lastRunMeta: null,
  setLastRunMeta: (lastRunMeta) => set({ lastRunMeta }),
  setStdin: (stdin) => set({ stdin }),
  
  // Peer Code Actions
  updatePeerCode: (socketId, code, language) => set((state) => {
    const newPeerCodes = new Map(state.peerCodes);
    newPeerCodes.set(socketId, { code, language });
    return { 
      peerCodes: newPeerCodes,
      peers: state.peers.map((p) => p.socketId === socketId ? { ...p, code, language } : p)
    };
  }),
  updatePeerActivityStats: (socketId, activityStats) => set((state) => {
    const newPeerCodes = new Map(state.peerCodes);
    const peerData = newPeerCodes.get(socketId);
    if (peerData) {
      // Limit activityStats to last 5 minutes (300 entries max assuming 1 per second)
      const limitedStats = activityStats.length > 300 ? activityStats.slice(-300) : activityStats;
      newPeerCodes.set(socketId, { ...peerData, activityStats: limitedStats });
    }
    return {
      peerCodes: newPeerCodes,
      peers: state.peers.map((p) => p.socketId === socketId ? { ...p, activityStats } : p)
    };
  }),
  updatePeerViolations: (socketId, violations) => set((state) => ({
    peers: state.peers.map((p) => p.socketId === socketId ? { ...p, violations } : p)
  })),
  updatePeerCopyCount: (socketId, copyCount) => set((state) => ({
    peers: state.peers.map((p) => p.socketId === socketId ? { ...p, copyCount } : p)
  })),
  updatePeerPasteCount: (socketId, pasteCount) => set((state) => ({
    peers: state.peers.map((p) => p.socketId === socketId ? { ...p, pasteCount } : p)
  })),
  updatePeerPoints: (pointsData) => set((state) => {
    const myUpdate = state.mySocketId ? pointsData.find(d => d.socketId === state.mySocketId) : undefined;
    return {
      myPoints: myUpdate ? myUpdate.points : state.myPoints,
      peers: state.peers.map((p) => {
        const update = pointsData.find(d => d.socketId === p.socketId);
        return update ? { ...p, points: update.points } : p;
      }),
    };
  }),
  addPeerViolationHistory: (socketId, history) => set((state) => ({
    peers: state.peers.map((p) => p.socketId === socketId ? { ...p, violationHistory: [...(p.violationHistory || []), history] } : p)
  })),
  setViewingPeerCode: (socketId) => set({ viewingPeerCode: socketId }),
  removePeerCode: (socketId) => set((state) => {
    const newPeerCodes = new Map(state.peerCodes);
    newPeerCodes.delete(socketId);
    return { peerCodes: newPeerCodes, viewingPeerCode: state.viewingPeerCode === socketId ? null : state.viewingPeerCode };
  }),

  // Peer Cursor Actions
  updatePeerCursor: (socketId: string, cursor: any) => set((state) => {
    const newCursors = new Map(state.peerCursors);
    newCursors.set(socketId, cursor);
    return { peerCursors: newCursors };
  }),
  removePeerCursor: (socketId: string) => set((state) => {
    const newCursors = new Map(state.peerCursors);
    newCursors.delete(socketId);
    return { peerCursors: newCursors };
  }),
  
  // Sidebar Actions
  setActiveTab: (tab) => set((state) => ({ 
    activeTab: tab,
    unreadMessageCount: tab === 'chat' ? 0 : state.unreadMessageCount
  })),
  setShowDebug: (show) => set({ showDebug: show }),
  setShowPeerViewer: (show) => set({ showPeerViewer: show }),

  // Music State
  musicState: {
    currentTrack: null,
    isPlaying: false,
    startTime: 0,
    poll: null
  },
  setMusicState: (state) => set((prev) => ({ 
    musicState: { ...prev.musicState, ...state } 
  })),
  musicProgress: { currentTime: 0, duration: 0 },
  setMusicProgress: (progress) => set({ musicProgress: progress }),
  isMusicPollOpen: false,
  setIsMusicPollOpen: (open) => set({ isMusicPollOpen: open }),
  musicVolume: 0.3, 
  setMusicVolume: (volume) => set({ musicVolume: volume }),
  
  // Media Actions
  setMicEnabled: (enabled) => set({ isMicEnabled: enabled }),
  setCameraEnabled: (enabled) => set({ isCameraEnabled: enabled }),
  setHandRaised: (raised) => set({ isHandRaised: raised }),
  setSelectedMicId: (id) => set({ selectedMicId: id }),
  setSelectedCamId: (id) => set({ selectedCamId: id }),

  // SFU media state
  remoteCamStreams: {},
  remoteScreenStreams: {},
  setRemoteCamStream: (id, stream) => set((state) => ({
    remoteCamStreams: { ...state.remoteCamStreams, [id]: stream },
  })),
  setRemoteScreenStream: (id, stream) => set((state) => ({
    remoteScreenStreams: { ...state.remoteScreenStreams, [id]: stream },
  })),
  removeRemoteScreenStream: (id) => set((state) => {
    const screen = { ...state.remoteScreenStreams };
    delete screen[id];
    return { remoteScreenStreams: screen };
  }),
  removeRemoteStreams: (id) => set((state) => {
    const cam = { ...state.remoteCamStreams };
    const screen = { ...state.remoteScreenStreams };
    delete cam[id];
    delete screen[id];
    return { remoteCamStreams: cam, remoteScreenStreams: screen };
  }),
  screenSharePeerId: null,
  setScreenSharePeerId: (id) => set({ screenSharePeerId: id }),
  localScreenStream: null,
  setLocalScreenStream: (s) => set({ localScreenStream: s }),
  speaking: {},
  setSpeaking: (id, val) => set((state) => {
    // QUAN TRỌNG: zustand v5 so sánh bằng Object.is(nextState, state). Trả về một
    // object MỚI (dù rỗng) vẫn làm MỌI subscriber chạy lại — mà tickSpeaking gọi
    // hàm này 150ms/lần cho từng người, nên panel giám sát bị re-render ~27
    // lần/giây dù không ai nói gì (video bị gán lại srcObject liên tục = "nháy").
    // Trả về CHÍNH state cũ thì zustand bỏ qua, không re-render.
    if (!!state.speaking[id] === val) return state;
    const next = { ...state.speaking };
    if (val) next[id] = true; else delete next[id];
    return { speaking: next };
  }),
  clearSpeaking: (id) => set((state) => {
    if (!(id in state.speaking)) return state;
    const next = { ...state.speaking };
    delete next[id];
    return { speaking: next };
  }),

  // Assignment Actions
  setAssignments: (assignments) => set({ assignments }),
  addAssignment: (assignment) => set((state) => ({ 
    assignments: [...state.assignments, assignment],
    currentAssignmentIndex: state.assignments.length // Switch to newly added
  })),
  removeAssignment: (id) => set((state) => {
    const newAssignments = state.assignments.filter(a => a.id !== id);
    let newIndex = state.currentAssignmentIndex;
    if (newIndex >= newAssignments.length) {
      newIndex = Math.max(0, newAssignments.length - 1);
    }
    return { assignments: newAssignments, currentAssignmentIndex: newIndex };
  }),
  updateAssignments: (assignments) => set({ assignments }),
  setCurrentAssignmentIndex: (index) => set({ currentAssignmentIndex: index }),
  
  reset: () => set({
    roomId: null,
    roomName: null,
    localStream: null,
    peers: [],
    messages: [],
    isHost: false,
    pinnedPeerId: null,
    syncedPin: null,
    isCodeEditorOpen: false,
    codeEditorWidth: 50,
    code: '# Write your code here\n',
    selectedLanguage: { name: 'python', version: '3.10.0' },
    output: '',
    isRunning: false,
    currentSavedId: null,
    myPoints: 0,
    myQuizSubmission: null,
    adaptiveMyCorrectAnswer: null,
    adaptiveMyExplanation: null,
    peerCodes: new Map(),
    peerCursors: new Map(),
    viewingPeerCode: null,
    activeTab: null,
    showDebug: false,
    showPeerViewer: false,
    isMicEnabled: true,
    isCameraEnabled: true,
    isHandRaised: false,
    sfuToken: null,
    isBreakout: false,
    parentId: null,
    cc: null,
    sfuEpoch: 0,
    breakoutEndsAt: null,
    audioMode: 'all',
    hearHost: [],
    hostFocus: false,
    audioGroups: [],
    breakoutSummary: null,
    breakoutClosing: null,
    breakoutHelpAlerts: {},
    mySocketId: null,
    examMonitoring: false,
    examRequireShare: false,
    examPinnedScreenId: null,
    examShareStatus: {},
    remoteCamStreams: {},
    remoteScreenStreams: {},
    screenSharePeerId: null,
    localScreenStream: null,
    speaking: {},
    assignments: [],
    currentAssignmentIndex: 0,
    lastRunMeta: null,
    aiMessages: [],
    aiInput: '',
    aiAttachments: [],
    draftQuiz: { title: '', questions: [] },
    activeAdaptive: null,
    adaptiveCurrentQuestion: null,
    adaptiveQuestionEndsAt: null,
    adaptiveQuestionIndex: 0,
    adaptiveMyAnswer: null,
    adaptiveMyResult: null,
    adaptiveAnswerProgress: { count: 0, total: 0 },
    adaptiveQuestionResults: [],
    adaptiveScores: [],
    adaptiveRankings: null,
    adaptiveCountdown: 0,
    adaptiveQuestionQueue: [],
  })
}), {
  name: 'meeting-storage',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    userName: state.userName,
    code: state.code,
    selectedLanguage: state.selectedLanguage,
    // NOT persisting messages, aiMessages, aiAttachments to prevent localStorage bloat
    draftQuiz: state.draftQuiz,
    stdin: state.stdin,
    selectedMicId: state.selectedMicId,
    selectedCamId: state.selectedCamId,
  }),
  merge: (persistedState: any, currentState: MeetingState) => {
    // Merge persisted data with current state
    return {
      ...currentState,
      ...persistedState,
      // Don't restore these volatile states
      roomId: currentState.roomId,
      roomName: currentState.roomName,
      localStream: currentState.localStream,
      peers: currentState.peers,
      isHost: currentState.isHost,
    } as MeetingState;
  },
}));
