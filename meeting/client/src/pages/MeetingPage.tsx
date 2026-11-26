import React, { useState, useEffect, useRef } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { socket } from '../services/socket';
import { originUrl, APP_BASE } from '../services/apiBase';
import type { Message } from '../types';
import {
  Users,
  Info,
  Activity,
  MessageSquare,
  Bot,
  HelpCircle,
  Music,
  ClipboardList,
  MonitorUp,
} from 'lucide-react';
import PeerCodeViewer from '../components/PeerCodeViewer';
import { MeetingWorkspace } from '../components/MeetingWorkspace';
import { RoomInfo, DigitalClock } from '../components/MeetingComponents';
import CustomChat from '../components/CustomChat';
import AIAssistant from '../components/AIAssistant';
import QuizManager from '../components/QuizManager';
import MusicPlayer from '../components/MusicPlayer';
import MusicPoll from '../components/MusicPoll';

import SidebarTemplate from '../components/SidebarTemplate';
import ExamMonitorOverlay from '../components/ExamMonitorOverlay';
import ExamSharePrompt from '../components/ExamSharePrompt';
import AssignmentManager from '../components/AssignmentManager';
import { useSFU } from '../hooks/useSFU';
import { isSFUMode } from '../services/sfu';
import { SFUMediaControls } from '../components/SFUMediaControls';
import { SFURoomStats } from '../components/SFURoomStats';
import { SFUUserList } from '../components/SFUUserList';
import { DeleteRoomPanel } from '../components/DeleteRoomPanel';
import { BreakoutPanel } from '../components/BreakoutPanel';
import { AudioRoutingControl } from '../components/AudioRoutingControl';
import FloatingReactionsOverlay from '../components/FloatingReactionsOverlay';
import ShortcutHelpModal from '../components/ShortcutHelpModal';
import { CornerUpLeft, LayoutGrid, LifeBuoy, PhoneCall, Keyboard, X, Clock } from 'lucide-react';
import { formatQuizClock, getQuizClock } from '../lib/quizTimer';
import MeetPlaybackPlugin from '../components/MeetPlaybackPlugin';
import { switchRoom } from '../lib/roomSwitch';
import { applyRoomJoinState, getHostSecret, getSessionToken } from '../lib/roomState';
import { setAudioAll } from '../lib/audioActions';
import { playSoundCue } from '../lib/soundCue';
import { sfuService } from '../services/sfu';
import { ShieldQuestion, Columns2, Code2, Video } from 'lucide-react';
import { showActionHud, toast, useUiStore } from '../store/useUiStore';

const MeetingPage: React.FC = () => {
  // Chốt debug cho kiểm thử tự động/chẩn đoán: __meetDebug.sfu / __meetDebug.store
  useEffect(() => {
    (window as any).__meetDebug = { sfu: sfuService, store: useMeetingStore, socket };
  }, []);

  const {
    roomId,
    roomName,
    reset,
    showPeerViewer,
    addPeer,
    removePeer,
    updatePeerState,
    updatePeerCode,
    removePeerCode,
    setShowPeerViewer,
    isHost,
    peers,
    unreadMessageCount,
    myPoints,
  } = useMeetingStore();
  
  const [copied, setCopied] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(() => socket.connected);
  const [layoutPreset, setLayoutPreset] = useState<'balanced' | 'code' | 'video'>('balanced');
  const [, setSelectedHistorySocketId] = useState<string | null>(null);
  const { activeTab, setActiveTab } = useMeetingStore();
  const [showAssignmentManager, setShowAssignmentManager] = useState(false);
  /** Host đang mở chế độ giám sát TOÀN MÀN HÌNH.
   *  Khôi phục từ sessionStorage để F5 giữa giờ thi KHÔNG làm mất panel. */
  const [showMonitor, setShowMonitor] = useState(
    () => sessionStorage.getItem('exam:monitorOpen') === '1',
  );
  const [lastMessagePreview, setLastMessagePreview] = useState<Message | null>(null);
  const previewTimerRef = useRef<any>(null);
  // ─── Breakout UX: overlay chuyển phòng + toast cần giúp + đồng hồ ───
  const [moveNotice, setMoveNotice] = useState<string | null>(null);
  const moveTimerRef = useRef<any>(null);
  const [helpToast, setHelpToast] = useState<{ roomId: string; roomName: string; name: string; at: number } | null>(null);
  const breakoutEndsAt = useMeetingStore((s) => s.breakoutEndsAt);
  const breakoutSummary = useMeetingStore((s) => s.breakoutSummary);
  const breakoutClosing = useMeetingStore((s) => s.breakoutClosing);
  const breakoutHelpAlerts = useMeetingStore((s) => s.breakoutHelpAlerts);
  const isBreakoutRoom = useMeetingStore((s) => s.isBreakout);
  const parentRoomId = useMeetingStore((s) => s.parentId);
  const activeQuiz = useMeetingStore((s) => s.activeQuiz);
  const quizResponses = useMeetingStore((s) => s.quizResponses);
  const [breakoutNow, setBreakoutNow] = useState(Date.now());
  const quickHelpAtRef = useRef(0);

  useEffect(() => {
    if (!breakoutEndsAt && !breakoutClosing && !activeQuiz) return;
    const tick = () => setBreakoutNow(Date.now());
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [breakoutEndsAt, breakoutClosing, activeQuiz?.id, activeQuiz?.endsAt, activeQuiz?.timeLimit]);

  const sendQuickHelp = () => {
    const now = Date.now();
    if (now - quickHelpAtRef.current < 10_000) {
      toast.info('Vui lòng đợi vài giây trước khi gửi lại');
      return;
    }
    quickHelpAtRef.current = now;
    const st = useMeetingStore.getState();
    socket.emit('breakout:help', { roomId: st.roomId }, (res: any) => {
      if (res?.ok) toast.success('Đã gửi thông báo tới giáo viên!');
      else toast.error(res?.error || 'Không gửi được yêu cầu');
    });
  };

  // --- SFU mode (VITE_MEDIA_MODE=sfu): media qua mediasoup-server thay vì LiveKit ---
  const sfuEnabled = isSFUMode();
  const sfuEpoch = useMeetingStore((s) => s.sfuEpoch);
  /** Trạng thái giám sát — dùng cho nút trên thanh trên cùng */
  const examMonitoring = useMeetingStore((s) => s.examMonitoring);
  useSFU(sfuEnabled, roomId, sfuEpoch);

  // --- Tự hồi phục khi socket tự nối lại (mạng chập chờn đổi socket.id):
  // room:join lại để đăng ký phòng + giáo viên tự lấy lại host, SFU nối lại với token mới.
  useEffect(() => {
    const onConnect = () => {
      setIsSocketConnected(true);
      const st = useMeetingStore.getState();
      if (!st.roomId) return;
      const secret = getHostSecret(st.roomId) || getHostSecret(st.parentId || '');
      socket.emit('room:join', {
        roomId: st.roomId,
        name: st.userName,
        password: localStorage.getItem('meet:lastPass') || '',
        token: localStorage.getItem('token') || '',
        sessionToken: getSessionToken(),
        hostSecret: secret,
      }, (res: any) => {
        if (res && res.ok) {
          applyRoomJoinState(res, st.roomId!, st.roomName || 'Cuộc họp', st.userName || '');
          // Giữ stream cam & màn hình hiện tại → SFU nối lại không chớp cam và không bắt chọn lại màn hình
          try {
            const cur = useMeetingStore.getState();
            (window as any).__meetKeepStream = cur.localStream || null;
            if (cur.localScreenStream?.getVideoTracks().some((t) => t.readyState === 'live')) {
              (window as any).__meetKeepScreenStream = cur.localScreenStream;
              (window as any).__meetKeepScreenForExam = sfuService.isScreenSharedForExam;
              (window as any).__meetKeepScreenQuality = sfuService.currentScreenQuality;
            }
          } catch { /* noop */ }
          useMeetingStore.getState().bumpSfuEpoch();
        }
      });
    };
    const onDisconnect = () => setIsSocketConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // Phím Esc để đóng sidebar / popup đang mở
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (useUiStore.getState().dialog) return;
      if (showAssignmentManager) { setShowAssignmentManager(false); return; }
      if (showPeerViewer) { setShowPeerViewer(false); return; }
      if (activeTab) { setActiveTab(null); }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [showAssignmentManager, showPeerViewer, activeTab, setActiveTab, setShowPeerViewer]);

  // Tự ẩn toast cần-giúp sau 45s
  useEffect(() => {
    if (!helpToast) return;
    const t = setTimeout(() => setHelpToast(null), 45000);
    return () => clearTimeout(t);
  }, [helpToast]);

  // --- Socket.io Listeners for Peer Synchronization ---
  useEffect(() => {
    socket.on('peer:joined', ({ socketId, name, ...rest }) => {
      console.log('Peer joined event received:', name, socketId);
      addPeer({ 
        socketId, 
        name, 
        isMuted: false, 
        isCameraOff: false, 
        isActive: true, 
        isConnected: true,
        ...rest 
      });
    });

    socket.on('peer:left', ({ socketId }) => {
      console.log('Peer left event received for:', socketId);
      removePeer(socketId);
      removePeerCode(socketId);
    });

    socket.on('chat:message', (msg: Message) => {
      if (msg.senderId !== socket.id) {
        const store = useMeetingStore.getState();
        store.addMessage(msg);
        
        // Show notification if not in chat tab
        if (store.activeTab !== 'chat') {
          playSoundCue('chat');
          setLastMessagePreview(msg);
          if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
          previewTimerRef.current = setTimeout(() => setLastMessagePreview(null), 5000);
        }
      }
    });

    socket.on('chat:history', (history: Message[]) => {
      useMeetingStore.getState().setMessages(history);
    });

    socket.on('peer:update-state', ({ socketId, state }) => {
      const prevPeer = useMeetingStore.getState().peers.find((p) => p.socketId === socketId);
      if (state?.isHandRaised === true && !prevPeer?.isHandRaised) {
        playSoundCue('hand');
      }
      updatePeerState(socketId, state);
    });

    socket.on('room:reaction', (d: any) => {
      if (d?.emoji) {
        useUiStore.getState().pushReaction(String(d.emoji), String(d.name || 'Thành viên'));
        playSoundCue('reaction');
      }
    });

    socket.on('code:sync', ({ socketId, code, language, isTargeted }) => {
      // Sử dụng getState() để lấy giá trị mới nhất, tránh stale closure
      const current = useMeetingStore.getState();
      if (current.isHost || isTargeted) {
        updatePeerCode(socketId, code, language);
      }
    });

    socket.on('code:response', ({ socketId, code, language }) => {
      updatePeerCode(socketId, code, language);
    });

    socket.on('user:violation', ({ socketId, violations, pasteCount, violationEntry }: any) => {
      const store = useMeetingStore.getState();
      store.updatePeerViolations(socketId, violations);
      if (pasteCount !== undefined && store.updatePeerPasteCount) {
        store.updatePeerPasteCount(socketId, pasteCount);
      }
      if (violationEntry && store.addPeerViolationHistory) {
        store.addPeerViolationHistory(socketId, violationEntry);
      }
    });

    socket.on('user:copy', ({ socketId, copyCount }) => {
      useMeetingStore.getState().updatePeerCopyCount(socketId, copyCount);
    });

    socket.on('peer:update-points', ({ points }) => {
      useMeetingStore.getState().updatePeerPoints(points);
    });

    socket.on('user:activity-stats', ({ socketId, activityStats }) => {
      useMeetingStore.getState().updatePeerActivityStats(socketId, activityStats);
    });

    socket.on('user:violation-reason', ({ socketId, type, reason, timestamp }) => {
      useMeetingStore.getState().addPeerViolationHistory(socketId, { type, reason, timestamp });
    });

    socket.on('assignment:add', ({ assignment }) => {
      useMeetingStore.getState().addAssignment(assignment);
    });

    socket.on('assignment:delete', ({ assignmentId }) => {
      useMeetingStore.getState().removeAssignment(assignmentId);
    });

    socket.on('assignment:reorder', ({ assignments }) => {
      useMeetingStore.getState().updateAssignments(assignments);
    });

    socket.on('assignment:page', ({ index }) => {
      useMeetingStore.getState().setCurrentAssignmentIndex(index);
    });

    socket.on('quiz:started', ({ quiz }) => {
      console.log('MeetingPage: Received quiz:started event', quiz.title);
      useMeetingStore.getState().setActiveQuiz(quiz);
      playSoundCue('quiz');
    });

    socket.on('quiz:submitted', ({ response }) => {
      if (useMeetingStore.getState().isHost) {
        useMeetingStore.getState().upsertQuizResponse(response);
      }
    });

    socket.on('quiz:response-updated', ({ response }) => {
      if (useMeetingStore.getState().isHost && response) {
        useMeetingStore.getState().upsertQuizResponse(response);
      }
    });

    socket.on('quiz:questions-appended', ({ questions, timeLimit, endsAt }: any) => {
      const st = useMeetingStore.getState();
      if (!Array.isArray(questions) || questions.length === 0) return;
      st.appendActiveQuizQuestions(questions, { timeLimit, endsAt });
      playSoundCue('quiz');
      if (!st.isHost) {
        toast.info(`Giáo viên vừa bổ sung thêm ${questions.length} câu hỏi mới vào bài kiểm tra!`);
      }
    });

    socket.on('quiz:time-updated', ({ timeLimit, endsAt, addedSeconds }: any) => {
      useMeetingStore.getState().updateActiveQuizTime(timeLimit, endsAt);
      const mins = addedSeconds ? Math.round(addedSeconds / 60) : 0;
      toast.info(mins > 0 ? `Giáo viên vừa cộng thêm ${mins} phút làm bài!` : 'Thời gian làm bài vừa được gia hạn!');
    });

    socket.on('quiz:ended', () => {
      useMeetingStore.getState().setActiveQuiz(null);
      useMeetingStore.getState().setMyQuizSubmission(null);
    });

    // Adaptive Quiz events
    socket.on('adaptive:started', ({ session }) => {
      const store = useMeetingStore.getState();
      store.setActiveAdaptive(session);
      store.setActiveTab('quiz');
    });
    socket.on('adaptive:question', ({ question, questionIndex, endsAt }) => {
      useMeetingStore.getState().setAdaptiveCurrentQuestion(question, questionIndex, endsAt ?? null);
      playSoundCue('quiz');
    });
    socket.on('adaptive:answer-received', ({ count, total }) => {
      useMeetingStore.getState().setAdaptiveAnswerProgress({ count, total });
    });
    socket.on('adaptive:answer-confirmed', ({ isCorrect, correctAnswer, explanation }) => {
      useMeetingStore.getState().setAdaptiveMyAnswerResult(isCorrect, correctAnswer, explanation);
    });
    socket.on('adaptive:question-stats', ({ questionResult, scores }) => {
      const store = useMeetingStore.getState();
      store.addAdaptiveQuestionResult(questionResult);
      store.setAdaptiveScores(scores);
      store.setAdaptiveCurrentQuestion(null, store.adaptiveQuestionIndex);
    });
    socket.on('adaptive:ended', ({ rankings }) => {
      const store = useMeetingStore.getState();
      store.setAdaptiveRankings(rankings);
      store.setActiveAdaptive(null);
    });
    socket.on('adaptive:countdown', ({ seconds }) => {
      useMeetingStore.getState().setAdaptiveCountdown(seconds);
    });
    socket.on('adaptive:auto-next', () => {
      // Xử lý duy nhất 1 nơi ở MeetingPage để tránh AdaptiveQuizManager (sidebar + embedded) bắn trùng
      const st = useMeetingStore.getState();
      if (st.isHost && st.roomId && !st.adaptiveCurrentQuestion && st.adaptiveQuestionQueue.length > 0) {
        const next = st.adaptiveQuestionQueue[0];
        socket.emit('adaptive:push-question', {
          roomId: st.roomId,
          question: next,
          timeLimit: st.adaptiveTimeLimitSec || undefined,
        });
        st.shiftAdaptiveQueue();
      }
    });

    socket.on('room:deleted', () => {
      try {
        localStorage.removeItem('meet:lastRoom');
        localStorage.removeItem('meet:lastPass');
        (window as any).__meetKeepStream = null;
      } catch { /* noop */ }
      toast.warning('Phòng đã bị host xóa.');
      socket.disconnect();
      setTimeout(() => {
        reset();
        window.location.href = APP_BASE + '/';
      }, 900);
    });

    socket.on('room:hostChanged', ({ hostId }) => {
      const st = useMeetingStore.getState();
      st.setHostId(hostId);
      // Đồng bộ cờ host ngay (claim-host / giáo viên vào phòng / host rời đi)
      st.setIsHost(hostId === socket.id);
    });

    socket.on('assignment:rejected', ({ error }) => {
      toast.error(error || 'Bài tập bị từ chối (quá lớn)');
    });

    // Host tạo phòng nhóm / hẹn giờ / gọi về → tự động chuyển phòng
    socket.on('breakout:move', (payload: any) => {
      try {
        const st = useMeetingStore.getState();
        st.setIsBreakout(!!payload.isBreakout, payload.isBreakout ? (payload.parentId || null) : null);
        switchRoom(payload.roomId, payload.roomName);
      } catch (e) {
        console.warn('[brk] move fail', e);
      }
      // Overlay "đang chuyển phòng" cho tới khi roomId khớp
      if (payload?.roomId) {
        const target = payload.roomId;
        setMoveNotice(payload.roomName
          ? `Đang chuyển đến ${payload.roomName}…`
          : 'Đang chuyển phòng…');
        clearInterval(moveTimerRef.current);
        moveTimerRef.current = setInterval(() => {
          if (useMeetingStore.getState().roomId === target) {
            clearInterval(moveTimerRef.current);
            setMoveNotice(null);
          }
        }, 250);
        setTimeout(() => {
          clearInterval(moveTimerRef.current);
          setMoveNotice(null);
        }, 10000);
      }
    });

    // Hẹn giờ breakout đổi → đồng bộ đếm ngược cho mọi người (kể cả học sinh)
    socket.on('breakout:timer', ({ endsAt }: any) => {
      useMeetingStore.getState().setBreakoutEndsAt(endsAt ?? null);
    });

    // Học sinh trong nhóm bấm "Cần giúp đỡ" → host thấy toast + dot nhấp nháy trên Patrol Strip + âm báo
    socket.on('breakout:help', (d: any) => {
      if (d && d.roomId && d.roomName) {
        const alert = { roomName: d.roomName, name: d.name || 'Học sinh', at: Date.now() };
        setHelpToast({ roomId: d.roomId, ...alert });
        useMeetingStore.getState().addBreakoutHelpAlert(d.roomId, alert);
        if (useMeetingStore.getState().isHost) playSoundCue('help');
      }
    });

    socket.on('breakout:summary', (summary: any) => {
      useMeetingStore.getState().setBreakoutSummary(summary || null);
    });

    socket.on('breakout:closing', (payload: any) => {
      useMeetingStore.getState().setBreakoutClosing(payload?.endsAt ? payload : null);
    });

    socket.on('room:renamed', (d: any) => {
      const st = useMeetingStore.getState();
      if (typeof d?.roomId === 'string' && d.roomId === st.roomId && d.name) {
        st.setRoom(d.roomId, d.name, st.userName || '');
      }
    });

    socket.on('audio:allowed', (d: any) => {
      useMeetingStore.getState().setAudioState({
        mode: d?.mode,
        allowed: d?.allowed || [],
        hostFocus: d?.hostFocus,
        groups: d?.groups,
      });
    });

    socket.on('audio:forceMute', (d: any) => {
      const st = useMeetingStore.getState();
      sfuService.forceMuteLocalAudio();
      st.setMicEnabled(false);
      if (st.roomId) {
        socket.emit('peer:update-state', { roomId: st.roomId, state: { isMuted: true } });
      }
      toast.warning(`${d?.by || 'Giáo viên'} đã tắt mic của bạn`);
    });

    // ─── Giám sát thi cử ───
    socket.on('exam:state', (s: any) => {
      const st = useMeetingStore.getState();
      st.setExamMonitoring(!!s?.monitoring);
      st.setExamRequireShare(!!s?.requireShare);
      st.setExamPinnedScreenId(s?.pinnedScreenId || null);
      void sfuService.reconcileExamScreens();
    });
    socket.on('exam:requireShare', ({ active }: any) => {
      useMeetingStore.getState().setExamRequireShare(!!active);
    });
    socket.on('exam:pinnedScreen', ({ targetSocketId }: any) => {
      useMeetingStore.getState().setExamPinnedScreenId(targetSocketId || null);
      void sfuService.reconcileExamScreens();
    });
    socket.on('exam:shareStatus', ({ socketId, sharing, surface }: any) => {
      useMeetingStore.getState().setExamShareStatus(socketId, !!sharing, surface);
    });

    // Request chat history
    if (roomId) {
      socket.emit('chat:history', { roomId });
    }

    return () => {
      // Clear preview timer
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      socket.off('peer:joined');
      socket.off('peer:left');
      socket.off('chat:message');
      socket.off('chat:history');
      socket.off('peer:update-state');
      socket.off('code:sync');
      socket.off('code:response');
      socket.off('user:violation');
      socket.off('user:copy');
      socket.off('peer:update-points');
      socket.off('user:activity-stats');
      socket.off('user:violation-reason');
      socket.off('assignment:add');
      socket.off('assignment:delete');
      socket.off('assignment:reorder');
      socket.off('assignment:page');
      socket.off('quiz:started');
      socket.off('quiz:submitted');
      socket.off('quiz:ended');
      socket.off('adaptive:started');
      socket.off('adaptive:question');
      socket.off('adaptive:answer-received');
      socket.off('adaptive:answer-confirmed');
      socket.off('adaptive:question-stats');
      socket.off('adaptive:ended');
      socket.off('adaptive:countdown');
      socket.off('adaptive:auto-next');
      socket.off('room:hostChanged');
      socket.off('assignment:rejected');
      socket.off('breakout:move');
      socket.off('breakout:timer');
      socket.off('breakout:help');
      socket.off('breakout:summary');
      socket.off('breakout:closing');
      socket.off('room:renamed');
      socket.off('room:reaction');
      socket.off('quiz:questions-appended');
      socket.off('quiz:time-updated');
      socket.off('quiz:response-updated');
      socket.off('audio:allowed');
      socket.off('audio:forceMute');
      socket.off('exam:state');
      socket.off('exam:requireShare');
      socket.off('exam:pinnedScreen');
      socket.off('exam:shareStatus');
      socket.off('room:deleted');
      clearInterval(moveTimerRef.current);
    };
  }, [addPeer, removePeer, updatePeerState, updatePeerCode, removePeerCode]);

  // --- Proctoring: CHỈ đếm vi phạm gửi về host. ĐÃ BỎ modal "giải trình" —
  // học sinh bị làm phiền bởi hộp thoại bắt giải thích sau mỗi lần lỡ chuyển tab.
  const lastViolationEmitTime = useRef(0);

  useEffect(() => {
    if (!roomId) return;

    const handleViolation = (type: string) => {
      if (isHost) return;
      const st = useMeetingStore.getState();

      if (type !== 'external-paste') {
        // Không tính vi phạm focus-lost / tab-switch khi học sinh đang mở hộp thoại chọn màn hình getDisplayMedia()
        if (sfuService.isPickingScreen) return;
        // Chỉ ghi nhận vi phạm rời tab/cửa sổ khi đang giám sát thi hoặc đang làm bài kiểm tra / Adaptive Quiz
        if (!st.examMonitoring && !st.activeQuiz && !st.activeAdaptive) return;
      }

      const now = Date.now();
      // Chặn mọi violation gửi liên tiếp trong vòng 1s (trừ paste) để tránh x2/x3 do browser events
      if (type !== 'external-paste' && now - lastViolationEmitTime.current < 1000) return;
      if (type !== 'external-paste') lastViolationEmitTime.current = now;

      if (document.visibilityState === 'hidden' || !document.hasFocus()) {
        socket.emit('user:violation', { roomId, type });
      }
    };

    const handleCopy = () => {
      if (!isHost) {
        const text = window.getSelection()?.toString();
        // Chỉ lưu nếu có text thực sự (để tránh ghi đè nội dung từ Monaco nếu click ra ngoài)
        if (text && text.trim()) {
          (window as any)._lastInternalCopy = text;
        }
        // Kèm đoạn text (≤300 ký tự) để playback highlight mốc copy
        socket.emit('user:copy', { roomId, text: (text || '').slice(0, 300) });
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (isHost) return;

      const now = Date.now();
      const lastPaste = (window as any)._lastPasteTime || 0;
      if (now - lastPaste < 200) return;
      (window as any)._lastPasteTime = now;

      const pastedText = (e.clipboardData?.getData('text') || "");
      const internalCopy = ((window as any)._lastInternalCopy || "");

      const normalize = (s: string) => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

      if (pastedText.trim() && normalize(pastedText) !== normalize(internalCopy)) {
        socket.emit('user:violation', { roomId, type: 'external-paste', text: pastedText.slice(0, 300) });
        console.warn("External content paste detected");
      }
    };

const updateMyActiveState = (active: boolean) => {
      if (!roomId) return;
      socket.emit('peer:update-state', { roomId, state: { isActive: active } });
      const myId = socket.id;
      if (myId) updatePeerState(myId, { isActive: active });
    };

    const onVisibilityChange = () => {
      const active = document.visibilityState === 'visible';
      updateMyActiveState(active);

      if (document.visibilityState === 'hidden') {
        handleViolation('tab-switch');
      }
    };

    const onBlur = () => {
      // Click vào iframe xem PDF đề bài sẽ làm window mất focus nhưng vẫn đang xem bài trong lớp
      setTimeout(() => {
        if (document.activeElement?.tagName === 'IFRAME') return;
        updateMyActiveState(false);
        if (document.visibilityState === 'visible') {
          handleViolation('focus-lost');
        }
      }, 150);
    };

    const onFocus = () => {
      // Only set active true if tab is actually visible
      if (document.visibilityState === 'visible') {
        updateMyActiveState(true);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('copy', handleCopy as any);
    window.addEventListener('cut', handleCopy as any);
    window.addEventListener('paste', handlePaste as any);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('copy', handleCopy as any);
      window.removeEventListener('cut', handleCopy as any);
      window.removeEventListener('paste', handlePaste as any);
    };
  }, [roomId, isHost]);

  // Initial active state sync - separate from proctoring logic to avoid re-triggering
  useEffect(() => {
    if (roomId && socket.connected) {
      socket.emit('peer:update-state', { roomId, state: { isActive: true } });
    }
  }, [roomId]);

  const handleCopyLink = () => {
    const link = `${originUrl()}?room=${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = () => {
    try {
      localStorage.removeItem('meet:lastRoom');
      localStorage.removeItem('meet:lastPass');
      (window as any).__meetKeepStream = null;
    } catch { /* noop */ }
    socket.emit('room:leave', { roomId });
    socket.disconnect();
    reset();
    window.location.href = APP_BASE + '/';
  };

  /** Đòi quyền host: giáo viên CodeClass hoặc người tạo phòng (hostSecret) */
  const handleClaimHost = () => {
    const st = useMeetingStore.getState();
    if (st.isHost || st.hostId === socket.id) {
      toast.info('Bạn đang là host.');
      return;
    }
    const secret = getHostSecret(st.roomId) || getHostSecret(st.parentId);
    socket.emit('room:claim-host', {
      roomId: st.roomId,
      token: localStorage.getItem('token') || '',
      hostSecret: secret,
    }, (res: any) => {
      if (res && res.ok) {
        toast.success('Đã cấp quyền host — bạn có thể theo dõi và xem code học viên.');
      } else {
        toast.error((res && res.error) || 'Không đòi được quyền host');
      }
    });
  };

  const applyPreset = (preset: 'balanced' | 'code' | 'video') => {
    setLayoutPreset(preset);
    window.dispatchEvent(new CustomEvent('meet:layoutPreset', { detail: preset }));
    showActionHud(
      preset === 'video' ? '🎥 Bố cục ưu tiên Video' : preset === 'code' ? '💻 Bố cục ưu tiên Code' : '⚖️ Bố cục Cân bằng',
      'neutral',
    );
  };

  // ─── Phím tắt toàn cục (bỏ qua khi đang nhập liệu / trong Monaco Editor) ───
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return true;
      return Boolean(target.closest('.monaco-editor'));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const ui = useUiStore.getState();
      if (ui.dialog) return;

      if (e.key === 'Escape') {
        if (ui.shortcutsOpen) {
          ui.setShortcutsOpen(false);
          return;
        }
        const st = useMeetingStore.getState();
        if (st.activeTab) {
          st.setActiveTab(null);
          return;
        }
        if (showAssignmentManager) {
          setShowAssignmentManager(false);
        }
        return;
      }

      if (isTypingTarget(e.target)) return;

      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        ui.toggleShortcuts();
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'm') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('meet:toggleMic'));
        } else if (k === 'v') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('meet:toggleCam'));
        } else if (k === 'h') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('meet:toggleHand'));
        } else if (k === 'a') {
          const st = useMeetingStore.getState();
          if (st.isHost && st.roomId) {
            e.preventDefault();
            setAudioAll(st.roomId);
          }
        } else if (k === '1') {
          e.preventDefault();
          applyPreset('video');
        } else if (k === '2') {
          e.preventDefault();
          applyPreset('balanced');
        } else if (k === '3') {
          e.preventDefault();
          applyPreset('code');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showAssignmentManager]);

  // SFU mode: media đi qua mediasoup — không có LiveKit trong app.
  if (sfuEnabled) {
    return (
        <div className="h-screen bg-base text-white font-sans overflow-hidden flex flex-col">
          <ExamSharePrompt />
          {isHost && showMonitor && (
            <ExamMonitorOverlay onExit={() => { setShowMonitor(false); sessionStorage.removeItem('exam:monitorOpen'); }} />
          )}
          {/* Top bar — Grid 3 cột chống đè ở 1280px */}
          <header className="grid h-14 flex-none grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-line bg-raised px-4 z-40">
            {/* Left: Brand, Room Name, Connection Status, Breakout Pill */}
            <div className="flex min-w-0 items-center gap-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-ctl bg-accent text-sm font-extrabold text-accent-ink">C</div>
              <h2 className="min-w-0 max-w-[180px] truncate text-sm font-semibold text-white">
                {roomName || 'Cuộc họp học tập'}
              </h2>
              <span
                className={`hidden shrink-0 md:inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  isSocketConnected ? 'bg-ok/10 text-ok' : 'bg-warn/15 text-warn'
                }`}
                title={isSocketConnected ? 'Kết nối ổn định' : 'Đang kết nối lại tới server…'}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isSocketConnected ? 'bg-ok animate-pulse' : 'bg-warn animate-ping'}`} />
                {isSocketConnected ? 'Trực tiếp' : 'Đang nối lại'}
              </span>
              <span className="hidden shrink-0 sm:inline text-xs text-muted whitespace-nowrap">
                {peers.length + 1} người
              </span>
              {isBreakoutRoom && (() => {
                const ms = breakoutEndsAt ? breakoutEndsAt - breakoutNow : 0;
                const canReturn = Boolean(parentRoomId && (isHost || breakoutSummary?.allowSelfSelect));
                return (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-semibold text-accent whitespace-nowrap">
                    <CornerUpLeft size={11} />
                    {canReturn && parentRoomId ? (
                      <button
                        onClick={() => switchRoom(parentRoomId)}
                        className="hover:underline"
                        title="Về lớp chính"
                      >
                        Về lớp chính
                      </button>
                    ) : (
                      <span>Đang ở phòng nhóm</span>
                    )}
                    {breakoutEndsAt && ms > 0 && (
                      <span className="font-mono">
                        {String(Math.floor(ms / 60000)).padStart(2, '0')}:{String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}
                      </span>
                    )}
                    {!isHost && (
                      <button
                        onClick={sendQuickHelp}
                        className="ml-0.5 inline-flex items-center gap-1 rounded-full bg-warn/20 px-1.5 py-0.5 text-[10px] font-bold text-warn hover:bg-warn/30"
                        title="Gọi giáo viên vào nhóm giúp đỡ"
                      >
                        <LifeBuoy size={10} /> Cần giúp
                      </button>
                    )}
                  </span>
                );
              })()}
            </div>

            {/* Center: Media Controls */}
            <div className="justify-self-center">
              <SFUMediaControls onLeave={handleLeave} />
            </div>

            {/* Right: Audio Routing, Layout Preset, Self LP, Clock / Exam Countdown, Monitor / Claim Host */}
            <div className="flex min-w-0 items-center justify-end gap-2">
              <AudioRoutingControl />
              <div className="hidden lg:flex items-center rounded-ctl border border-line bg-base/70 p-0.5" title="Bố cục không gian làm việc">
                <button
                  onClick={() => applyPreset('video')}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors ${layoutPreset === 'video' ? 'bg-accent text-accent-ink' : 'text-muted hover:text-white'}`}
                  title="Ưu tiên Video (70/30)"
                >
                  <Video size={12} />
                </button>
                <button
                  onClick={() => applyPreset('balanced')}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors ${layoutPreset === 'balanced' ? 'bg-accent text-accent-ink' : 'text-muted hover:text-white'}`}
                  title="Cân bằng (50/50)"
                >
                  <Columns2 size={12} />
                </button>
                <button
                  onClick={() => applyPreset('code')}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors ${layoutPreset === 'code' ? 'bg-accent text-accent-ink' : 'text-muted hover:text-white'}`}
                  title="Ưu tiên Code (30/70)"
                >
                  <Code2 size={12} />
                </button>
              </div>

              {myPoints !== 0 && (
                <span
                  className={`hidden sm:inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${
                    myPoints > 0 ? 'bg-ok/15 text-ok' : 'bg-danger/15 text-danger'
                  }`}
                  title="Điểm tích lũy (LP) của bạn"
                >
                  {myPoints > 0 ? `+${myPoints}` : myPoints} LP
                </span>
              )}

              {activeQuiz ? (() => {
                const qc = getQuizClock(activeQuiz, breakoutNow);
                const label = qc.isTimed
                  ? qc.isExpired
                    ? 'Hết giờ'
                    : formatQuizClock(qc.remainingSec ?? 0)
                  : formatQuizClock(qc.elapsedSec);
                return (
                  <button
                    onClick={() => setActiveTab('quiz')}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold font-mono tabular-nums whitespace-nowrap transition-all active:scale-95 ${
                      qc.isExpired || qc.isUrgent
                        ? 'border-danger/50 bg-danger/15 text-danger animate-pulse'
                        : qc.isWarning
                          ? 'border-warn/50 bg-warn/15 text-warn'
                          : 'border-accent/40 bg-accent/15 text-accent hover:bg-accent/25'
                    }`}
                    title={`Đang thi: ${activeQuiz.title}${isHost ? ` · ${quizResponses.length} bài nộp` : ''} — Bấm để mở bảng Trắc nghiệm`}
                  >
                    <Clock size={11} />
                    <span>{label}</span>
                  </button>
                );
              })() : (
                <div className="hidden xl:flex shrink-0">
                  <DigitalClock />
                </div>
              )}

              {isHost && !showMonitor && (
                <button
                  onClick={() => {
                    setShowMonitor(true);
                    sessionStorage.setItem('exam:monitorOpen', '1');
                    setActiveTab(null);
                  }}
                  title={examMonitoring
                    ? 'Đang giám sát — bấm để mở lại bảng giám sát'
                    : 'Mở bảng giám sát thi toàn màn hình'}
                  className={`hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-ctl px-2.5 py-1.5 text-[11px] font-semibold transition-all sm:flex ${
                    examMonitoring
                      ? 'bg-warn/20 text-warn hover:bg-warn/30'
                      : 'bg-elevated text-white hover:bg-line'
                  }`}
                >
                  <MonitorUp size={13} />
                  {examMonitoring ? 'Đang giám sát' : 'Giám sát thi'}
                </button>
              )}

              {!isHost && (
                <button
                  onClick={handleClaimHost}
                  className="hidden shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted transition-all hover:border-accent hover:text-white md:flex"
                  title="Nhận lại quyền host (dành cho giáo viên CodeClass hoặc người tạo phòng)"
                >
                  <ShieldQuestion size={12} /> Nhận quyền host
                </button>
              )}
            </div>
          </header>

          {/* Host Quick Patrol Strip — đi tuần phòng nhóm 1 chạm */}
          {isHost && breakoutSummary && breakoutSummary.rooms.length > 0 && (
            <div className="anim-strip flex h-9 flex-none items-center gap-1.5 overflow-x-auto border-b border-line bg-raised/80 px-4 text-xs custom-scrollbar">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted mr-1">
                Phòng nhóm:
              </span>
              <button
                onClick={() => {
                  const targetMain = isBreakoutRoom ? parentRoomId : roomId;
                  if (targetMain && roomId !== targetMain) switchRoom(targetMain, 'Lớp chính');
                }}
                className={`inline-flex shrink-0 items-center gap-1 rounded-ctl px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  !isBreakoutRoom
                    ? 'bg-accent text-accent-ink shadow-sm'
                    : 'border border-line bg-base/60 text-muted hover:text-white hover:border-line-strong'
                }`}
              >
                Lớp chính
                <span className="rounded bg-black/20 px-1 text-[10px] font-mono">
                  {breakoutSummary.mainSize}
                </span>
              </button>
              {breakoutSummary.rooms.map((r) => {
                const active = roomId === r.id;
                const help = breakoutHelpAlerts[r.id];
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      useMeetingStore.getState().clearBreakoutHelpAlert(r.id);
                      if (!active) switchRoom(r.id, r.name);
                    }}
                    title={help ? `${help.name} đang cần giúp!` : `Vào ${r.name}`}
                    className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-ctl px-2.5 py-1 text-[11px] font-semibold transition-all ${
                      active
                        ? 'bg-warn text-black shadow-sm'
                        : help
                          ? 'border border-danger/60 bg-danger/15 text-white hover:bg-danger/25'
                          : 'border border-line bg-base/60 text-muted hover:text-white hover:border-line-strong'
                    }`}
                  >
                    {help && <span className="h-2 w-2 rounded-full bg-danger animate-ping" />}
                    <span className="max-w-[120px] truncate">{r.name}</span>
                    <span className="rounded bg-black/20 px-1 text-[10px] font-mono">{r.size}</span>
                  </button>
                );
              })}

              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                {breakoutClosing && breakoutClosing.endsAt > breakoutNow ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-danger/20 px-2.5 py-0.5 text-[10px] font-bold text-danger">
                    Đang gọi về ({Math.max(1, Math.ceil((breakoutClosing.endsAt - breakoutNow) / 1000))}s)
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      const mainTarget = parentRoomId || roomId;
                      socket.emit('breakout:recall', { roomId: mainTarget, graceSeconds: 30 }, (res: any) => {
                        if (res?.ok) toast.info('Đã báo đóng phòng — tự động gọi về sau 30 giây');
                        else toast.error(res?.error || 'Không gọi về được');
                      });
                    }}
                    className="inline-flex items-center gap-1 rounded-ctl bg-danger/15 px-2 py-1 text-[11px] font-semibold text-danger hover:bg-danger/25"
                    title="Báo trước 30s rồi gọi toàn bộ học sinh về lớp chính"
                  >
                    <PhoneCall size={11} /> Gọi về 30s
                  </button>
                )}
                <button
                  onClick={() => setActiveTab(activeTab === 'breakout' ? null : 'breakout')}
                  className="inline-flex items-center gap-1 rounded-ctl border border-line bg-base px-2 py-1 text-[11px] font-semibold text-muted hover:text-white"
                >
                  Quản lý
                </button>
              </div>
            </div>
          )}

          {/* Banner đếm ngược đóng phòng cho Học sinh (Grace period) */}
          {isBreakoutRoom && !isHost && breakoutClosing && breakoutClosing.endsAt > breakoutNow && (
            <div className="anim-strip flex flex-none items-center justify-between gap-3 border-b border-warn/40 bg-warn/15 px-4 py-1.5 text-xs text-warn">
              <span className="font-semibold">
                Giáo viên đang đóng phòng nhóm — tự động quay về lớp chính sau{' '}
                <strong className="font-mono text-white">
                  {Math.max(1, Math.ceil((breakoutClosing.endsAt - breakoutNow) / 1000))}s
                </strong>
              </span>
              {parentRoomId && (
                <button
                  onClick={() => switchRoom(parentRoomId, 'Lớp chính')}
                  className="rounded-ctl bg-warn px-2.5 py-1 text-[11px] font-bold text-black hover:brightness-110"
                >
                  Về lớp chính ngay
                </button>
              )}
            </div>
          )}

          {/* Main workspace + Docked Right Nav Rail */}
          <div className="flex flex-1 min-h-0 overflow-hidden relative">
            <div className="flex-1 min-w-0 h-full relative">
              <MeetingWorkspace onShowHistory={(socketId) => setSelectedHistorySocketId(socketId)} sfuMode={true} />
            </div>

            <aside className="w-14 flex-none border-l border-line bg-raised flex flex-col items-center py-2.5 gap-1.5 z-40 overflow-y-auto custom-scrollbar">
              {([
                { key: 'users', icon: Users, label: 'Thành viên' },
                ...(isHost || isBreakoutRoom || breakoutSummary?.allowSelfSelect
                  ? [{ key: 'breakout' as const, icon: LayoutGrid, label: 'Phòng nhóm', badge: Object.keys(breakoutHelpAlerts).length || undefined }]
                  : []),
                ...(isHost ? [{ key: 'exam' as const, icon: MonitorUp, label: 'Giám sát thi' }] : []),
                { key: 'chat', icon: MessageSquare, label: 'Trò chuyện', badge: unreadMessageCount },
                { key: 'ai', icon: Bot, label: 'Trợ lý AI' },
                { key: 'quiz', icon: HelpCircle, label: 'Trắc nghiệm' },
                { key: 'stats', icon: Activity, label: 'Hiệu năng' },
                { key: 'music', icon: Music, label: 'Âm nhạc' },
                { key: 'info', icon: Info, label: 'Thông tin' },
              ] as { key: 'users'|'breakout'|'exam'|'chat'|'ai'|'quiz'|'stats'|'music'|'info'; icon: typeof Users; label: string; badge?: number }[]).map(({ key, icon: Icon, label, badge }) => {
                const active = activeTab === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (key === 'exam') {
                        setShowMonitor(true);
                        sessionStorage.setItem('exam:monitorOpen', '1');
                        setActiveTab(null);
                        return;
                      }
                      setActiveTab(active ? null : key);
                    }}
                    title={label}
                    className={[
                      'relative grid h-10 w-10 shrink-0 place-items-center rounded-ctl transition-all active:scale-95',
                      active ? 'bg-accent text-accent-ink shadow-sm' : 'text-muted hover:bg-line hover:text-white',
                    ].join(' ')}
                  >
                    <Icon size={18} />
                    {key === 'quiz' && activeQuiz && !active && (
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-ok animate-pulse ring-2 ring-raised" />
                    )}
                    {badge ? (
                      <span
                        key={badge}
                        className="anim-badge-pop absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white"
                      >
                        {badge > 9 ? '9+' : badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {isHost && (
                <>
                  <div className="my-0.5 h-px w-7 bg-line" />
                  <button
                    onClick={() => setShowAssignmentManager((v) => !v)}
                    title="Đề bài / quản lý bài tập"
                    className={[
                      'grid h-10 w-10 shrink-0 place-items-center rounded-ctl transition-all active:scale-95',
                      showAssignmentManager ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-line hover:text-white',
                    ].join(' ')}
                  >
                    <ClipboardList size={18} />
                  </button>
                </>
              )}
              <button
                onClick={() => useUiStore.getState().toggleShortcuts()}
                title="Phím tắt nhanh (Shift+?)"
                className="mt-auto grid h-10 w-10 shrink-0 place-items-center rounded-ctl text-muted transition-all hover:bg-line hover:text-white active:scale-95"
              >
                <Keyboard size={17} />
              </button>
            </aside>
          </div>

          {/* Sidebar (Users/Info/Stats/Chat/AI/Quiz) — tái sử dụng đúng như LiveKit mode */}
          {activeTab === 'users' && (
            <SidebarTemplate
              title="Danh sách thành viên"
              icon={Users}
              onClose={() => setActiveTab(null)}
            >
              <SFUUserList onShowHistory={(id) => { setSelectedHistorySocketId(id); setActiveTab(null); }} />
            </SidebarTemplate>
          )}

          {activeTab === 'breakout' && (
            <SidebarTemplate
              title="Phòng nhóm"
              icon={LayoutGrid}
              onClose={() => setActiveTab(null)}
              width="w-[360px]"
            >
              <BreakoutPanel />
            </SidebarTemplate>
          )}

          {activeTab === 'info' && (
            <SidebarTemplate
              title="Thông tin cuộc họp"
              icon={Info}
              onClose={() => setActiveTab(null)}
            >
              <RoomInfo roomId={roomId || ''} roomName={roomName || ''} handleCopyLink={handleCopyLink} copied={copied} />
              <DeleteRoomPanel />
            </SidebarTemplate>
          )}

          {activeTab === 'chat' && (
            <SidebarTemplate
              title="Trò chuyện"
              icon={MessageSquare}
              onClose={() => setActiveTab(null)}
              width="w-96"
            >
              <CustomChat />
            </SidebarTemplate>
          )}

          {activeTab === 'ai' && (
            <SidebarTemplate
              title="Trợ lý AI Pro"
              icon={Bot}
              onClose={() => setActiveTab(null)}
              width="w-[450px]"
            >
              <AIAssistant />
            </SidebarTemplate>
          )}

          {activeTab === 'quiz' && (
            <SidebarTemplate
              title="Trắc nghiệm trực tuyến"
              icon={HelpCircle}
              onClose={() => setActiveTab(null)}
              width="w-[450px]"
            >
              <QuizManager />
            </SidebarTemplate>
          )}

          {activeTab === 'stats' && (
          <SidebarTemplate
            title="Trạng thái hệ thống"
            icon={Activity}
            onClose={() => setActiveTab(null)}
          >
            <SFURoomStats />
          </SidebarTemplate>
        )}

        {activeTab === 'music' && (
            <MusicPoll onClose={() => setActiveTab(null)} />
          )}

          {showPeerViewer && <PeerCodeViewer onClose={() => setShowPeerViewer(false)} />}

          <AssignmentManager
            visible={showAssignmentManager}
            onClose={() => setShowAssignmentManager(false)}
            roomId={roomId || ''}
          />

          {/* Chat notification popup */}
          {lastMessagePreview && activeTab !== 'chat' && (
            <div
              onClick={() => { useMeetingStore.getState().setActiveTab('chat'); setLastMessagePreview(null); }}
              className="anim-popover fixed bottom-6 right-[4.5rem] z-50 w-80 bg-overlay/95 backdrop-blur border border-line-strong rounded-2xl p-3.5 shadow-modal cursor-pointer hover:border-accent/50 transition-all"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-white truncate">{lastMessagePreview.senderName}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-gray-500 italic">vừa xong</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setLastMessagePreview(null); }}
                    className="rounded p-0.5 text-muted hover:bg-line hover:text-white"
                    aria-label="Đóng xem trước tin nhắn"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed font-medium">
                {lastMessagePreview.text}
              </p>
            </div>
          )}

          {/* Modal giải trình vi phạm: ĐÃ BỎ theo yêu cầu — hệ thống vẫn đếm
              vi phạm cho host nhìn, nhưng học sinh không bị bắt giải thích nữa. */}


          <MusicPlayer />

          {/* Biểu cảm thả nổi & Bảng tra cứu phím tắt */}
          <FloatingReactionsOverlay />
          <ShortcutHelpModal />

          {/* Overlay chuyển phòng nhóm */}
          {moveNotice && (
            <div className="anim-backdrop fixed inset-0 z-[250] flex flex-col items-center justify-center gap-4 bg-black/85 backdrop-blur-sm">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="text-sm font-semibold text-white">{moveNotice}</p>
            </div>
          )}

          {/* Toast "học sinh cần giúp" — host */}
          {helpToast && isHost && (
            <div className="anim-popover fixed bottom-24 right-[4.5rem] z-[215] w-80 rounded-panel border border-danger/40 bg-overlay/95 backdrop-blur p-3 shadow-modal">
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white">
                  🆘 {helpToast.name} cần giúp
                </p>
                <button
                  onClick={() => setHelpToast(null)}
                  className="text-muted hover:text-white"
                >
                  ✕
                </button>
              </div>
              <p className="mb-2 text-xs text-muted">Trong {helpToast.roomName}</p>
              <button
                onClick={() => {
                  useMeetingStore.getState().clearBreakoutHelpAlert(helpToast.roomId);
                  switchRoom(helpToast.roomId, helpToast.roomName);
                  setHelpToast(null);
                }}
                className="w-full rounded-ctl bg-accent px-3 py-1.5 text-xs font-bold text-accent-ink transition-all hover:brightness-110 active:scale-95"
              >
                Tới nhóm ngay
              </button>
            </div>
          )}

          {/* Overlay phát lại quá trình code (mở từ nút ▶ ở danh sách thành viên) */}
          <MeetPlaybackPlugin />
      </div>
    );
  }

  return null;
};

export default MeetingPage;