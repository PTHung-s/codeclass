import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { socket } from '../services/socket';
import { apiUrl } from '../services/apiBase';
import { getHostSecret } from '../lib/roomState';
import { toast, uiConfirm } from '../store/useUiStore';
import {
  Zap,
  Play,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Award,
  Plus,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Trophy,
  X,
  SkipForward,
  Clock,
  Eye,
  ArrowUp,
  ArrowDown,
  Check,
  Edit3,
} from 'lucide-react';
import type { AdaptiveTopicSuggestion, QuizDifficulty, QuizQuestion } from '../types/quiz';
import QuizMarkdown from './QuizMarkdown';

type CreatorView = 'closed' | 'recommend' | 'pick-version' | 'manual-add';

const ADAPTIVE_TIME_OPTIONS = [
  { value: 0, label: 'Tự do' },
  { value: 30, label: '30s' },
  { value: 45, label: '45s' },
  { value: 60, label: '60s' },
  { value: 90, label: '90s' },
];

const DIFF_LABELS: Record<string, string> = {
  easy: 'Dễ',
  medium: 'TB',
  hard: 'Khó',
};

const MEDALS = ['🥇', '🥈', '🥉'];

const AdaptiveQuizManager: React.FC<{ onBack: () => void; embedded?: boolean }> = ({ onBack, embedded }) => {
  const {
    activeAdaptive,
    adaptiveCurrentQuestion,
    adaptiveQuestionEndsAt,
    adaptiveTimeLimitSec,
    setAdaptiveTimeLimitSec,
    adaptiveQuestionIndex,
    adaptiveAnswerProgress,
    adaptiveQuestionResults,
    adaptiveScores,
    adaptiveRankings,
    adaptiveCountdown,
    adaptiveQuestionQueue: questionQueue,
    addToAdaptiveQueue,
    removeFromAdaptiveQueue,
    reorderAdaptiveQueue,
    updateAdaptiveQueueItem,
    shiftAdaptiveQueue,
    roomId,
    parentId,
    selectedLanguage,
    resetAdaptive,
  } = useMeetingStore();

  const [started, setStarted] = useState(!!activeAdaptive);
  const [title, setTitle] = useState('');
  const [creatorView, setCreatorView] = useState<CreatorView>('closed');

  // AI recommend & generate state
  const [isRecommending, setIsRecommending] = useState(false);
  const [recommendedTopics, setRecommendedTopics] = useState<AdaptiveTopicSuggestion[] | null>(null);
  const [topicHint, setTopicHint] = useState('');
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('mixed');
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [generatedVersions, setGeneratedVersions] = useState<{ versionA: QuizQuestion[]; versionB: QuizQuestion[] } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingPreviewId, setEditingPreviewId] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState('');

  // Preview & sửa nhanh các câu trong hàng đợi Adaptive
  const [expandedQueueIds, setExpandedQueueIds] = useState<Set<string>>(new Set());
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [showLiveQPreview, setShowLiveQPreview] = useState(true);
  const [viewedResultIdx, setViewedResultIdx] = useState<number | null>(null);

  useEffect(() => {
    setViewedResultIdx(null);
  }, [adaptiveQuestionResults.length]);

  const toggleExpandQueueItem = (id: string) => {
    setExpandedQueueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (editingQueueId === id) setEditingQueueId(null);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleExpandAllQueue = () => {
    if (questionQueue.length === 0) return;
    const allOpen = questionQueue.every((q) => expandedQueueIds.has(q.id));
    if (allOpen) {
      setExpandedQueueIds(new Set());
      setEditingQueueId(null);
    } else {
      setExpandedQueueIds(new Set(questionQueue.map((q) => q.id)));
    }
  };

  // Manual add state
  const [manualQuestion, setManualQuestion] = useState<Partial<QuizQuestion>>({
    question: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    explanation: '',
  });

  // Countdown timers
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [qTimeLeft, setQTimeLeft] = useState<number | null>(null);

  const sortedScores = useMemo(
    () => [...adaptiveScores].sort((a, b) => b.score - a.score),
    [adaptiveScores],
  );

  const lastResult = adaptiveQuestionResults.length > 0 ? adaptiveQuestionResults[adaptiveQuestionResults.length - 1] : null;
  const isWaitingAnswers = !!adaptiveCurrentQuestion;

  useEffect(() => {
    if (adaptiveCountdown > 0) {
      setCountdown(adaptiveCountdown);
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setCountdown(0);
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [adaptiveCountdown]);

  useEffect(() => {
    if (!adaptiveCurrentQuestion || !adaptiveQuestionEndsAt) {
      setQTimeLeft(null);
      return;
    }
    const tick = () => setQTimeLeft(Math.max(0, Math.ceil((adaptiveQuestionEndsAt - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [adaptiveCurrentQuestion, adaptiveQuestionEndsAt]);

  const handleStart = () => {
    if (!title.trim() || !roomId) return;
    socket.emit('adaptive:start', { roomId, title: title.trim() }, (res: any) => {
      if (res?.ok) setStarted(true);
    });
  };

  const handleEnd = async () => {
    if (!(await uiConfirm('Kết thúc phiên adaptive? Sẽ tính điểm xếp hạng và cộng LP.', { title: 'Kết thúc phiên', danger: true }))) return;
    if (roomId) {
      socket.emit('adaptive:end', { roomId }, () => {
        setStarted(false);
      });
    }
  };

  const pushQuestionNow = (q: QuizQuestion) => {
    if (!roomId || isWaitingAnswers) return;
    socket.emit('adaptive:skip-countdown', { roomId });
    socket.emit('adaptive:push-question', {
      roomId,
      question: q,
      timeLimit: adaptiveTimeLimitSec || undefined,
    });
  };

  const handlePushNext = () => {
    if (questionQueue.length === 0 || !roomId || isWaitingAnswers) return;
    const next = questionQueue[0];
    pushQuestionNow(next);
    shiftAdaptiveQueue();
  };

  const handlePushSpecificFromQueue = (q: QuizQuestion) => {
    if (!roomId || isWaitingAnswers) {
      toast.info('Đang có câu hỏi mở — hãy chốt câu hiện tại trước khi phát câu mới.');
      return;
    }
    pushQuestionNow(q);
    removeFromAdaptiveQueue(q.id);
    if (editingQueueId === q.id) setEditingQueueId(null);
    toast.success('Đã phát trực tiếp câu hỏi đã chọn cho cả lớp!');
  };

  const handleForceReveal = () => {
    if (!roomId || !isWaitingAnswers) return;
    socket.emit('adaptive:force-reveal', { roomId }, (res: any) => {
      if (res?.ok) toast.info('Đã chốt câu và công bố đáp án cho lớp.');
      else toast.error(res?.error || 'Không chốt được câu');
    });
  };

  const handleSkipCountdown = () => {
    if (roomId) socket.emit('adaptive:skip-countdown', { roomId });
  };

  const handleRecommend = async () => {
    setIsRecommending(true);
    setRecommendedTopics(null);
    try {
      const tk = localStorage.getItem('token') || '';
      const hostSecret = getHostSecret(roomId) || getHostSecret(parentId);
      const res = await fetch(apiUrl('/api/ai/adaptive-recommend'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tk ? { Authorization: 'Bearer ' + tk } : {}),
        },
        body: JSON.stringify({
          questionHistory: adaptiveQuestionResults,
          topic: topicHint || activeAdaptive?.title || '',
          language: selectedLanguage?.name || 'python',
          roomId,
          hostSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || `Không gọi được AI gợi ý (${res.status})`);
        return;
      }
      if (Array.isArray(data.topics)) {
        setRecommendedTopics(data.topics);
        setCreatorView('recommend');
      }
    } catch (e) {
      console.error('AI recommend failed:', e);
      toast.error('Không gọi được AI gợi ý');
    } finally {
      setIsRecommending(false);
    }
  };

  const handlePickTopic = async (topic: string, suggestedDiff?: QuizDifficulty) => {
    setSelectedTopic(topic);
    setIsGeneratingQuestions(true);
    setGeneratedVersions(null);
    setSelectedIds(new Set());
    setEditingPreviewId(null);
    const effDiff = difficulty === 'mixed' && suggestedDiff ? suggestedDiff : difficulty;
    try {
      const tk = localStorage.getItem('token') || '';
      const hostSecret = getHostSecret(roomId) || getHostSecret(parentId);
      const res = await fetch(apiUrl('/api/ai/adaptive-generate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tk ? { Authorization: 'Bearer ' + tk } : {}),
        },
        body: JSON.stringify({
          topic,
          difficulty: effDiff,
          language: selectedLanguage?.name || 'python',
          questionHistory: adaptiveQuestionResults,
          existingQueue: questionQueue.map((q) => q.question),
          roomId,
          hostSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || `Không tạo được câu hỏi (${res.status})`);
        return;
      }
      if (Array.isArray(data.versionA) || Array.isArray(data.versionB)) {
        const vA: QuizQuestion[] = data.versionA || [];
        const vB: QuizQuestion[] = data.versionB || [];
        setGeneratedVersions({ versionA: vA, versionB: vB });
        setSelectedIds(new Set(vA.map((q) => q.id)));
        setCreatorView('pick-version');
      }
    } catch (e) {
      console.error('AI generate failed:', e);
      toast.error('Không tạo được câu hỏi');
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  const toggleSelectQuestion = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectGroup = (group: 'A' | 'B') => {
    if (!generatedVersions) return;
    const target = group === 'A' ? generatedVersions.versionA : generatedVersions.versionB;
    setSelectedIds(new Set(target.map((q) => q.id)));
  };

  const updateGeneratedQuestion = (updated: QuizQuestion) => {
    setGeneratedVersions((prev) => {
      if (!prev) return prev;
      return {
        versionA: prev.versionA.map((q) => (q.id === updated.id ? updated : q)),
        versionB: prev.versionB.map((q) => (q.id === updated.id ? updated : q)),
      };
    });
  };

  const handleAddSelectedToQueue = () => {
    if (!generatedVersions) return;
    const all = [...generatedVersions.versionA, ...generatedVersions.versionB];
    const picked = all.filter((q) => selectedIds.has(q.id));
    if (picked.length === 0) {
      toast.warning('Chọn ít nhất 1 câu hỏi để thêm vào hàng đợi.');
      return;
    }
    addToAdaptiveQueue(picked);
    toast.success(`Đã thêm ${picked.length} câu vào hàng đợi.`);
    setGeneratedVersions(null);
    setRecommendedTopics(null);
    setCreatorView('closed');
  };

  const handlePushGeneratedNow = (q: QuizQuestion) => {
    if (isWaitingAnswers) {
      toast.info('Đang có câu hỏi mở — hãy chốt câu hiện tại trước khi phát câu mới.');
      return;
    }
    pushQuestionNow(q);
    setGeneratedVersions(null);
    setRecommendedTopics(null);
    setCreatorView('closed');
    toast.success('Đã phát trực tiếp câu hỏi cho cả lớp!');
  };

  const handleAddManualQuestion = () => {
    if (!manualQuestion.question?.trim()) return;
    const q: QuizQuestion = {
      ...(manualQuestion as QuizQuestion),
      id: Math.random().toString(36).slice(2, 11),
    };
    addToAdaptiveQueue([q]);
    setManualQuestion({ question: '', options: ['', '', '', ''], correctAnswer: 0, explanation: '' });
    setCreatorView('closed');
    toast.success('Đã thêm câu thủ công vào hàng đợi.');
  };

  /** AI tạo nhanh nguyên bộ 5 câu vào hàng đợi Adaptive trong 1 chạm */
  const handleBatchGenerateToQueue = async () => {
    const targetTopic = topicHint.trim() || activeAdaptive?.title || '';
    if (!targetTopic) {
      toast.warning('Nhập chủ đề muốn tạo bộ câu hỏi.');
      return;
    }
    setIsBatchGenerating(true);
    try {
      const tk = localStorage.getItem('token') || '';
      const hostSecret = getHostSecret(roomId) || getHostSecret(parentId);
      const existing = [
        ...adaptiveQuestionResults.map((r) => r.question.question),
        ...questionQueue.map((q) => q.question),
      ];
      const res = await fetch(apiUrl('/api/ai/generate-quiz'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tk ? { Authorization: 'Bearer ' + tk } : {}),
        },
        body: JSON.stringify({
          topic: targetTopic,
          count: 5,
          difficulty,
          questionType: 'mixed',
          language: selectedLanguage?.name || 'python',
          context: existing,
          roomId,
          hostSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.questions) || data.questions.length === 0) {
        toast.error(data?.error || 'Không tạo được bộ câu hỏi AI');
        return;
      }
      const nextQs: QuizQuestion[] = data.questions.map((q: any) => ({
        ...q,
        id: q.id || Math.random().toString(36).slice(2, 11),
      }));
      addToAdaptiveQueue(nextQs);
      if (nextQs[0]) {
        setExpandedQueueIds((prev) => {
          const next = new Set(prev);
          next.add(nextQs[0].id);
          return next;
        });
      }
      setCreatorView('closed');
      toast.success(`Đã tạo nhanh bộ ${nextQs.length} câu vào hàng đợi Adaptive!`);
    } catch {
      toast.error('Lỗi kết nối khi tạo bộ câu hỏi AI');
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const computeDistribution = (res: typeof lastResult) => {
    if (!res) return [0, 0, 0, 0];
    if (Array.isArray(res.distribution) && res.distribution.length >= 4) return res.distribution.slice(0, 4);
    const dist = [0, 0, 0, 0];
    for (const r of res.results) {
      if (r.selectedOption >= 0 && r.selectedOption < 4) dist[r.selectedOption]++;
    }
    return dist;
  };

  // Final rankings display
  if (!activeAdaptive && adaptiveRankings) {
    const totalDone = adaptiveQuestionResults.length;
    return (
      <div className="flex flex-col h-full bg-raised text-white overflow-hidden font-sans border-l border-line">
        <div className="flex items-center justify-between px-4 py-3 bg-overlay/80 border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <Trophy size={15} className="text-accent" />
            <h2 className="text-xs font-bold text-white">Bảng xếp hạng chung cuộc</h2>
          </div>
          <div className="flex items-center gap-2">
            {totalDone > 0 && (
              <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold text-muted">
                {totalDone} câu
              </span>
            )}
            <button
              onClick={() => {
                resetAdaptive();
                onBack();
              }}
              className="text-xs font-semibold text-muted hover:text-white px-2 py-1 rounded-ctl hover:bg-line"
            >
              Đóng
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
          {adaptiveRankings.map((r, i) => {
            const pct = totalDone > 0 ? Math.round((r.score / totalDone) * 100) : null;
            return (
              <div
                key={r.socketId}
                className={`px-4 py-3 rounded-card border space-y-1.5 ${
                  i === 0 ? 'bg-accent/15 border-accent/40' : i === 1 ? 'bg-overlay border-line-strong' : 'bg-overlay/60 border-line'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-7 text-center text-base font-bold shrink-0">
                      {i < 3 ? MEDALS[i] : <span className="text-xs text-muted">#{i + 1}</span>}
                    </span>
                    <span className="text-sm font-bold text-white truncate">{r.userName}</span>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <span className="text-lg font-extrabold text-accent">
                      {totalDone > 0 ? `${r.score}/${totalDone}` : r.score}
                      {totalDone === 0 && <span className="text-xs font-medium text-muted ml-1">đ</span>}
                    </span>
                    {pct !== null && <span className="ml-1.5 text-xs font-semibold text-muted">({pct}%)</span>}
                  </div>
                </div>
                {pct !== null && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-base">
                    <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Setup view
  if (!started && !activeAdaptive) {
    return (
      <div className="flex flex-col h-full bg-raised text-white overflow-hidden font-sans border-l border-line">
        <div className="flex items-center justify-between px-4 py-3 bg-overlay/80 border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-purple-400 fill-purple-400" />
            <h2 className="text-xs font-bold text-white">Adaptive Quiz</h2>
          </div>
          <button onClick={onBack} className="text-xs font-semibold text-muted hover:text-white px-2 py-1 rounded-ctl hover:bg-line">
            Quay lại
          </button>
        </div>
        <div className="flex-1 p-6 flex flex-col items-center justify-center space-y-6">
          <div className="relative">
            <div className="absolute -inset-4 rounded-full bg-purple-500/15 blur-2xl" />
            <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-purple-500/35 bg-gradient-to-br from-purple-500/20 to-overlay text-purple-300 shadow-lg">
              <Zap size={28} />
            </div>
          </div>

          <div className="text-center space-y-1.5 max-w-xs">
            <h3 className="text-base font-extrabold text-white">Adaptive Quiz thời gian thực</h3>
            <p className="text-xs text-muted leading-relaxed">
              Phát từng câu có hẹn giờ chống treo lớp; AI phân tích chính xác đáp án sai phổ biến để gợi ý câu hỏi kế tiếp.
            </p>
          </div>

          <div className="w-full max-w-xs space-y-3.5 rounded-card border border-line bg-overlay/70 p-4">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted">Tên phiên</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleStart();
                }}
                placeholder="VD: Ôn tập vòng lặp Python..."
                className="w-full bg-base/80 border border-line rounded-ctl px-3.5 py-2.5 text-xs font-semibold text-white focus:outline-none focus:border-accent"
              />
            </div>

            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                <Clock size={12} className="text-accent" /> Thời gian mỗi câu
              </span>
              <div className="grid grid-cols-5 gap-1 rounded-ctl border border-line bg-base/80 p-1">
                {ADAPTIVE_TIME_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setAdaptiveTimeLimitSec(o.value)}
                    className={`rounded-md py-1 text-[11px] font-semibold transition-all ${
                      adaptiveTimeLimitSec === o.value
                        ? 'bg-accent text-accent-ink shadow-sm'
                        : 'text-muted hover:text-white'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleStart}
              disabled={!title.trim()}
              className="w-full py-2.5 bg-accent hover:brightness-110 active:scale-[0.98] disabled:bg-elevated disabled:text-muted text-accent-ink rounded-xl text-xs font-bold shadow-lg shadow-accent/15 transition-all flex items-center justify-center gap-1.5"
            >
              <Play size={14} /> Bắt đầu phiên Adaptive
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQ = adaptiveCurrentQuestion;
  const activeResultIdx =
    adaptiveQuestionResults.length === 0
      ? -1
      : viewedResultIdx !== null && viewedResultIdx >= 0 && viewedResultIdx < adaptiveQuestionResults.length
        ? viewedResultIdx
        : adaptiveQuestionResults.length - 1;
  const viewedResult = activeResultIdx >= 0 ? adaptiveQuestionResults[activeResultIdx] : null;
  const timerPct =
    qTimeLeft !== null && adaptiveTimeLimitSec > 0
      ? Math.min(100, Math.max(0, Math.round((qTimeLeft / adaptiveTimeLimitSec) * 100)))
      : null;

  const renderWaitingBox = () => (
    <div className="p-3.5 bg-gradient-to-br from-accent/12 via-overlay to-overlay border border-accent/30 rounded-card space-y-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-accent">Câu {adaptiveQuestionIndex} · Đang chờ trả lời</p>
        {qTimeLeft !== null && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums ${
              qTimeLeft <= 10 ? 'bg-danger/20 text-danger animate-pulse' : 'bg-base/80 text-accent'
            }`}
          >
            <Clock size={11} /> {qTimeLeft}s
          </span>
        )}
      </div>

      {timerPct !== null && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-base/80">
          <div
            className={`h-full transition-all duration-500 ${qTimeLeft !== null && qTimeLeft <= 10 ? 'bg-danger' : 'bg-accent'}`}
            style={{ width: `${timerPct}%` }}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-base rounded-full overflow-hidden">
          <div
            className="h-full bg-ok transition-all duration-500 rounded-full"
            style={{
              width: `${adaptiveAnswerProgress.total > 0 ? (adaptiveAnswerProgress.count / adaptiveAnswerProgress.total) * 100 : 0}%`,
            }}
          />
        </div>
        <span className="text-xs font-bold text-white tabular-nums">
          {adaptiveAnswerProgress.count}/{adaptiveAnswerProgress.total} đã nộp
        </span>
      </div>

      <button
        onClick={handleForceReveal}
        className="w-full py-2 rounded-ctl border border-warn/45 bg-warn/15 text-warn hover:bg-warn/25 active:scale-[0.98] text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
        title="Kết thúc câu này ngay lập tức và công bố đáp án"
      >
        <Eye size={13} /> Chốt câu & công bố ngay
      </button>

      {/* Xem trước câu hỏi đang phát ngay trong sidebar */}
      {!embedded && currentQ && (
        <div className="rounded-xl border border-line bg-base/75 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowLiveQPreview((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-bold text-gray-200 hover:bg-overlay/60 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Eye size={12} className="text-accent" /> Nội dung câu đang chiếu
            </span>
            {showLiveQPreview ? <ChevronUp size={13} className="text-muted" /> : <ChevronDown size={13} className="text-muted" />}
          </button>
          {showLiveQPreview && (
            <div className="border-t border-line/70 p-3 space-y-2.5">
              <div className="text-xs font-semibold text-white leading-relaxed">
                <QuizMarkdown content={currentQ.question} />
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {currentQ.options.map((opt, oIdx) => {
                  const isRight = oIdx === currentQ.correctAnswer;
                  return (
                    <div
                      key={oIdx}
                      className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                        isRight
                          ? 'border-emerald-500/40 bg-emerald-500/12 text-emerald-300 font-semibold'
                          : 'border-line/70 bg-raised text-gray-300'
                      }`}
                    >
                      <span className="font-bold shrink-0">{String.fromCharCode(65 + oIdx)}.</span>
                      <span className="flex-1 min-w-0">
                        <QuizMarkdown content={opt} inline />
                      </span>
                      {isRight && <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />}
                    </div>
                  );
                })}
              </div>
              {currentQ.explanation && (
                <div className="rounded-lg border-l-2 border-accent bg-overlay/70 px-2.5 py-1.5 text-[11px] text-gray-300">
                  <span className="font-bold text-accent">Giải thích: </span>
                  <QuizMarkdown content={currentQ.explanation} inline />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderLastResultBox = () => {
    if (!viewedResult || isWaitingAnswers) return null;

    const totalDone = adaptiveQuestionResults.length;
    const dist = computeDistribution(viewedResult);
    const correctIdx = typeof viewedResult.question.correctAnswer === 'number' ? viewedResult.question.correctAnswer : -1;
    const accuracyPct =
      viewedResult.totalCount > 0 ? Math.round((viewedResult.correctCount / viewedResult.totalCount) * 100) : 0;

    // Gộp bảng điểm tích lũy + lựa chọn ở câu đang xem cho từng học viên
    const studentRows = (() => {
      const byId = new Map<
        string,
        { socketId: string; userName: string; score: number; selectedOption?: number; isCorrect?: boolean }
      >();
      for (const s of sortedScores) {
        byId.set(s.socketId, { socketId: s.socketId, userName: s.userName, score: s.score });
      }
      for (const r of viewedResult.results) {
        const prev = byId.get(r.socketId);
        byId.set(r.socketId, {
          socketId: r.socketId,
          userName: prev?.userName || r.userName,
          score: prev?.score ?? (r.isCorrect ? 1 : 0),
          selectedOption: r.selectedOption,
          isCorrect: r.isCorrect,
        });
      }
      return Array.from(byId.values()).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return Number(!!b.isCorrect) - Number(!!a.isCorrect);
      });
    })();

    return (
      <div className="space-y-3">
        {/* Thẻ công bố câu hỏi + đáp án đúng + phân bố cả lớp */}
        <div className="p-3.5 bg-overlay border border-emerald-500/35 rounded-card space-y-3 shadow-sm">
          {totalDone > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
              {adaptiveQuestionResults.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setViewedResultIdx(idx)}
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-all ${
                    idx === activeResultIdx
                      ? 'bg-accent text-accent-ink shadow-sm'
                      : 'border border-line bg-raised text-muted hover:text-white'
                  }`}
                >
                  Câu {idx + 1}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
              <span className="text-xs font-bold text-white truncate">
                Công bố đáp án · Câu {activeResultIdx + 1}
              </span>
              {viewedResult.forced ? (
                <span className="shrink-0 rounded bg-elevated px-1.5 py-0.5 text-[9px] font-semibold text-muted">
                  Đã chốt
                </span>
              ) : null}
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${
                viewedResult.totalCount === 0
                  ? 'bg-elevated text-muted'
                  : accuracyPct >= 70
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : accuracyPct >= 40
                      ? 'bg-accent/15 text-accent'
                      : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {viewedResult.correctCount}/{viewedResult.totalCount} đúng
              {viewedResult.totalCount > 0 ? ` (${accuracyPct}%)` : ''}
            </span>
          </div>

          {/* Đề bài đầy đủ */}
          <div className="rounded-xl border border-line bg-raised p-3 text-xs font-semibold text-white leading-relaxed">
            <QuizMarkdown content={viewedResult.question.question} />
          </div>

          {/* 4 lựa chọn A/B/C/D kèm đáp án đúng, tỉ lệ % và tên người chọn */}
          <div className="space-y-1.5">
            {(viewedResult.question.options || []).map((opt, oIdx) => {
              const cnt = dist[oIdx] || 0;
              const pct = viewedResult.totalCount > 0 ? Math.round((cnt / viewedResult.totalCount) * 100) : 0;
              const isRight = oIdx === correctIdx;
              const pickers = viewedResult.results.filter((r) => r.selectedOption === oIdx);

              return (
                <div
                  key={oIdx}
                  className={`rounded-xl border p-2.5 space-y-1.5 ${
                    isRight
                      ? 'border-emerald-500/45 bg-emerald-500/12'
                      : cnt > 0
                        ? 'border-rose-500/30 bg-rose-500/8'
                        : 'border-line bg-raised/90'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-extrabold ${
                        isRight ? 'bg-emerald-500 text-black' : 'bg-elevated text-muted'
                      }`}
                    >
                      {String.fromCharCode(65 + oIdx)}
                    </span>
                    <div className="flex-1 min-w-0 text-xs font-semibold text-gray-100">
                      <QuizMarkdown content={opt} inline />
                      {isRight && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300 align-middle">
                          <CheckCircle2 size={10} /> Đáp án đúng
                        </span>
                      )}
                    </div>
                    <span
                      className={`shrink-0 text-[11px] font-bold tabular-nums ${
                        isRight ? 'text-emerald-300' : 'text-gray-200'
                      }`}
                    >
                      {cnt} HS{viewedResult.totalCount > 0 ? ` · ${pct}%` : ''}
                    </span>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-base">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${isRight ? 'bg-emerald-400' : 'bg-rose-400/80'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {pickers.length > 0 && (
                    <p className="text-[10px] text-muted truncate">
                      Chọn: {pickers.map((p) => p.userName).join(', ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Giải thích đáp án */}
          {viewedResult.question.explanation && (
            <div className="rounded-xl border-l-4 border-accent bg-raised/85 p-3 space-y-1">
              <span className="text-[10px] font-bold text-accent">Giải thích đáp án</span>
              <div className="text-xs text-gray-200 leading-relaxed">
                <QuizMarkdown content={viewedResult.question.explanation} />
              </div>
            </div>
          )}

          {/* Đếm ngược chuyển câu */}
          {countdown > 0 && (
            <div className="space-y-2 pt-0.5">
              <div className="flex items-center justify-between px-3 py-2 bg-accent/12 border border-accent/30 rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/25 text-accent text-xs font-extrabold tabular-nums">
                    {countdown}
                  </span>
                  <span className="text-xs font-semibold text-accent">Tự chuyển câu sau {countdown}s</span>
                </div>
                <button
                  onClick={handleSkipCountdown}
                  className="text-[11px] font-bold text-accent hover:bg-accent/20 px-2 py-0.5 rounded-ctl"
                >
                  Dừng đếm
                </button>
              </div>
              {questionQueue.length > 0 && (
                <button
                  onClick={handlePushNext}
                  className="w-full py-2 bg-accent hover:brightness-110 active:scale-[0.98] text-accent-ink rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <SkipForward size={13} /> Gửi câu tiếp ngay ({questionQueue.length})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Thống kê điểm tích lũy & lựa chọn câu hiện tại cho từng học viên */}
        <div className="p-3.5 bg-overlay border border-line rounded-card space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Award size={13} className="text-accent" /> Thống kê điểm từng học viên
            </p>
            <span className="text-[10px] font-semibold text-muted tabular-nums">
              {studentRows.length} HS · {totalDone} câu
            </span>
          </div>

          {studentRows.length === 0 ? (
            <p className="py-2 text-center text-[11px] text-muted">
              Chưa có học viên nào trả lời câu này.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
              {studentRows.map((s, i) => {
                const pct = totalDone > 0 ? Math.round((s.score / totalDone) * 100) : 0;
                return (
                  <div
                    key={s.socketId}
                    className={`rounded-xl border px-3 py-2 space-y-1.5 ${
                      i === 0 ? 'border-accent/35 bg-accent/10' : 'border-line bg-raised'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 text-center text-xs font-bold shrink-0">
                          {i < 3 ? MEDALS[i] : <span className="text-muted">#{i + 1}</span>}
                        </span>
                        <span className="text-xs font-semibold text-white truncate">{s.userName}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 tabular-nums">
                        {s.selectedOption !== undefined && (
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              s.isCorrect
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : s.selectedOption < 0
                                  ? 'bg-elevated text-muted'
                                  : 'bg-rose-500/15 text-rose-300'
                            }`}
                          >
                            {s.isCorrect ? (
                              <>
                                {String.fromCharCode(65 + s.selectedOption)} <CheckCircle2 size={10} /> +1
                              </>
                            ) : s.selectedOption >= 0 ? (
                              <>
                                {String.fromCharCode(65 + s.selectedOption)} <XCircle size={10} />
                              </>
                            ) : (
                              'Chưa chọn'
                            )}
                          </span>
                        )}
                        <span className="text-xs font-extrabold text-accent">
                          {s.score}/{totalDone}
                        </span>
                        <span className="text-[10px] text-muted w-8 text-right">{pct}%</span>
                      </div>
                    </div>

                    <div className="h-1 w-full overflow-hidden rounded-full bg-base">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderQueueBox = () => {
    if (questionQueue.length === 0) return null;
    const allExpanded = questionQueue.every((q) => expandedQueueIds.has(q.id));
    return (
      <div className="p-3 bg-overlay border border-line rounded-card space-y-2.5">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <div>
            <p className="text-[11px] font-bold text-white">Hàng đợi câu hỏi ({questionQueue.length})</p>
            <p className="text-[10px] text-muted">Bấm vào câu để xem chi tiết, đáp án & chỉnh sửa</p>
          </div>
          {questionQueue.length > 1 && (
            <button
              type="button"
              onClick={toggleExpandAllQueue}
              className="shrink-0 inline-flex items-center gap-1 rounded-ctl border border-line bg-raised px-2 py-1 text-[10px] font-semibold text-accent hover:border-accent/40 hover:bg-elevated transition-colors"
            >
              <Eye size={11} />
              {allExpanded ? 'Thu gọn' : 'Xem tất cả'}
            </button>
          )}
        </div>

        <div className="space-y-2">
          {questionQueue.map((q, i) => {
            const isExpanded = expandedQueueIds.has(q.id);
            const isEditing = editingQueueId === q.id;
            const cleanSummary = q.question
              .replace(/```[\s\S]*?```/g, '[code]')
              .replace(/[`*_#]/g, '')
              .replace(/\s+/g, ' ')
              .trim();

            return (
              <div
                key={q.id}
                className={`overflow-hidden rounded-xl border transition-all ${
                  isExpanded
                    ? 'border-accent/45 bg-raised shadow-md shadow-black/20'
                    : 'border-line bg-raised hover:border-line-strong'
                }`}
              >
                {/* Header row — bấm để mở/đóng preview */}
                <div
                  onClick={() => toggleExpandQueueItem(q.id)}
                  className="flex cursor-pointer items-center gap-2 px-2.5 py-2 select-none"
                >
                  <span
                    className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center shrink-0 transition-colors ${
                      isExpanded ? 'bg-accent text-accent-ink' : 'bg-elevated text-accent'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    {q.difficulty && DIFF_LABELS[q.difficulty] && (
                      <span className="shrink-0 rounded-full bg-elevated px-1.5 py-0.2 text-[9px] font-bold text-muted">
                        {DIFF_LABELS[q.difficulty]}
                      </span>
                    )}
                    <p className="text-xs font-medium text-gray-200 truncate">{cleanSummary}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => toggleExpandQueueItem(q.id)}
                      className={`p-1 rounded transition-colors ${isExpanded ? 'text-accent' : 'text-muted hover:text-white'}`}
                      title={isExpanded ? 'Thu gọn xem trước' : 'Xem trước đầy đủ câu hỏi & đáp án'}
                    >
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => reorderAdaptiveQueue(i, i - 1)}
                      disabled={i === 0}
                      className="text-muted hover:text-white disabled:opacity-25 p-1"
                      title="Đưa lên"
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => reorderAdaptiveQueue(i, i + 1)}
                      disabled={i === questionQueue.length - 1}
                      className="text-muted hover:text-white disabled:opacity-25 p-1"
                      title="Đưa xuống"
                    >
                      <ArrowDown size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromAdaptiveQueue(q.id)}
                      className="text-muted hover:text-danger p-1"
                      title="Xóa khỏi hàng đợi"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>

                {/* Nội dung Preview đầy đủ hoặc Form sửa nhanh */}
                {isExpanded && (
                  <div className="border-t border-line/80 bg-base/65 p-3 space-y-2.5 animate-in slide-in-from-top-1">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-accent">Nội dung câu hỏi (hỗ trợ Markdown & ```code```)</label>
                          <textarea
                            value={q.question}
                            onChange={(e) => updateAdaptiveQueueItem({ ...q, question: e.target.value })}
                            className="w-full rounded-ctl border border-line-strong bg-raised p-2 text-xs text-white outline-none focus:border-accent min-h-[68px]"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted">Đáp án (bấm chữ cái để chọn đáp án đúng)</label>
                          {q.options.map((opt, oIdx) => (
                            <div key={oIdx} className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => updateAdaptiveQueueItem({ ...q, correctAnswer: oIdx })}
                                className={`h-6 w-6 rounded text-[10px] font-bold shrink-0 ${
                                  q.correctAnswer === oIdx
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-elevated text-muted hover:text-white'
                                }`}
                                title="Đánh dấu đáp án đúng"
                              >
                                {String.fromCharCode(65 + oIdx)}
                              </button>
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => {
                                  const nextOpts = [...q.options];
                                  nextOpts[oIdx] = e.target.value;
                                  updateAdaptiveQueueItem({ ...q, options: nextOpts });
                                }}
                                className="flex-1 rounded-ctl border border-line bg-raised px-2 py-1 text-xs text-gray-100 outline-none focus:border-accent"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted">Giải thích</label>
                          <textarea
                            value={q.explanation || ''}
                            onChange={(e) => updateAdaptiveQueueItem({ ...q, explanation: e.target.value })}
                            placeholder="Giải thích đáp án..."
                            className="w-full rounded-ctl border border-line bg-raised px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-accent min-h-[44px] resize-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingQueueId(null)}
                          className="w-full py-1.5 rounded-ctl bg-accent/20 text-accent text-xs font-bold hover:bg-accent/30 transition-colors"
                        >
                          Xong chỉnh sửa
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="text-xs font-semibold text-white leading-relaxed">
                          <QuizMarkdown content={q.question} />
                        </div>

                        <div className="grid grid-cols-1 gap-1.5">
                          {q.options.map((opt, oIdx) => {
                            const isRight = oIdx === q.correctAnswer;
                            return (
                              <div
                                key={oIdx}
                                className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                                  isRight
                                    ? 'border-emerald-500/40 bg-emerald-500/12 text-emerald-300 font-semibold'
                                    : 'border-line/70 bg-raised/90 text-gray-300'
                                }`}
                              >
                                <span
                                  className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded text-[10px] font-bold ${
                                    isRight ? 'bg-emerald-500/25 text-emerald-300' : 'bg-elevated text-muted'
                                  }`}
                                >
                                  {String.fromCharCode(65 + oIdx)}
                                </span>
                                <span className="flex-1 min-w-0">
                                  <QuizMarkdown content={opt} inline />
                                </span>
                                {isRight && <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />}
                              </div>
                            );
                          })}
                        </div>

                        {q.explanation && (
                          <div className="rounded-lg border-l-2 border-accent bg-overlay/80 px-2.5 py-1.5 text-[11px] text-gray-300 leading-relaxed">
                            <span className="font-bold text-accent">Giải thích: </span>
                            <QuizMarkdown content={q.explanation} inline />
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1 border-t border-line/60">
                          <button
                            type="button"
                            onClick={() => setEditingQueueId(q.id)}
                            className="inline-flex items-center gap-1 rounded-ctl border border-line-strong bg-raised px-2.5 py-1.5 text-[11px] font-semibold text-gray-200 hover:border-accent/40 hover:text-white active:scale-95 transition-all"
                          >
                            <Edit3 size={11} /> Sửa câu
                          </button>
                          <button
                            type="button"
                            disabled={isWaitingAnswers}
                            onClick={() => handlePushSpecificFromQueue(q)}
                            className="ml-auto inline-flex items-center gap-1 rounded-ctl bg-accent px-3 py-1.5 text-[11px] font-bold text-accent-ink hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all"
                            title={isWaitingAnswers ? 'Chốt câu hiện tại trước khi phát câu mới' : 'Phát ngay câu này cho cả lớp'}
                          >
                            <Play size={11} /> Phát câu này ngay
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderBottomBar = () => (
    <div className="p-3 bg-overlay/90 border-t border-line shrink-0 space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={adaptiveTimeLimitSec}
          onChange={(e) => setAdaptiveTimeLimitSec(Number(e.target.value) || 0)}
          title="Thời gian giới hạn mỗi câu"
          className="rounded-xl border border-line-strong bg-raised px-2.5 py-2 text-xs font-bold text-white outline-none focus:border-accent"
        >
          {ADAPTIVE_TIME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>⏱ {o.label}</option>
          ))}
        </select>
        <button
          onClick={handlePushNext}
          disabled={questionQueue.length === 0 || isWaitingAnswers}
          className="flex-1 py-2.5 bg-accent hover:brightness-110 active:scale-[0.98] disabled:bg-elevated disabled:text-muted text-accent-ink rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
        >
          <SkipForward size={14} /> Gửi câu tiếp ({questionQueue.length})
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setCreatorView(creatorView === 'closed' ? 'recommend' : 'closed')}
          className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all active:scale-95 ${
            creatorView !== 'closed' && creatorView !== 'manual-add'
              ? 'bg-purple-500/20 border-purple-400/50 text-purple-200'
              : 'bg-raised border-line text-gray-200 hover:bg-elevated'
          }`}
        >
          <Sparkles size={13} className="text-purple-400" /> AI Gợi ý
          {creatorView !== 'closed' && creatorView !== 'manual-add' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
        <button
          onClick={() => setCreatorView(creatorView === 'manual-add' ? 'closed' : 'manual-add')}
          className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all active:scale-95 ${
            creatorView === 'manual-add'
              ? 'bg-elevated border-line-strong text-white'
              : 'bg-raised border-line text-gray-200 hover:bg-elevated'
          }`}
        >
          <Plus size={13} className="text-accent" /> Thêm câu
        </button>
      </div>
    </div>
  );

  const creatorPanelNode =
    creatorView !== 'closed' ? (
      <CreatorPanel
        creatorView={creatorView}
        setCreatorView={setCreatorView}
        isRecommending={isRecommending}
        recommendedTopics={recommendedTopics}
        topicHint={topicHint}
        setTopicHint={setTopicHint}
        difficulty={difficulty}
        setDifficulty={setDifficulty}
        isGeneratingQuestions={isGeneratingQuestions}
        isBatchGenerating={isBatchGenerating}
        handleBatchGenerateToQueue={handleBatchGenerateToQueue}
        selectedTopic={selectedTopic}
        generatedVersions={generatedVersions}
        selectedIds={selectedIds}
        toggleSelectQuestion={toggleSelectQuestion}
        selectGroup={selectGroup}
        editingPreviewId={editingPreviewId}
        setEditingPreviewId={setEditingPreviewId}
        updateGeneratedQuestion={updateGeneratedQuestion}
        manualQuestion={manualQuestion}
        setManualQuestion={setManualQuestion}
        handleRecommend={handleRecommend}
        handlePickTopic={handlePickTopic}
        handleAddSelectedToQueue={handleAddSelectedToQueue}
        handlePushGeneratedNow={handlePushGeneratedNow}
        canPushNow={!isWaitingAnswers}
        handleAddManualQuestion={handleAddManualQuestion}
      />
    ) : null;

  // === SIDEBAR ===
  if (!embedded) {
    return (
      <div className="flex flex-col h-full bg-raised text-white overflow-hidden font-sans border-l border-line relative">
        <div className="flex items-center justify-between px-4 py-3 bg-overlay/80 border-b border-line shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-accent/15 text-accent border border-accent/30 shrink-0 text-xs font-extrabold tabular-nums">
              {adaptiveQuestionIndex}
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-white truncate max-w-[180px]">{activeAdaptive?.title || 'Adaptive'}</h2>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ok">
                <span className="h-1.5 w-1.5 rounded-full bg-ok animate-pulse" /> Đang diễn ra
              </span>
            </div>
          </div>
          <button onClick={handleEnd} className="text-xs font-semibold text-danger hover:bg-danger/15 px-2.5 py-1 rounded-ctl">
            Kết thúc
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {isWaitingAnswers && renderWaitingBox()}
          {renderLastResultBox()}

          {isWaitingAnswers && sortedScores.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-muted flex items-center gap-1">
                <Award size={12} className="text-accent" /> Bảng điểm trực tiếp ({adaptiveQuestionResults.length} câu đã chốt)
              </p>
              {sortedScores.map((s, i) => {
                const totalDone = adaptiveQuestionResults.length;
                const pct = totalDone > 0 ? Math.round((s.score / totalDone) * 100) : 0;
                return (
                  <div
                    key={s.socketId}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs border ${
                      i === 0 ? 'bg-accent/12 border-accent/35' : 'bg-overlay border-line'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 text-center font-bold shrink-0">{i < 3 ? MEDALS[i] : `${i + 1}.`}</span>
                      <span className="font-semibold text-white truncate">{s.userName}</span>
                    </div>
                    <span className="font-extrabold text-accent tabular-nums shrink-0">
                      {totalDone > 0 ? `${s.score}/${totalDone} (${pct}%)` : `${s.score} đ`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {renderQueueBox()}

          {!currentQ && !lastResult && adaptiveQuestionIndex === 0 && questionQueue.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-muted text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-purple-500/15 text-purple-300 border border-purple-500/25 mb-3">
                <Sparkles size={22} />
              </div>
              <p className="text-xs font-bold text-white">Phiên Adaptive đã sẵn sàng</p>
              <p className="text-[11px] text-muted mt-1 max-w-[230px]">
                Bấm <strong>AI Gợi ý</strong> để AI đề xuất chủ đề / tạo bộ 5 câu hoặc bấm <strong>Thêm câu</strong> thủ công.
              </p>
            </div>
          )}
        </div>

        {renderBottomBar()}
        {creatorPanelNode}
      </div>
    );
  }

  // === EMBEDDED (FlexLayout tab) ===
  return (
    <div className="flex flex-col h-full bg-raised text-white overflow-hidden font-sans border-l border-line relative">
      <div className="flex items-center justify-between px-4 py-3 bg-overlay/80 border-b border-line shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-accent/15 text-accent border border-accent/30 shrink-0 text-xs font-extrabold tabular-nums">
            {adaptiveQuestionIndex}
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-white truncate max-w-[180px]">{activeAdaptive?.title || 'Adaptive'}</h2>
            <span className="text-[10px] font-semibold text-accent">Điều khiển của giảng viên</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-full bg-elevated px-2.5 py-0.5 text-[10px] font-semibold text-muted">
            {questionQueue.length} câu chờ
          </span>
          <button onClick={handleEnd} className="text-xs font-semibold text-danger hover:bg-danger/15 px-2.5 py-1 rounded-ctl">
            Kết thúc
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-base custom-scrollbar">
        <div className="max-w-2xl mx-auto space-y-4">
          {currentQ && (
            <div className="bg-raised p-5 rounded-2xl border border-line shadow-sm space-y-4">
              <div className="text-[14px] text-gray-100 font-bold">
                <QuizMarkdown content={currentQ.question} />
              </div>
              <div className="grid grid-cols-1 gap-2">
                {currentQ.options.map((opt: string, aIdx: number) => {
                  const isCorrect = aIdx === currentQ.correctAnswer;
                  return (
                    <div
                      key={aIdx}
                      className={`text-left px-4 py-3 rounded-xl text-[13px] border flex items-center gap-3 ${
                        isCorrect ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-300' : 'bg-overlay border-line text-gray-200'
                      }`}
                    >
                      <span
                        className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-[11px] font-bold border ${
                          isCorrect ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-raised border-line-strong text-muted'
                        }`}
                      >
                        {String.fromCharCode(65 + aIdx)}
                      </span>
                      <span className="font-semibold flex-1 min-w-0">
                        <QuizMarkdown content={opt} inline />
                      </span>
                      {isCorrect && <CheckCircle2 size={16} className="ml-auto text-emerald-400 shrink-0" />}
                    </div>
                  );
                })}
              </div>

              {renderWaitingBox()}

              {currentQ.explanation && (
                <div className="p-3.5 bg-overlay/70 rounded-xl border-l-4 border-accent">
                  <span className="text-[11px] font-bold text-accent">Giải thích</span>
                  <div className="text-xs text-gray-300 mt-1">
                    <QuizMarkdown content={currentQ.explanation} />
                  </div>
                </div>
              )}
            </div>
          )}

          {renderLastResultBox()}

          {isWaitingAnswers && sortedScores.length > 0 && (
            <div className="bg-raised p-4 rounded-2xl border border-line space-y-2">
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                <Award size={13} className="text-accent" /> Bảng điểm trực tiếp ({adaptiveQuestionResults.length} câu đã chốt)
              </p>
              <div className="space-y-1.5">
                {sortedScores.map((s, i) => {
                  const totalDone = adaptiveQuestionResults.length;
                  const pct = totalDone > 0 ? Math.round((s.score / totalDone) * 100) : 0;
                  return (
                    <div
                      key={s.socketId}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs border ${
                        i === 0 ? 'bg-accent/12 border-accent/35' : 'bg-overlay border-line'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 text-center font-bold shrink-0">{i < 3 ? MEDALS[i] : `${i + 1}.`}</span>
                        <span className="font-semibold text-white truncate">{s.userName}</span>
                      </div>
                      <span className="font-extrabold text-accent tabular-nums shrink-0">
                        {totalDone > 0 ? `${s.score}/${totalDone} (${pct}%)` : `${s.score} đ`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {renderQueueBox()}

          {!currentQ && !lastResult && adaptiveQuestionIndex === 0 && questionQueue.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted text-center">
              <Zap size={28} className="text-accent mb-3" />
              <p className="text-sm font-bold text-white">Phiên Adaptive đã sẵn sàng</p>
              <p className="text-xs text-muted mt-1">Tạo câu hỏi bằng AI Gợi ý hoặc thêm thủ công bên dưới</p>
            </div>
          )}
        </div>
      </div>

      {renderBottomBar()}
      {creatorPanelNode}
    </div>
  );
};

// Sub-component: Floating creator panel
const CreatorPanel: React.FC<{
  creatorView: CreatorView;
  setCreatorView: (v: CreatorView) => void;
  isRecommending: boolean;
  recommendedTopics: AdaptiveTopicSuggestion[] | null;
  topicHint: string;
  setTopicHint: (v: string) => void;
  difficulty: QuizDifficulty;
  setDifficulty: (d: QuizDifficulty) => void;
  isGeneratingQuestions: boolean;
  isBatchGenerating: boolean;
  handleBatchGenerateToQueue: () => void;
  selectedTopic: string;
  generatedVersions: { versionA: QuizQuestion[]; versionB: QuizQuestion[] } | null;
  selectedIds: Set<string>;
  toggleSelectQuestion: (id: string) => void;
  selectGroup: (group: 'A' | 'B') => void;
  editingPreviewId: string | null;
  setEditingPreviewId: (id: string | null) => void;
  updateGeneratedQuestion: (q: QuizQuestion) => void;
  manualQuestion: Partial<QuizQuestion>;
  setManualQuestion: (q: Partial<QuizQuestion>) => void;
  handleRecommend: () => void;
  handlePickTopic: (topic: string, suggestedDiff?: QuizDifficulty) => void;
  handleAddSelectedToQueue: () => void;
  handlePushGeneratedNow: (q: QuizQuestion) => void;
  canPushNow: boolean;
  handleAddManualQuestion: () => void;
}> = ({
  creatorView,
  setCreatorView,
  isRecommending,
  recommendedTopics,
  topicHint,
  setTopicHint,
  difficulty,
  setDifficulty,
  isGeneratingQuestions,
  isBatchGenerating,
  handleBatchGenerateToQueue,
  selectedTopic,
  generatedVersions,
  selectedIds,
  toggleSelectQuestion,
  selectGroup,
  editingPreviewId,
  setEditingPreviewId,
  updateGeneratedQuestion,
  manualQuestion,
  setManualQuestion,
  handleRecommend,
  handlePickTopic,
  handleAddSelectedToQueue,
  handlePushGeneratedNow,
  canPushNow,
  handleAddManualQuestion,
}) => (
  <div
    className="anim-popover absolute bottom-0 left-0 right-0 bg-overlay/95 backdrop-blur-md border-t border-purple-400/40 shadow-2xl shadow-black/60 rounded-t-2xl z-20 flex flex-col"
    style={{ maxHeight: '76%' }}
  >
    <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
      <div className="flex items-center gap-2">
        {creatorView === 'manual-add' ? (
          <Plus size={14} className="text-accent" />
        ) : (
          <Sparkles size={14} className="text-purple-400" />
        )}
        <h3 className="text-xs font-bold text-white">
          {creatorView === 'manual-add'
            ? 'Thêm câu hỏi thủ công'
            : creatorView === 'pick-version'
              ? 'Chọn câu hỏi AI vừa tạo'
              : 'AI Gợi ý chủ đề theo điểm yếu lớp'}
        </h3>
      </div>
      <button onClick={() => setCreatorView('closed')} className="rounded-ctl p-1 text-muted hover:bg-line hover:text-white">
        <X size={15} />
      </button>
    </div>

    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
      {creatorView === 'recommend' && (
        <>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={topicHint}
              onChange={(e) => setTopicHint(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRecommend();
              }}
              placeholder="Gợi ý chủ đề trọng tâm (tùy chọn)..."
              className="flex-1 bg-base/80 border border-line rounded-ctl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-400"
            />
            <button
              onClick={handleRecommend}
              disabled={isRecommending}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 active:scale-95 disabled:bg-elevated disabled:text-muted text-white rounded-ctl text-xs font-bold flex items-center gap-1.5 shrink-0"
            >
              {isRecommending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles size={12} />}
              {isRecommending ? 'Đang phân tích…' : 'Gợi ý'}
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1 rounded-ctl border border-line bg-base/80 p-1">
            {(['mixed', 'easy', 'medium', 'hard'] as QuizDifficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={`rounded-md py-1 text-[11px] font-semibold transition-all ${
                  difficulty === d ? 'bg-purple-500/25 text-purple-200 border border-purple-400/40' : 'text-muted hover:text-white border border-transparent'
                }`}
              >
                {d === 'mixed' ? 'Hỗn hợp' : DIFF_LABELS[d]}
              </button>
            ))}
          </div>

          <button
            onClick={handleBatchGenerateToQueue}
            disabled={isBatchGenerating || isRecommending || isGeneratingQuestions}
            className="w-full py-2 rounded-xl border border-accent/35 bg-accent/15 text-accent hover:bg-accent/25 active:scale-[0.98] disabled:opacity-50 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
          >
            {isBatchGenerating ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            {isBatchGenerating ? 'Đang tạo bộ 5 câu…' : 'AI tạo nhanh nguyên bộ 5 câu vào hàng đợi'}
          </button>

          {isGeneratingQuestions && (
            <div className="space-y-2 py-2">
              <div className="flex items-center justify-center gap-2 text-purple-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs font-semibold">Đang soạn 2 phiên bản cho "{selectedTopic}"…</span>
              </div>
              <div className="h-14 w-full rounded-xl skeleton-shimmer" />
              <div className="h-14 w-full rounded-xl skeleton-shimmer" />
            </div>
          )}

          {!isGeneratingQuestions &&
            recommendedTopics &&
            recommendedTopics.map((t, i) => (
              <button
                key={i}
                onClick={() => handlePickTopic(t.title, t.suggestedDifficulty)}
                className="group w-full text-left flex items-start gap-3 px-3.5 py-2.5 bg-purple-500/10 border border-purple-500/25 rounded-xl hover:bg-purple-500/18 hover:border-purple-400/50 active:scale-[0.99] transition-all"
              >
                <span className="w-5 h-5 bg-purple-500/25 text-purple-200 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-bold text-white">{t.title}</p>
                    {t.suggestedDifficulty && DIFF_LABELS[t.suggestedDifficulty] && (
                      <span className="rounded-full bg-purple-500/25 px-2 py-0.2 text-[9px] font-bold text-purple-200">
                        {DIFF_LABELS[t.suggestedDifficulty]}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted mt-0.5 leading-snug">{t.reason}</p>
                </div>
                <ChevronRight size={14} className="text-purple-300 shrink-0 mt-1 transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
        </>
      )}

      {creatorView === 'pick-version' && generatedVersions && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                onClick={() => setCreatorView('recommend')}
                className="text-[11px] font-semibold text-purple-300 hover:text-purple-200 shrink-0"
              >
                ← Đổi chủ đề
              </button>
              <span className="text-xs text-muted">·</span>
              <span className="text-xs font-bold text-white truncate">{selectedTopic}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => selectGroup('A')} className="rounded-ctl bg-accent/15 px-2 py-1 text-[10px] font-bold text-accent hover:bg-accent/25">
                Chọn A
              </button>
              <button onClick={() => selectGroup('B')} className="rounded-ctl bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/25">
                Chọn B
              </button>
            </div>
          </div>

          {[
            { label: 'Phiên bản A · Củng cố bản chất', list: generatedVersions.versionA, color: 'border-accent/25 bg-accent/10 text-accent' },
            { label: 'Phiên bản B · Đọc code & tình huống bẫy', list: generatedVersions.versionB, color: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' },
          ].map((group) => (
            <div key={group.label} className={`space-y-2 p-3 rounded-xl border ${group.color}`}>
              <p className="text-[11px] font-bold">{group.label}</p>
              {group.list.map((q, i) => (
                <SelectableQuestionCard
                  key={q.id}
                  question={q}
                  index={i}
                  selected={selectedIds.has(q.id)}
                  onToggle={() => toggleSelectQuestion(q.id)}
                  editing={editingPreviewId === q.id}
                  onToggleEdit={() => setEditingPreviewId(editingPreviewId === q.id ? null : q.id)}
                  onChange={updateGeneratedQuestion}
                  canPushNow={canPushNow}
                  onPushNow={() => handlePushGeneratedNow(q)}
                />
              ))}
            </div>
          ))}

          <button
            onClick={handleAddSelectedToQueue}
            disabled={selectedIds.size === 0}
            className="w-full py-2.5 bg-accent hover:brightness-110 active:scale-[0.98] disabled:bg-elevated disabled:text-muted text-accent-ink rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <Plus size={13} /> Thêm {selectedIds.size} câu đã chọn vào hàng đợi
          </button>
        </>
      )}

      {creatorView === 'manual-add' && (
        <>
          <textarea
            value={manualQuestion.question}
            onChange={(e) => setManualQuestion({ ...manualQuestion, question: e.target.value })}
            placeholder="Nội dung câu hỏi..."
            className="w-full bg-base/80 border border-line rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-accent min-h-[64px] resize-none text-white"
          />
          <div className="grid grid-cols-1 gap-1.5">
            {manualQuestion.options?.map((opt, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-ctl border ${
                  manualQuestion.correctAnswer === idx ? 'bg-emerald-500/10 border-emerald-500/35' : 'bg-base/70 border-line'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setManualQuestion({ ...manualQuestion, correctAnswer: idx })}
                  className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                    manualQuestion.correctAnswer === idx ? 'bg-emerald-500 text-white' : 'bg-elevated text-muted'
                  }`}
                >
                  {String.fromCharCode(65 + idx)}
                </button>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...(manualQuestion.options || [])];
                    newOpts[idx] = e.target.value;
                    setManualQuestion({ ...manualQuestion, options: newOpts });
                  }}
                  placeholder={`Lựa chọn ${String.fromCharCode(65 + idx)}`}
                  className="flex-1 bg-transparent border-none px-1.5 py-0.5 text-xs text-white focus:outline-none"
                />
              </div>
            ))}
          </div>
          <input
            type="text"
            value={manualQuestion.explanation || ''}
            onChange={(e) => setManualQuestion({ ...manualQuestion, explanation: e.target.value })}
            placeholder="Giải thích (không bắt buộc)..."
            className="w-full bg-base/80 border border-line rounded-ctl px-3 py-2 text-xs text-white focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleAddManualQuestion}
            disabled={!manualQuestion.question?.trim()}
            className="w-full py-2.5 bg-accent hover:brightness-110 active:scale-[0.98] disabled:bg-elevated disabled:text-muted text-accent-ink rounded-xl text-xs font-bold"
          >
            + Thêm vào hàng đợi
          </button>
        </>
      )}
    </div>
  </div>
);

const SelectableQuestionCard: React.FC<{
  question: QuizQuestion;
  index: number;
  selected: boolean;
  onToggle: () => void;
  editing: boolean;
  onToggleEdit: () => void;
  onChange: (q: QuizQuestion) => void;
  canPushNow: boolean;
  onPushNow: () => void;
}> = ({ question, index, selected, onToggle, editing, onToggleEdit, onChange, canPushNow, onPushNow }) => (
  <div
    className={`p-3 bg-raised border rounded-xl space-y-2 text-white transition-all ${
      selected ? 'border-accent/60 shadow-sm' : 'border-line opacity-75'
    }`}
  >
    <div className="flex items-center justify-between gap-2">
      <button onClick={onToggle} className="flex items-center gap-2 text-xs font-bold text-white">
        <span
          className={`grid h-4 w-4 place-items-center rounded border ${
            selected ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong bg-overlay'
          }`}
        >
          {selected && <Check size={10} />}
        </span>
        Câu {index + 1}
        {question.difficulty && DIFF_LABELS[question.difficulty] && (
          <span className="rounded-full bg-elevated px-2 py-0.2 text-[10px] font-semibold text-muted">
            {DIFF_LABELS[question.difficulty]}
          </span>
        )}
      </button>
      <div className="flex items-center gap-1">
        <button onClick={onToggleEdit} className="rounded-ctl p-1 text-muted hover:bg-line hover:text-white" title="Sửa nhanh">
          <Edit3 size={12} />
        </button>
        {canPushNow && (
          <button
            onClick={onPushNow}
            className="inline-flex items-center gap-1 rounded-ctl bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent hover:bg-accent/30"
            title="Phát trực tiếp câu này cho cả lớp ngay"
          >
            <Play size={10} /> Phát ngay
          </button>
        )}
      </div>
    </div>

    {editing ? (
      <div className="space-y-1.5 pt-1">
        <textarea
          value={question.question}
          onChange={(e) => onChange({ ...question, question: e.target.value })}
          className="w-full rounded-ctl border border-line bg-base/80 p-2 text-xs text-white outline-none focus:border-accent min-h-[54px]"
        />
        <div className="grid grid-cols-1 gap-1">
          {question.options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChange({ ...question, correctAnswer: idx })}
                className={`h-6 w-6 rounded text-[10px] font-bold shrink-0 ${
                  question.correctAnswer === idx ? 'bg-emerald-500 text-white' : 'bg-elevated text-muted'
                }`}
              >
                {String.fromCharCode(65 + idx)}
              </button>
              <input
                value={opt}
                onChange={(e) => {
                  const next = [...question.options];
                  next[idx] = e.target.value;
                  onChange({ ...question, options: next });
                }}
                className="flex-1 rounded-ctl border border-line bg-base/80 px-2 py-1 text-xs text-gray-200"
              />
            </div>
          ))}
        </div>
      </div>
    ) : (
      <>
        <div className="text-xs font-semibold text-gray-100">
          <QuizMarkdown content={question.question} />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {question.options.map((opt, i) => (
            <div
              key={i}
              className={`px-2 py-1 rounded-md text-[11px] ${
                i === question.correctAnswer
                  ? 'bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/35'
                  : 'bg-overlay text-muted border border-line/60'
              }`}
            >
              {String.fromCharCode(65 + i)}. <QuizMarkdown content={opt} inline />
            </div>
          ))}
        </div>
      </>
    )}
  </div>
);

export default AdaptiveQuizManager;
