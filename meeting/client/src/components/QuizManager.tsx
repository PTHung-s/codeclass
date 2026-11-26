import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import {
  HelpCircle,
  Plus,
  Send,
  BarChart2,
  Award,
  Clock,
  User,
  Zap,
  Trash2,
  Sparkles,
  Loader2,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Code2,
  FileText,
  Download,
  Upload,
  BookOpen,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Eye,
  Layers,
  Database,
  Search,
} from 'lucide-react';
import type { Quiz, QuizDifficulty, QuizQuestion, QuizQuestionType } from '../types/quiz';
import { socket } from '../services/socket';
import { apiUrl } from '../services/apiBase';
import { getHostSecret, isDefaultCodeSnippet } from '../lib/roomState';
import { toast, uiConfirm } from '../store/useUiStore';
import {
  deleteQuizFromLibrary,
  exportQuizJson,
  loadQuizLibrary,
  parseImportedQuizJson,
  saveQuizToLibrary,
  type SavedQuizTemplate,
} from '../lib/quizLibrary';
import { formatQuizClock, getQuizClock } from '../lib/quizTimer';
import { playSoundCue } from '../lib/soundCue';
import QuizMarkdown from './QuizMarkdown';
import AdaptiveQuizManager from './AdaptiveQuizManager';
import AdaptiveQuizRunner from './AdaptiveQuizRunner';

const DIFFICULTY_OPTIONS: Array<{ value: QuizDifficulty; label: string }> = [
  { value: 'mixed', label: 'Hỗn hợp' },
  { value: 'easy', label: 'Dễ' },
  { value: 'medium', label: 'TB' },
  { value: 'hard', label: 'Khó' },
];

const TYPE_OPTIONS: Array<{ value: QuizQuestionType; label: string }> = [
  { value: 'mixed', label: 'Tổng hợp' },
  { value: 'code_output', label: 'Output' },
  { value: 'find_bug', label: 'Tìm Bug' },
  { value: 'theory', label: 'Lý thuyết' },
];

const TIME_LIMIT_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Tự do' },
  { value: 180, label: '3p' },
  { value: 300, label: '5p' },
  { value: 600, label: '10p' },
  { value: 900, label: '15p' },
];

const COUNT_PRESETS = [3, 5, 10, 15];

const DIFF_BADGE: Record<string, string> = {
  easy: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  medium: 'bg-accent/15 text-accent border-accent/30',
  hard: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};
const DIFF_LABEL: Record<string, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
};

const MEDALS = ['🥇', '🥈', '🥉'];

const QuizManager: React.FC = () => {
  const {
    isHost,
    hostId,
    activeQuiz,
    setActiveQuiz,
    quizResponses,
    peers,
    roomId,
    parentId,
    draftQuiz,
    setDraftQuiz,
    activeAdaptive,
    adaptiveRankings,
    code,
    selectedLanguage,
    assignments,
    currentAssignmentIndex,
  } = useMeetingStore();

  const [view, setView] = useState<'list' | 'create' | 'active' | 'results' | 'adaptive'>(
    activeQuiz ? 'active' : activeAdaptive || adaptiveRankings ? 'adaptive' : 'list',
  );
  const studentCount = useMemo(
    () => peers.filter((p) => p.socketId !== hostId).length + (isHost ? 0 : 1),
    [peers, hostId, isHost],
  );

  // AI generator controls
  const [isGenerating, setIsGenerating] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState<QuizDifficulty>('mixed');
  const [aiQuestionType, setAiQuestionType] = useState<QuizQuestionType>('mixed');
  const [useCodeContext, setUseCodeContext] = useState(false);
  const [useAssignmentContext, setUseAssignmentContext] = useState(false);
  const [aiError, setAiError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);

  // Bổ sung câu hỏi bằng AI ngay trong lúc bài kiểm tra ĐANG DIỄN RA
  const [liveAppendOpen, setLiveAppendOpen] = useState(false);
  const [liveTopic, setLiveTopic] = useState('');
  const [liveCount, setLiveCount] = useState(2);
  const [liveDifficulty, setLiveDifficulty] = useState<QuizDifficulty>('mixed');
  const [liveType, setLiveType] = useState<QuizQuestionType>('mixed');
  const [liveUseCode, setLiveUseCode] = useState(false);
  const [liveGenerating, setLiveGenerating] = useState(false);
  const [livePending, setLivePending] = useState<QuizQuestion[]>([]);
  const [liveSelectedIds, setLiveSelectedIds] = useState<Set<string>>(new Set());
  const [liveExtraMinutes, setLiveExtraMinutes] = useState(2);
  const [expandedActiveIds, setExpandedActiveIds] = useState<Set<string>>(new Set());

  // Quiz library (localStorage) + CodeClass Quiz Bank + JSON import
  const [library, setLibrary] = useState<SavedQuizTemplate[]>(() => loadQuizLibrary());
  const [showLibrary, setShowLibrary] = useState(false);
  const [showCcBank, setShowCcBank] = useState(false);
  const [ccBankSearch, setCcBankSearch] = useState('');
  const [ccBankLoading, setCcBankLoading] = useState(false);
  const [ccBankItems, setCcBankItems] = useState<Array<{
    id: string;
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
    difficulty: 'easy' | 'medium' | 'hard';
    skillId?: string | null;
    skillName?: string | null;
    sourceTitle?: string;
  }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasCcToken = Boolean(typeof window !== 'undefined' && localStorage.getItem('token'));
  const ccApiBase = ((import.meta as any).env?.VITE_CODECLASS_API || '').replace(/\/$/, '');

  const loadCodeClassBank = async (queryText = ccBankSearch) => {
    const tk = localStorage.getItem('token');
    if (!tk) return;
    setCcBankLoading(true);
    try {
      const qs = new URLSearchParams();
      if (queryText.trim()) qs.set('q', queryText.trim());
      qs.set('limit', '25');
      const res = await fetch(`${ccApiBase}/api/meetings/quiz-bank?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${tk}` },
      });
      if (!res.ok) throw new Error('Không tải được Kho CodeClass');
      const data = await res.json();
      setCcBankItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      toast.error('Không tải được Kho câu hỏi CodeClass.');
    } finally {
      setCcBankLoading(false);
    }
  };

  const handleImportCcQuestion = (item: (typeof ccBankItems)[number]) => {
    setDraftQuiz({
      ...draftQuiz,
      title: draftQuiz.title || 'Kiểm tra nhanh trên lớp',
      questions: [
        ...(draftQuiz.questions || []),
        {
          id: `${item.id}_${Math.random().toString(36).slice(2, 6)}`,
          question: item.question,
          options: item.options,
          correctAnswer: item.correctAnswer,
          explanation: item.explanation || '',
          difficulty: item.difficulty,
          ...(item.skillId ? { skillId: item.skillId } : {}),
        },
      ],
    });
    toast.success('Đã thêm câu hỏi từ Kho CodeClass.');
  };

  const activeAssignment = assignments?.[currentAssignmentIndex] || null;
  const hasRealCode = Boolean(code && code.trim() && !isDefaultCodeSnippet(code));

  // Đồng hồ đếm ngược / đếm thời gian làm bài trực tiếp cho giáo viên
  const [clockNow, setClockNow] = useState(() => Date.now());
  const expiredNotifiedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeQuiz) {
      expiredNotifiedKeyRef.current = null;
      return;
    }
    const tick = () => setClockNow(Date.now());
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [activeQuiz?.id, activeQuiz?.endsAt, activeQuiz?.timeLimit]);

  const quizClock = useMemo(() => getQuizClock(activeQuiz, clockNow), [activeQuiz, clockNow]);

  useEffect(() => {
    if (!isHost || !activeQuiz || !quizClock.isTimed || !quizClock.isExpired) return;
    const key = `${activeQuiz.id}:${quizClock.endsAt}`;
    if (expiredNotifiedKeyRef.current === key) return;
    expiredNotifiedKeyRef.current = key;
    playSoundCue('quiz');
    toast.warning('Đã hết thời gian làm bài! Học viên đang tự động nộp bài.');
  }, [isHost, activeQuiz, quizClock.isTimed, quizClock.isExpired, quizClock.endsAt]);

  useEffect(() => {
    if (activeAdaptive || adaptiveRankings) setView((v) => (v === 'list' ? 'adaptive' : v));
    else if (activeQuiz) setView((v) => (v === 'list' ? 'active' : v));
  }, [activeQuiz, activeAdaptive, adaptiveRankings]);

  const rankings = useMemo(() => {
    return [...quizResponses].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeTaken - b.timeTaken;
    });
  }, [quizResponses]);

  const questionStats = useMemo(() => {
    if (!activeQuiz) return [];
    return activeQuiz.questions.map((q) => {
      const optCount = Math.max(4, q.options?.length || 4);
      const distribution = Array.from({ length: optCount }, () => 0);
      let correctCount = 0;

      for (const r of quizResponses) {
        const ans = r.answers.find((a) => a.questionId === q.id);
        if (ans) {
          if (ans.isCorrect) correctCount++;
          if (ans.selectedOption >= 0 && ans.selectedOption < distribution.length) {
            distribution[ans.selectedOption]++;
          }
        }
      }

      const totalCount = quizResponses.length;
      const percentCorrect = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
      return {
        id: q.id,
        question: q.question,
        options: q.options || [],
        correctAnswer: q.correctAnswer,
        percentCorrect,
        correctCount,
        totalCount,
        distribution,
      };
    });
  }, [activeQuiz, quizResponses]);

  const averageScorePercent = useMemo(() => {
    if (quizResponses.length === 0 || !activeQuiz || activeQuiz.questions.length === 0) return 0;
    const totalScore = quizResponses.reduce((acc, curr) => acc + curr.score, 0);
    const totalPossible = quizResponses.length * activeQuiz.questions.length;
    return Math.round((totalScore / totalPossible) * 100);
  }, [quizResponses, activeQuiz]);

  const [currentQuestion, setCurrentQuestion] = useState<Partial<QuizQuestion>>({
    question: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    explanation: '',
  });

  const buildAiPayload = (opts: { count: number; replaceQuestion?: string }) => {
    const existing = (draftQuiz.questions || []).map((q) => q.question);
    return {
      topic: aiPrompt.trim() || draftQuiz.title || '',
      count: opts.count,
      difficulty: aiDifficulty,
      questionType: aiQuestionType,
      language: selectedLanguage?.name || 'python',
      sourceCode: useCodeContext && hasRealCode ? code : '',
      assignmentName: useAssignmentContext && activeAssignment ? activeAssignment.name : '',
      assignmentPath:
        useAssignmentContext && activeAssignment && activeAssignment.type === 'image'
          ? activeAssignment.data
          : '',
      context: existing,
      replaceQuestion: opts.replaceQuestion || '',
      roomId,
      hostSecret: getHostSecret(roomId) || getHostSecret(parentId),
    };
  };

  const handleAiGenerate = async () => {
    const canGenerate = Boolean(
      aiPrompt.trim() || (useCodeContext && hasRealCode) || (useAssignmentContext && activeAssignment),
    );
    if (!canGenerate) {
      toast.warning('Nhập chủ đề hoặc bật ngữ cảnh Code / Đề bài trước khi tạo.');
      return;
    }
    setIsGenerating(true);
    setAiError('');
    try {
      const tk = localStorage.getItem('token') || '';
      const response = await fetch(apiUrl('/api/ai/generate-quiz'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tk ? { Authorization: 'Bearer ' + tk } : {}),
        },
        body: JSON.stringify(buildAiPayload({ count: aiCount })),
      });
      const data = await response.json();
      if (!response.ok) {
        const msg = data?.error || `Lỗi tạo câu hỏi (${response.status})`;
        setAiError(msg);
        toast.error(msg);
        return;
      }
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        const questionsWithIds: QuizQuestion[] = data.questions.map((q: any) => ({
          ...q,
          id: q.id || Math.random().toString(36).slice(2, 11),
        }));

        const autoTitle =
          draftQuiz.title?.trim() ||
          aiPrompt.trim() ||
          (useAssignmentContext && activeAssignment ? `Trắc nghiệm: ${activeAssignment.name}` : '') ||
          `Trắc nghiệm ${(selectedLanguage?.name || 'Code').toUpperCase()}`;

        setDraftQuiz({
          ...draftQuiz,
          title: autoTitle,
          questions: [...(draftQuiz.questions || []), ...questionsWithIds],
        });
        setAiError('');
        toast.success(`Đã tạo ${questionsWithIds.length} câu hỏi chuẩn hóa & xáo đáp án.`);
      }
    } catch (error) {
      console.error('AI Generation failed:', error);
      setAiError('Không tạo được câu hỏi. Vui lòng thử lại.');
      toast.error('Không tạo được câu hỏi. Vui lòng thử lại.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerateSingle = async (targetQ: QuizQuestion) => {
    setRegeneratingId(targetQ.id);
    try {
      const tk = localStorage.getItem('token') || '';
      const response = await fetch(apiUrl('/api/ai/generate-quiz'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tk ? { Authorization: 'Bearer ' + tk } : {}),
        },
        body: JSON.stringify(buildAiPayload({ count: 1, replaceQuestion: targetQ.question })),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.questions) || !data.questions[0]) {
        toast.error(data?.error || 'Không tạo lại được câu hỏi này');
        return;
      }
      const nextQ: QuizQuestion = {
        ...data.questions[0],
        id: data.questions[0].id || Math.random().toString(36).slice(2, 11),
      };
      setDraftQuiz({
        ...draftQuiz,
        questions: (draftQuiz.questions || []).map((q) => (q.id === targetQ.id ? nextQ : q)),
      });
      if (editingId === targetQ.id) setEditingId(nextQ.id);
      toast.success('Đã thay thế bằng câu hỏi mới.');
    } catch {
      toast.error('Lỗi kết nối khi tạo lại câu hỏi.');
    } finally {
      setRegeneratingId(null);
    }
  };

  const moveQuestion = (idx: number, delta: -1 | 1) => {
    const qs = [...(draftQuiz.questions || [])];
    const target = idx + delta;
    if (target < 0 || target >= qs.length) return;
    [qs[idx], qs[target]] = [qs[target], qs[idx]];
    setDraftQuiz({ ...draftQuiz, questions: qs });
  };

  const handleAddQuestion = () => {
    if (!currentQuestion.question?.trim()) return;
    setDraftQuiz({
      ...draftQuiz,
      questions: [
        ...(draftQuiz.questions || []),
        { ...currentQuestion, id: Math.random().toString(36).slice(2, 11) } as QuizQuestion,
      ],
    });
    setCurrentQuestion({
      question: '',
      options: ['', '', '', ''],
      correctAnswer: 0,
      explanation: '',
    });
    toast.success('Đã thêm câu hỏi vào danh sách.');
  };

  const handleUpdateQuestion = (updatedQ: QuizQuestion) => {
    setDraftQuiz({
      ...draftQuiz,
      questions: draftQuiz.questions?.map((q) => (q.id === updatedQ.id ? updatedQ : q)),
    });
  };

  const removeQuestion = (id: string) => {
    setDraftQuiz({
      ...draftQuiz,
      questions: draftQuiz.questions?.filter((q) => q.id !== id),
    });
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseImportedQuizJson(text);
      setDraftQuiz({
        title: imported.title,
        timeLimit: imported.timeLimit,
        questions: imported.questions,
      });
      setView('create');
      toast.success(`Đã nhập ${imported.questions.length} câu từ "${file.name}".`);
    } catch (err: any) {
      toast.error(err?.message || 'File JSON không hợp lệ.');
    }
  };

  const handleLoadFromLibrary = (tpl: SavedQuizTemplate) => {
    setDraftQuiz({
      title: tpl.title,
      timeLimit: tpl.timeLimit,
      questions: tpl.questions.map((q) => ({ ...q, id: Math.random().toString(36).slice(2, 11) })),
    });
    setShowLibrary(false);
    setView('create');
    toast.info(`Đã nạp đề "${tpl.title}" (${tpl.questions.length} câu).`);
  };

  const handleSaveDraftToLibrary = () => {
    if (!draftQuiz.questions?.length) return;
    const updated = saveQuizToLibrary({
      title: draftQuiz.title || 'Đề trắc nghiệm',
      timeLimit: draftQuiz.timeLimit,
      questions: draftQuiz.questions,
    });
    setLibrary(updated);
    toast.success('Đã lưu đề vào Thư viện cá nhân.');
  };

  const handleStartQuiz = () => {
    if (!draftQuiz.title?.trim() || (draftQuiz.questions?.length || 0) === 0) return;
    const now = Date.now();
    const tl = draftQuiz.timeLimit && draftQuiz.timeLimit > 0 ? draftQuiz.timeLimit : undefined;
    const quiz: Quiz = {
      id: String(now),
      title: draftQuiz.title.trim(),
      questions: draftQuiz.questions || [],
      timeLimit: tl,
      endsAt: tl ? now + tl * 1000 : null,
      createdAt: now,
    };
    setLibrary(saveQuizToLibrary(quiz));
    setActiveQuiz(quiz);
    setDraftQuiz({ title: '', questions: [] });
    setView('active');

    if (roomId) {
      socket.emit('quiz:start', { roomId, quiz });
    }
  };

  const handleEndQuiz = async () => {
    if (await uiConfirm('Bạn có chắc chắn muốn kết thúc bài tập này?', { title: 'Kết thúc bài tập', danger: true })) {
      setActiveQuiz(null);
      setLiveAppendOpen(false);
      setLivePending([]);
      setView('list');
      if (roomId) {
        socket.emit('quiz:end', { roomId });
      }
    }
  };

  /** AI tạo thêm câu hỏi trong lúc bài kiểm tra đang diễn ra (tự tránh trùng đề hiện tại) */
  const handleLiveAiGenerate = async () => {
    if (!activeQuiz) return;
    setLiveGenerating(true);
    try {
      const tk = localStorage.getItem('token') || '';
      const hostSecret = getHostSecret(roomId) || getHostSecret(parentId);
      const res = await fetch(apiUrl('/api/ai/generate-quiz'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tk ? { Authorization: 'Bearer ' + tk } : {}),
        },
        body: JSON.stringify({
          topic: liveTopic.trim() || activeQuiz.title,
          count: liveCount,
          difficulty: liveDifficulty,
          questionType: liveType,
          language: selectedLanguage?.name || 'python',
          sourceCode: liveUseCode && hasRealCode ? code : '',
          context: [
            ...activeQuiz.questions.map((q) => q.question),
            ...livePending.map((q) => q.question),
          ],
          roomId,
          hostSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.questions) || data.questions.length === 0) {
        toast.error(data?.error || 'AI chưa tạo được câu hỏi bổ sung');
        return;
      }
      const nextList: QuizQuestion[] = data.questions.map((q: any) => ({
        ...q,
        id: q.id || Math.random().toString(36).slice(2, 11),
      }));
      setLivePending(nextList);
      setLiveSelectedIds(new Set(nextList.map((q) => q.id)));
      toast.success(`AI đã soạn ${nextList.length} câu bổ sung — kiểm tra rồi bấm đẩy vào đề!`);
    } catch {
      toast.error('Lỗi kết nối khi gọi AI tạo thêm câu hỏi');
    } finally {
      setLiveGenerating(false);
    }
  };

  const handleConfirmLiveAppend = () => {
    if (!activeQuiz || !roomId) return;
    const picked = livePending.filter((q) => liveSelectedIds.has(q.id));
    if (picked.length === 0) {
      toast.warning('Chọn ít nhất 1 câu hỏi để bổ sung vào bài đang thi.');
      return;
    }
    const extraSeconds = activeQuiz.endsAt && liveExtraMinutes > 0 ? liveExtraMinutes * 60 : 0;
    socket.emit('quiz:append-questions', { roomId, questions: picked, extraSeconds }, (res: any) => {
      if (res?.ok) {
        setLivePending([]);
        setLiveSelectedIds(new Set());
        setLiveAppendOpen(false);
        const latest = useMeetingStore.getState().activeQuiz;
        if (latest) setLibrary(saveQuizToLibrary(latest));
        toast.success(`Đã bổ sung ${res.added} câu mới vào bài kiểm tra đang diễn ra!`);
      } else {
        toast.error(res?.error || 'Không bổ sung được câu hỏi');
      }
    });
  };

  const handleExtendTime = (minutes: number) => {
    if (!roomId || !activeQuiz) return;
    socket.emit('quiz:extend-time', { roomId, extraSeconds: minutes * 60 }, (res: any) => {
      if (res?.error) toast.error(res.error);
    });
  };

  if (view === 'adaptive') {
    return isHost ? <AdaptiveQuizManager onBack={() => setView('list')} /> : <AdaptiveQuizRunner />;
  }

  if (view === 'create') {
    const qCount = draftQuiz.questions?.length || 0;
    return (
      <div className="flex flex-col h-full bg-raised text-white overflow-hidden font-sans border-l border-line">
        <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-overlay/80 border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-lg bg-accent/15 text-accent">
              <Layers size={13} />
            </div>
            <h2 className="text-xs font-bold text-white">Thiết kế bài tập</h2>
          </div>
          <div className="flex items-center gap-1">
            {hasCcToken && (
              <button
                onClick={() => {
                  const next = !showCcBank;
                  setShowCcBank(next);
                  if (next) {
                    setShowLibrary(false);
                    void loadCodeClassBank();
                  }
                }}
                className={`flex items-center gap-1 rounded-ctl px-2 py-1 text-[11px] font-semibold transition-all active:scale-95 ${
                  showCcBank ? 'bg-accent/20 text-accent' : 'text-muted hover:bg-line hover:text-white'
                }`}
                title="Nhặt câu hỏi đã gán kỹ năng từ Kho CodeClass"
              >
                <Database size={12} /> Kho CodeClass
              </button>
            )}
            <button
              onClick={() => {
                setShowLibrary((v) => !v);
                setShowCcBank(false);
              }}
              className={`flex items-center gap-1 rounded-ctl px-2 py-1 text-[11px] font-semibold transition-all active:scale-95 ${
                showLibrary ? 'bg-accent/20 text-accent' : 'text-muted hover:bg-line hover:text-white'
              }`}
              title="Thư viện đề đã lưu"
            >
              <BookOpen size={12} /> {library.length > 0 ? `Thư viện (${library.length})` : 'Thư viện'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-ctl p-1.5 text-muted hover:bg-line hover:text-white active:scale-95"
              title="Nhập đề từ file JSON"
            >
              <Upload size={13} />
            </button>
            {qCount > 0 && (
              <button
                onClick={() => exportQuizJson(draftQuiz)}
                className="rounded-ctl p-1.5 text-muted hover:bg-line hover:text-white active:scale-95"
                title="Xuất đề ra file JSON"
              >
                <Download size={13} />
              </button>
            )}
            <button
              onClick={() => setView('list')}
              className="text-[11px] font-semibold text-muted hover:text-white px-2 py-1 rounded-ctl hover:bg-line transition-all"
            >
              Quay lại
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-raised">
          {/* Kho câu hỏi CodeClass */}
          {showCcBank && (
            <div className="anim-popover rounded-card border border-accent/35 bg-overlay p-3 space-y-2.5 shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-accent">Kho câu hỏi chuẩn hóa CodeClass</span>
                <div className="flex items-center gap-1">
                  <div className="relative">
                    <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="text"
                      value={ccBankSearch}
                      onChange={(e) => setCcBankSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void loadCodeClassBank(ccBankSearch)}
                      placeholder="Tìm câu hỏi..."
                      className="w-36 rounded-ctl border border-line bg-base/80 py-1 pl-6 pr-2 text-[11px] text-white focus:border-accent focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => void loadCodeClassBank(ccBankSearch)}
                    className="rounded-ctl bg-accent/15 px-2 py-1 text-[10px] font-bold text-accent hover:bg-accent/25"
                  >
                    Tìm
                  </button>
                </div>
              </div>
              {ccBankLoading ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted">
                  <Loader2 size={14} className="animate-spin text-accent" /> Đang tải Kho CodeClass...
                </div>
              ) : ccBankItems.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted">Không tìm thấy câu hỏi phù hợp trong Quiz Bank / Bài học.</p>
              ) : (
                <div className="max-h-52 space-y-1.5 overflow-y-auto custom-scrollbar">
                  {ccBankItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-line bg-raised px-2.5 py-2 hover:border-line-strong"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[11px] font-medium text-white">{item.question}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                          <span>{item.sourceTitle}</span>
                          {item.skillName && (
                            <span className="rounded bg-accent/15 px-1.5 py-0.5 font-medium text-accent">
                              {item.skillName}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleImportCcQuestion(item)}
                        className="shrink-0 rounded-ctl bg-accent px-2 py-1 text-[10px] font-bold text-accent-ink hover:opacity-90"
                      >
                        + Thêm
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Thư viện đề gần đây */}
          {showLibrary && (
            <div className="anim-popover rounded-card border border-line-strong bg-overlay p-3 space-y-2.5 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-accent">Thư viện đề đã lưu ({library.length})</span>
                {qCount > 0 && (
                  <button
                    onClick={handleSaveDraftToLibrary}
                    className="rounded-ctl bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent hover:bg-accent/25"
                  >
                    + Lưu bản nháp
                  </button>
                )}
              </div>
              {library.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted">Chưa có đề nào được lưu. Khi phát đề, hệ thống sẽ tự lưu tại đây.</p>
              ) : (
                <div className="max-h-44 space-y-1.5 overflow-y-auto custom-scrollbar">
                  {library.map((tpl) => (
                    <div key={tpl.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-raised px-3 py-2 hover:border-line-strong transition-colors">
                      <button onClick={() => handleLoadFromLibrary(tpl)} className="min-w-0 flex-1 text-left">
                        <div className="truncate text-xs font-semibold text-white hover:text-accent">{tpl.title}</div>
                        <div className="text-[10px] text-muted">
                          {tpl.questions.length} câu {tpl.timeLimit ? `· ${Math.round(tpl.timeLimit / 60)} phút` : '· Tự do'}
                        </div>
                      </button>
                      <button onClick={() => exportQuizJson(tpl)} className="rounded p-1 text-muted hover:bg-line hover:text-white" title="Xuất JSON">
                        <Download size={12} />
                      </button>
                      <button onClick={() => setLibrary(deleteQuizFromLibrary(tpl.id))} className="rounded p-1 text-muted hover:bg-danger/15 hover:text-danger" title="Xóa">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Thông tin chung: Tiêu đề & Thời gian */}
          <div className="rounded-card border border-line bg-overlay/70 p-3.5 space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted">Tiêu đề bài kiểm tra</label>
              <input
                type="text"
                value={draftQuiz.title || ''}
                onChange={(e) => setDraftQuiz({ ...draftQuiz, title: e.target.value })}
                placeholder="VD: Kiểm tra vòng lặp Python (tự điền khi AI tạo)..."
                className="w-full bg-base/80 border border-line rounded-ctl px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-accent transition-colors placeholder:text-muted/70"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                  <Clock size={12} className="text-accent" /> Thời gian làm bài
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 rounded-ctl bg-base/80 p-1 border border-line">
                {TIME_LIMIT_OPTIONS.map((opt) => {
                  const active = (draftQuiz.timeLimit || 0) === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDraftQuiz({ ...draftQuiz, timeLimit: opt.value > 0 ? opt.value : undefined })}
                      className={`rounded-md py-1 text-[11px] font-semibold transition-all ${
                        active ? 'bg-accent text-accent-ink shadow-sm' : 'text-muted hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* AI Generator Card */}
          <div className="rounded-card border border-accent/30 bg-gradient-to-br from-accent/12 via-overlay to-overlay p-4 space-y-3.5 shadow-lg shadow-black/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-6 w-6 place-items-center rounded-lg bg-accent/20 text-accent">
                  <Sparkles size={13} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white leading-none">AI Soạn đề thông minh</h3>
                  <p className="text-[10px] text-muted mt-0.5">Chuẩn cấu trúc JSON · Tự xáo trộn đáp án</p>
                </div>
              </div>
              <span className="rounded-full border border-line-strong bg-base/70 px-2 py-0.5 font-mono text-[10px] font-semibold text-accent uppercase">
                {selectedLanguage?.name || 'python'}
              </span>
            </div>

            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Mô tả chủ đề muốn kiểm tra (VD: Vòng lặp for/while, list slicing, hàm đệ quy...)"
              className="w-full bg-base/80 border border-line-strong rounded-ctl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-accent min-h-[64px] resize-none placeholder:text-muted/70"
            />

            {/* Độ khó — segmented pill bar */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-muted">Độ khó</span>
              <div className="grid grid-cols-4 gap-1 rounded-ctl bg-base/80 p-1 border border-line">
                {DIFFICULTY_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setAiDifficulty(d.value)}
                    className={`rounded-md py-1 text-[11px] font-semibold transition-all ${
                      aiDifficulty === d.value
                        ? 'bg-accent/20 text-accent border border-accent/40'
                        : 'text-muted hover:text-white border border-transparent'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dạng câu hỏi — segmented pill bar */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-muted">Dạng câu hỏi</span>
              <div className="grid grid-cols-4 gap-1 rounded-ctl bg-base/80 p-1 border border-line">
                {TYPE_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setAiQuestionType(t.value)}
                    className={`rounded-md py-1 text-[11px] font-semibold transition-all ${
                      aiQuestionType === t.value
                        ? 'bg-accent/20 text-accent border border-accent/40'
                        : 'text-muted hover:text-white border border-transparent'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ngữ cảnh 1 chạm: Code & Đề bài */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={!hasRealCode}
                onClick={() => setUseCodeContext((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-40 ${
                  useCodeContext && hasRealCode
                    ? 'border-accent bg-accent/20 text-accent'
                    : 'border-line bg-base/70 text-muted hover:text-white'
                }`}
                title={hasRealCode ? 'AI sẽ ra câu hỏi bám sát đoạn code đang mở' : 'Chưa có code trên trình soạn thảo'}
              >
                <Code2 size={12} /> Từ Code đang mở
              </button>
              <button
                type="button"
                disabled={!activeAssignment}
                onClick={() => setUseAssignmentContext((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-40 ${
                  useAssignmentContext && activeAssignment
                    ? 'border-accent bg-accent/20 text-accent'
                    : 'border-line bg-base/70 text-muted hover:text-white'
                }`}
                title={activeAssignment ? `Dùng ngữ cảnh đề bài: ${activeAssignment.name}` : 'Chưa có đề bài đang chiếu'}
              >
                <FileText size={12} /> Từ Đề bài{activeAssignment ? `: ${activeAssignment.name.slice(0, 14)}` : ''}
              </button>
            </div>

            {/* Số câu + Nút tạo */}
            <div className="flex items-center gap-2 pt-0.5">
              <div className="flex items-center gap-1 rounded-ctl border border-line bg-base/80 p-1">
                {COUNT_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setAiCount(n)}
                    className={`h-6 w-6 rounded text-[11px] font-bold transition-all ${
                      aiCount === n ? 'bg-accent text-accent-ink' : 'text-muted hover:text-white'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                onClick={handleAiGenerate}
                disabled={
                  isGenerating ||
                  (!aiPrompt.trim() && !(useCodeContext && hasRealCode) && !(useAssignmentContext && activeAssignment))
                }
                className="flex-1 py-2 bg-accent hover:brightness-110 active:scale-[0.98] disabled:bg-elevated disabled:text-muted rounded-ctl text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-accent-ink shadow-md shadow-accent/15"
              >
                {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles size={13} />}
                {isGenerating ? `Đang tạo ${aiCount} câu…` : `Tạo ${aiCount} câu với AI`}
              </button>
            </div>

            {aiError && (
              <div className="rounded-ctl border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] font-medium text-danger">
                {aiError}
              </div>
            )}

            {isGenerating && (
              <div className="space-y-2 pt-1">
                <div className="h-12 w-full rounded-lg skeleton-shimmer" />
                <div className="h-12 w-11/12 rounded-lg skeleton-shimmer" />
              </div>
            )}
          </div>

          {/* Toggle Thêm câu thủ công gọn gàng */}
          <div className="rounded-card border border-line bg-overlay/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowManualForm((v) => !v)}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-white/85 hover:bg-overlay transition-colors"
            >
              <span className="flex items-center gap-2">
                <Plus size={14} className="text-accent" /> Thêm câu hỏi thủ công
              </span>
              <ChevronRight size={14} className={`text-muted transition-transform ${showManualForm ? 'rotate-90' : ''}`} />
            </button>

            {showManualForm && (
              <div className="p-3.5 pt-1 space-y-2.5 border-t border-line/70 animate-in slide-in-from-top-2">
                <textarea
                  value={currentQuestion.question}
                  onChange={(e) => setCurrentQuestion({ ...currentQuestion, question: e.target.value })}
                  placeholder="Nội dung câu hỏi (hỗ trợ Markdown & khối ```code```)..."
                  className="w-full bg-base/80 border border-line rounded-ctl px-3 py-2 text-xs focus:outline-none focus:border-accent min-h-[66px] resize-none text-white placeholder:text-muted/70"
                />

                <div className="grid grid-cols-1 gap-1.5">
                  {currentQuestion.options?.map((opt, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-ctl border transition-all ${
                        currentQuestion.correctAnswer === idx ? 'bg-emerald-500/10 border-emerald-500/35' : 'bg-base/70 border-line'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setCurrentQuestion({ ...currentQuestion, correctAnswer: idx })}
                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-all ${
                          currentQuestion.correctAnswer === idx
                            ? 'bg-emerald-500 text-white'
                            : 'bg-elevated text-muted hover:text-white'
                        }`}
                        title="Đánh dấu đáp án đúng"
                      >
                        {String.fromCharCode(65 + idx)}
                      </button>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...(currentQuestion.options || [])];
                          newOpts[idx] = e.target.value;
                          setCurrentQuestion({ ...currentQuestion, options: newOpts });
                        }}
                        placeholder={`Lựa chọn ${String.fromCharCode(65 + idx)}`}
                        className="flex-1 bg-transparent border-none px-1.5 py-0.5 text-xs focus:outline-none text-white placeholder:text-muted/70"
                      />
                    </div>
                  ))}
                </div>

                <input
                  type="text"
                  value={currentQuestion.explanation}
                  onChange={(e) => setCurrentQuestion({ ...currentQuestion, explanation: e.target.value })}
                  placeholder="Giải thích đáp án (không bắt buộc)..."
                  className="w-full bg-base/80 border border-line rounded-ctl px-3 py-2 text-xs focus:outline-none focus:border-accent text-gray-200 placeholder:text-muted/70"
                />

                <button
                  onClick={handleAddQuestion}
                  disabled={!currentQuestion.question?.trim()}
                  className="w-full py-2 bg-elevated hover:bg-line-strong active:scale-[0.98] disabled:opacity-40 text-white rounded-ctl text-xs font-bold transition-all border border-line-strong"
                >
                  + Thêm vào danh sách
                </button>
              </div>
            )}
          </div>

          {/* Danh sách câu hỏi đã soạn */}
          {qCount > 0 && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-white">
                  Danh sách câu hỏi <span className="text-accent">({qCount})</span>
                </span>
                <span className="text-[10px] text-muted">Bấm vào câu để chỉnh sửa</span>
              </div>

              <div className="space-y-2.5">
                {draftQuiz.questions?.map((q, idx) => {
                  const isRegen = regeneratingId === q.id;
                  const isEditing = editingId === q.id;
                  return (
                    <div
                      key={q.id}
                      className={`group overflow-hidden rounded-card border transition-all ${
                        isEditing ? 'border-accent/50 bg-overlay shadow-lg' : 'border-line bg-overlay/75 hover:border-line-strong'
                      }`}
                    >
                      <div
                        onClick={() => setEditingId(isEditing ? null : q.id)}
                        className="p-3 cursor-pointer space-y-2"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`text-[11px] font-bold w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                              isEditing ? 'bg-accent text-accent-ink' : 'bg-elevated text-accent'
                            }`}
                          >
                            {idx + 1}
                          </span>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {q.difficulty && DIFF_LABEL[q.difficulty] && (
                                <span className={`inline-block rounded-full border px-2 py-0.2 text-[9px] font-bold ${DIFF_BADGE[q.difficulty] || ''}`}>
                                  {DIFF_LABEL[q.difficulty]}
                                </span>
                              )}
                            </div>
                            <div className={`text-xs font-semibold text-white/95 leading-snug ${isEditing ? '' : 'line-clamp-3'}`}>
                              <QuizMarkdown content={q.question} />
                            </div>
                          </div>

                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRegenerateSingle(q);
                              }}
                              disabled={isRegen}
                              className="p-1.5 rounded-ctl text-muted hover:bg-accent/15 hover:text-accent transition-colors"
                              title="Tạo lại đúng câu này bằng AI"
                            >
                              <RefreshCw size={12} className={isRegen ? 'animate-spin text-accent' : ''} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveQuestion(idx, -1);
                              }}
                              disabled={idx === 0}
                              className="p-1.5 rounded-ctl text-muted hover:bg-line hover:text-white disabled:opacity-25"
                              title="Đưa lên"
                            >
                              <ArrowUp size={12} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveQuestion(idx, 1);
                              }}
                              disabled={idx === qCount - 1}
                              className="p-1.5 rounded-ctl text-muted hover:bg-line hover:text-white disabled:opacity-25"
                              title="Đưa xuống"
                            >
                              <ArrowDown size={12} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeQuestion(q.id);
                              }}
                              className="p-1.5 rounded-ctl text-muted hover:bg-danger/15 hover:text-danger"
                              title="Xóa câu"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Preview 4 đáp án gọn gàng khi chưa mở sửa */}
                        {!isEditing && (
                          <div className="grid grid-cols-2 gap-1.5 pl-8">
                            {q.options.map((opt, oIdx) => {
                              const isRight = oIdx === q.correctAnswer;
                              return (
                                <div
                                  key={oIdx}
                                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] truncate ${
                                    isRight
                                      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300 font-semibold'
                                      : 'border-line/70 bg-raised/70 text-muted'
                                  }`}
                                >
                                  <span className="font-bold shrink-0">{String.fromCharCode(65 + oIdx)}.</span>
                                  <span className="truncate"><QuizMarkdown content={opt} inline /></span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Edit Form */}
                      {isEditing && (
                        <div className="p-3.5 bg-raised/90 border-t border-line space-y-3 animate-in slide-in-from-top-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-accent">Nội dung câu hỏi</label>
                            <textarea
                              value={q.question}
                              onChange={(e) => handleUpdateQuestion({ ...q, question: e.target.value })}
                              className="w-full bg-base/80 border border-line rounded-ctl px-3 py-2 text-xs focus:outline-none focus:border-accent min-h-[64px]"
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-1.5">
                            {q.options.map((opt, oIdx) => (
                              <div key={oIdx} className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuestion({ ...q, correctAnswer: oIdx })}
                                  className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                    q.correctAnswer === oIdx ? 'bg-emerald-500 text-white' : 'bg-elevated text-muted'
                                  }`}
                                >
                                  {String.fromCharCode(65 + oIdx)}
                                </button>
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => {
                                    const newOptions = [...q.options];
                                    newOptions[oIdx] = e.target.value;
                                    handleUpdateQuestion({ ...q, options: newOptions });
                                  }}
                                  className="flex-1 bg-base/80 border border-line rounded-ctl px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-accent"
                                />
                              </div>
                            ))}
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted">Giải thích đáp án</label>
                            <textarea
                              value={q.explanation || ''}
                              onChange={(e) => handleUpdateQuestion({ ...q, explanation: e.target.value })}
                              className="w-full bg-base/80 border border-line rounded-ctl px-3 py-1.5 text-xs text-gray-300 min-h-[48px] resize-none focus:outline-none focus:border-accent"
                              placeholder="Giải thích..."
                            />
                          </div>

                          <button
                            onClick={() => setEditingId(null)}
                            className="w-full py-1.5 bg-accent/15 text-accent rounded-ctl text-xs font-bold hover:bg-accent/25 transition-colors"
                          >
                            Hoàn tất chỉnh sửa
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 bg-overlay/90 border-t border-line shrink-0">
          <button
            disabled={!draftQuiz.title?.trim() || qCount === 0}
            onClick={handleStartQuiz}
            className="w-full py-3 bg-accent hover:brightness-110 active:scale-[0.98] disabled:bg-elevated disabled:text-muted text-accent-ink rounded-xl text-xs font-bold shadow-lg shadow-accent/15 transition-all flex items-center justify-center gap-2"
          >
            <Send size={14} />
            Phát đề cho lớp học ({qCount} câu)
          </button>
        </div>
      </div>
    );
  }

  if (view === 'active' && activeQuiz) {
    const pctDone = studentCount > 0 ? Math.min(100, Math.round((quizResponses.length / studentCount) * 100)) : 0;
    return (
      <div className="flex flex-col h-full bg-raised text-white overflow-hidden font-sans border-l border-line">
        <div className="flex items-center justify-between px-4 py-3 bg-overlay/80 border-b border-line shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-full bg-ok animate-pulse shrink-0" />
            <h2 className="text-xs font-bold text-white truncate">{activeQuiz.title}</h2>
          </div>
          {isHost && (
            <button
              onClick={handleEndQuiz}
              className="text-xs font-semibold text-danger hover:bg-danger/15 px-2.5 py-1 rounded-ctl transition-colors shrink-0"
            >
              Kết thúc
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {/* Tóm tắt trạng thái & tiến độ */}
          <div className="rounded-card border border-line bg-overlay p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/15 text-accent">
                  <Send size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-white truncate">{activeQuiz.title}</h3>
                  <p className="text-[11px] text-muted">
                    {activeQuiz.questions.length} câu hỏi
                    {activeQuiz.timeLimit ? ` · ${Math.round(activeQuiz.timeLimit / 60)} phút` : ' · Tự do'}
                  </p>
                </div>
              </div>
              {isHost && (
                <button
                  onClick={() => setView('results')}
                  className="shrink-0 inline-flex items-center gap-1 rounded-ctl bg-accent px-2.5 py-1.5 text-[11px] font-bold text-accent-ink hover:brightness-110 active:scale-95"
                >
                  <BarChart2 size={13} /> Thống kê
                </button>
              )}
            </div>

            {/* Đồng hồ theo dõi thời gian làm bài trực tiếp */}
            <div
              className={`rounded-xl border p-3 space-y-2 transition-colors ${
                quizClock.isExpired || quizClock.isUrgent
                  ? 'border-danger/50 bg-danger/10'
                  : quizClock.isWarning
                    ? 'border-warn/45 bg-warn/10'
                    : 'border-line-strong bg-base/75'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className={`flex items-center gap-1.5 text-[11px] font-bold ${
                      quizClock.isExpired || quizClock.isUrgent
                        ? 'text-danger'
                        : quizClock.isWarning
                          ? 'text-warn'
                          : 'text-gray-200'
                    }`}
                  >
                    <Clock size={12} className={quizClock.isExpired || quizClock.isUrgent ? 'text-danger' : 'text-accent'} />
                    <span>
                      {quizClock.isTimed
                        ? quizClock.isExpired
                          ? 'Đã hết thời gian làm bài'
                          : 'Thời gian làm bài còn lại'
                        : 'Thời gian đã trôi qua'}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted mt-0.5 tabular-nums">
                    {quizClock.isTimed
                      ? `Đã trôi qua ${formatQuizClock(quizClock.elapsedSec)} · Tổng ${Math.max(1, Math.round((quizClock.totalSec || 0) / 60))} phút`
                      : 'Chế độ tự do · Bấm +2p / +5p để đặt đếm ngược'}
                  </p>
                </div>
                <div
                  className={`shrink-0 font-mono text-2xl font-black tabular-nums tracking-tight ${
                    quizClock.isExpired || quizClock.isUrgent
                      ? 'text-danger animate-pulse'
                      : quizClock.isWarning
                        ? 'text-warn'
                        : quizClock.isTimed
                          ? 'text-accent'
                          : 'text-white'
                  }`}
                >
                  {quizClock.isTimed
                    ? formatQuizClock(quizClock.remainingSec ?? 0)
                    : formatQuizClock(quizClock.elapsedSec)}
                </div>
              </div>

              {quizClock.isTimed && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                      quizClock.isExpired || quizClock.isUrgent
                        ? 'bg-danger'
                        : quizClock.isWarning
                          ? 'bg-warn'
                          : 'bg-accent'
                    }`}
                    style={{ width: `${quizClock.remainingPct ?? 0}%` }}
                  />
                </div>
              )}

              {quizClock.isExpired && isHost && (
                <p className="text-[10px] font-medium text-danger/90 leading-snug">
                  Hết giờ — học viên đang tự nộp bài. Bấm <strong>+2p / +5p</strong> nếu muốn gia hạn hoặc bấm <strong>Kết thúc</strong>.
                </p>
              )}
            </div>

            {isHost ? (
              <>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted font-medium">Tiến độ nộp bài</span>
                    <span className="font-bold text-accent tabular-nums">
                      {quizResponses.length}/{studentCount} ({pctDone}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-base">
                    <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pctDone}%` }} />
                  </div>
                </div>

                {/* Thanh tác vụ nhanh trong lúc đang thi: AI tạo thêm câu + Gia hạn giờ */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-line">
                  <button
                    onClick={() => setLiveAppendOpen((v) => !v)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-ctl border px-3 py-2 text-xs font-bold transition-all active:scale-95 ${
                      liveAppendOpen
                        ? 'border-accent bg-accent text-accent-ink'
                        : 'border-accent/40 bg-accent/15 text-accent hover:bg-accent/25'
                    }`}
                  >
                    <Sparkles size={13} />
                    {liveAppendOpen ? 'Thu gọn thêm đề AI' : 'AI tạo thêm câu hỏi'}
                  </button>
                  <button
                    onClick={() => handleExtendTime(2)}
                    className="inline-flex items-center gap-1 rounded-ctl border border-line-strong bg-raised px-2.5 py-2 text-[11px] font-semibold text-gray-200 hover:border-accent/40 hover:text-white active:scale-95"
                    title="Cộng thêm 2 phút cho cả lớp"
                  >
                    <Clock size={12} className="text-accent" /> +2p
                  </button>
                  <button
                    onClick={() => handleExtendTime(5)}
                    className="inline-flex items-center gap-1 rounded-ctl border border-line-strong bg-raised px-2.5 py-2 text-[11px] font-semibold text-gray-200 hover:border-accent/40 hover:text-white active:scale-95"
                    title="Cộng thêm 5 phút cho cả lớp"
                  >
                    <Clock size={12} className="text-accent" /> +5p
                  </button>
                </div>
              </>
            ) : (
              <div className="px-3 py-2 bg-accent/10 border border-accent/25 rounded-ctl text-xs font-semibold text-accent text-center">
                Làm bài trực tiếp ở tab Trắc nghiệm bên cạnh
              </div>
            )}
          </div>

          {/* Panel AI tạo thêm câu hỏi ngay trong lúc bài thi đang diễn ra */}
          {isHost && liveAppendOpen && (
            <div className="anim-popover rounded-card border border-accent/35 bg-gradient-to-br from-accent/12 via-overlay to-overlay p-4 space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles size={13} className="text-accent" /> Bổ sung câu hỏi khi đang thi
                  </h4>
                  <p className="text-[10px] text-muted mt-0.5">
                    AI tự tránh trùng {activeQuiz.questions.length} câu hiện có · Đẩy trực tiếp xuống máy học sinh
                  </p>
                </div>
              </div>

              <input
                type="text"
                value={liveTopic}
                onChange={(e) => setLiveTopic(e.target.value)}
                placeholder={`Chủ đề thêm (mặc định: ${activeQuiz.title})`}
                className="w-full rounded-ctl border border-line-strong bg-base/80 px-3 py-2 text-xs text-white outline-none focus:border-accent"
              />

              <div className="grid grid-cols-4 gap-1 rounded-ctl border border-line bg-base/80 p-1">
                {DIFFICULTY_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setLiveDifficulty(d.value)}
                    className={`rounded-md py-1 text-[11px] font-semibold transition-all ${
                      liveDifficulty === d.value
                        ? 'bg-accent/20 text-accent border border-accent/40'
                        : 'text-muted hover:text-white border border-transparent'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-1 rounded-ctl border border-line bg-base/80 p-1">
                {TYPE_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setLiveType(t.value)}
                    className={`rounded-md py-1 text-[11px] font-semibold transition-all ${
                      liveType === t.value
                        ? 'bg-accent/20 text-accent border border-accent/40'
                        : 'text-muted hover:text-white border border-transparent'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-ctl border border-line bg-base/80 p-1">
                  {[1, 2, 3, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setLiveCount(n)}
                      className={`h-6 w-6 rounded text-[11px] font-bold ${
                        liveCount === n ? 'bg-accent text-accent-ink' : 'text-muted hover:text-white'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {hasRealCode && (
                  <button
                    type="button"
                    onClick={() => setLiveUseCode((v) => !v)}
                    className={`inline-flex items-center gap-1 rounded-ctl border px-2 py-1.5 text-[10px] font-bold ${
                      liveUseCode ? 'border-accent bg-accent/20 text-accent' : 'border-line bg-base/80 text-muted hover:text-white'
                    }`}
                    title="Lấy ngữ cảnh từ đoạn code đang mở"
                  >
                    <Code2 size={11} /> Code
                  </button>
                )}
                <button
                  onClick={handleLiveAiGenerate}
                  disabled={liveGenerating}
                  className="flex-1 py-2 rounded-ctl bg-accent text-accent-ink text-xs font-bold hover:brightness-110 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {liveGenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {liveGenerating ? `Đang tạo ${liveCount} câu…` : `Soạn thêm ${liveCount} câu`}
                </button>
              </div>

              {liveGenerating && (
                <div className="space-y-2">
                  <div className="h-12 w-full rounded-lg skeleton-shimmer" />
                  <div className="h-12 w-11/12 rounded-lg skeleton-shimmer" />
                </div>
              )}

              {/* Xem trước câu AI vừa sinh để duyệt trước khi đẩy xuống lớp */}
              {livePending.length > 0 && !liveGenerating && (
                <div className="space-y-2.5 pt-2 border-t border-line">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-accent">
                      Xem trước ({liveSelectedIds.size}/{livePending.length} câu chọn)
                    </span>
                    <button
                      onClick={() => { setLivePending([]); setLiveSelectedIds(new Set()); }}
                      className="text-[10px] text-muted hover:text-white"
                    >
                      Bỏ qua
                    </button>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-0.5">
                    {livePending.map((q, idx) => {
                      const checked = liveSelectedIds.has(q.id);
                      return (
                        <div
                          key={q.id}
                          onClick={() =>
                            setLiveSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(q.id)) next.delete(q.id);
                              else next.add(q.id);
                              return next;
                            })
                          }
                          className={`cursor-pointer rounded-xl border p-2.5 space-y-1.5 transition-all ${
                            checked ? 'border-accent/60 bg-raised' : 'border-line bg-base/50 opacity-60'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {}}
                              className="mt-0.5 accent-amber-500"
                            />
                            <div className="flex-1 min-w-0 text-xs font-semibold text-white">
                              <span className="text-accent mr-1">+{idx + 1}.</span>
                              <QuizMarkdown content={q.question} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1 pl-5">
                            {q.options.map((opt, oIdx) => (
                              <div
                                key={oIdx}
                                className={`truncate rounded px-1.5 py-0.5 text-[10px] ${
                                  oIdx === q.correctAnswer
                                    ? 'bg-emerald-500/15 text-emerald-300 font-semibold'
                                    : 'bg-overlay text-muted'
                                }`}
                              >
                                {String.fromCharCode(65 + oIdx)}. <QuizMarkdown content={opt} inline />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {activeQuiz.endsAt && (
                    <div className="flex items-center justify-between rounded-ctl border border-line bg-base/70 px-3 py-1.5 text-[11px]">
                      <span className="text-muted font-medium">Cộng thêm giờ khi thêm câu:</span>
                      <select
                        value={liveExtraMinutes}
                        onChange={(e) => setLiveExtraMinutes(Number(e.target.value) || 0)}
                        className="rounded border border-line-strong bg-raised px-2 py-0.5 text-xs font-bold text-white outline-none"
                      >
                        <option value={0}>Không cộng</option>
                        <option value={1}>+1 phút</option>
                        <option value={2}>+2 phút</option>
                        <option value={3}>+3 phút</option>
                        <option value={5}>+5 phút</option>
                      </select>
                    </div>
                  )}

                  <button
                    onClick={handleConfirmLiveAppend}
                    disabled={liveSelectedIds.size === 0}
                    className="w-full py-2.5 rounded-xl bg-ok text-black font-bold text-xs hover:brightness-110 active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Plus size={14} /> Bổ sung {liveSelectedIds.size} câu vào đề đang thi ngay
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Danh sách câu đang thi (bấm để xem trước đầy đủ nội dung & đáp án) */}
          {isHost && (() => {
            const allOpen =
              activeQuiz.questions.length > 0 &&
              activeQuiz.questions.every((q, idx) => expandedActiveIds.has(String(q.id || idx)));
            return (
              <div className="rounded-card border border-line bg-overlay/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div>
                    <span className="text-[11px] font-bold text-white">
                      Bộ đề đang mở ({activeQuiz.questions.length} câu)
                    </span>
                    <p className="text-[10px] text-muted">Bấm vào câu để xem chi tiết & đáp án đúng</p>
                  </div>
                  {activeQuiz.questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedActiveIds(
                          allOpen ? new Set() : new Set(activeQuiz.questions.map((q, idx) => String(q.id || idx))),
                        )
                      }
                      className="shrink-0 inline-flex items-center gap-1 rounded-ctl border border-line bg-raised px-2 py-1 text-[10px] font-semibold text-accent hover:border-accent/40"
                    >
                      <Eye size={11} /> {allOpen ? 'Thu gọn' : 'Xem tất cả'}
                    </button>
                  )}
                </div>
                <div className="space-y-1.5 max-h-80 overflow-y-auto custom-scrollbar pr-0.5">
                  {activeQuiz.questions.map((q, idx) => {
                    const key = String(q.id || idx);
                    const isOpen = expandedActiveIds.has(key);
                    const toggleOpen = () =>
                      setExpandedActiveIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      });
                    return (
                      <div
                        key={key}
                        className={`overflow-hidden rounded-xl border transition-all ${
                          isOpen ? 'border-accent/45 bg-raised' : 'border-line/70 bg-raised hover:border-line-strong'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={toggleOpen}
                          className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs"
                        >
                          <span
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold ${
                              isOpen ? 'bg-accent text-accent-ink' : 'bg-elevated text-accent'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span className="flex-1 truncate text-gray-200">
                            {q.question.replace(/```[\s\S]*?```/g, '[code]').replace(/[`*_#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)}
                          </span>
                          {q.appendedAt && (
                            <span className="shrink-0 rounded-full bg-ok/15 px-1.5 py-0.2 text-[9px] font-bold text-ok">
                              Mới thêm
                            </span>
                          )}
                          {isOpen ? (
                            <ChevronUp size={13} className="shrink-0 text-accent" />
                          ) : (
                            <ChevronDown size={13} className="shrink-0 text-muted" />
                          )}
                        </button>

                        {isOpen && (
                          <div className="border-t border-line/70 bg-base/65 p-3 space-y-2.5">
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
                                    <span className="font-bold shrink-0">{String.fromCharCode(65 + oIdx)}.</span>
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
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // Results View for Host
  if (view === 'results' && activeQuiz) {
    return (
      <div className="flex flex-col h-full bg-raised text-white overflow-hidden font-sans border-l border-line">
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-overlay/80 border-b border-line shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart2 size={15} className="text-accent shrink-0" />
            <h2 className="text-xs font-bold text-white truncate">Báo cáo kết quả</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                quizClock.isExpired || quizClock.isUrgent
                  ? 'border-danger/40 bg-danger/15 text-danger animate-pulse'
                  : quizClock.isWarning
                    ? 'border-warn/40 bg-warn/15 text-warn'
                    : 'border-line-strong bg-base text-accent'
              }`}
              title={quizClock.isTimed ? 'Thời gian làm bài còn lại' : 'Thời gian đã trôi qua'}
            >
              <Clock size={11} />
              {quizClock.isTimed
                ? quizClock.isExpired
                  ? 'Hết giờ'
                  : formatQuizClock(quizClock.remainingSec ?? 0)
                : formatQuizClock(quizClock.elapsedSec)}
            </span>
            <button
              onClick={() => setView('active')}
              className="text-xs font-semibold text-muted hover:text-white px-2 py-1 rounded-ctl hover:bg-line transition-colors"
            >
              Quay lại
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
          {/* Metric cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-card border border-line bg-overlay p-3.5 text-center">
              <p className="text-[11px] text-muted font-medium">Đã nộp bài</p>
              <p className="mt-1 text-2xl font-extrabold text-white tabular-nums">
                {quizResponses.length}
                <span className="text-xs font-semibold text-muted ml-1">/ {studentCount}</span>
              </p>
            </div>
            <div className="rounded-card border border-accent/25 bg-accent/10 p-3.5 text-center">
              <p className="text-[11px] text-accent font-medium">Điểm trung bình</p>
              <p className="mt-1 text-2xl font-extrabold text-accent tabular-nums">
                {averageScorePercent}
                <span className="text-sm font-semibold ml-0.5">%</span>
              </p>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Award size={14} className="text-accent" /> Bảng thành tích
            </h3>
            {rankings.length === 0 ? (
              <div className="rounded-card border border-line bg-overlay/50 py-6 flex flex-col items-center justify-center text-muted">
                <User size={24} className="mb-1.5 opacity-40" />
                <p className="text-xs">Chưa có học viên nộp bài</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {rankings.map((r, i) => (
                  <div
                    key={r.userId}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border ${
                      i === 0 ? 'border-accent/35 bg-accent/10' : 'border-line bg-overlay'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 text-center text-xs font-bold shrink-0">
                        {i < 3 ? MEDALS[i] : <span className="text-muted">#{i + 1}</span>}
                      </span>
                      <span className="text-xs font-semibold text-white truncate">{r.userName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-muted flex items-center gap-1 tabular-nums">
                        <Clock size={11} /> {r.timeTaken}s
                      </span>
                      <span className="text-xs font-extrabold text-accent tabular-nums">
                        {r.score}/{activeQuiz.questions.length}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Per-question A/B/C/D breakdown */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-white">Phân tích từng câu & phân bố A/B/C/D</h3>
            <div className="space-y-3">
              {questionStats.map((stat, idx) => (
                <div key={stat.id} className="p-3.5 bg-overlay border border-line rounded-card space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="text-[11px] font-bold text-accent bg-accent/15 w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="text-xs font-semibold text-white/95 flex-1 min-w-0">
                      <QuizMarkdown content={stat.question} />
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                        stat.percentCorrect >= 70
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : stat.percentCorrect >= 40
                            ? 'bg-accent/15 text-accent'
                            : 'bg-rose-500/15 text-rose-400'
                      }`}
                    >
                      {stat.percentCorrect}% đúng
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                    {stat.distribution.slice(0, 4).map((cnt, oIdx) => {
                      const pct = stat.totalCount > 0 ? Math.round((cnt / stat.totalCount) * 100) : 0;
                      const isRight = oIdx === stat.correctAnswer;
                      return (
                        <div
                          key={oIdx}
                          className={`rounded-lg border px-2 py-1.5 ${
                            isRight
                              ? 'border-emerald-500/40 bg-emerald-500/10'
                              : cnt > 0
                                ? 'border-rose-500/30 bg-rose-500/10'
                                : 'border-line bg-raised'
                          }`}
                          title={stat.options[oIdx] || ''}
                        >
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span className={isRight ? 'text-emerald-400' : 'text-muted'}>
                              {String.fromCharCode(65 + oIdx)}
                              {isRight ? ' ✓' : ''}
                            </span>
                            <span className="text-white tabular-nums">{cnt}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-base">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${isRight ? 'bg-emerald-400' : 'bg-rose-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-3.5 bg-overlay/90 border-t border-line shrink-0">
          <button
            onClick={handleEndQuiz}
            className="w-full py-2.5 bg-danger/15 text-danger border border-danger/35 rounded-xl text-xs font-bold hover:bg-danger hover:text-white active:scale-[0.98] transition-all"
          >
            Đóng bài tập & tổng kết điểm LP
          </button>
        </div>
      </div>
    );
  }

  // Landing screen (sleek mode cards + library)
  return (
    <div className="flex flex-col h-full bg-raised text-white p-5 overflow-y-auto custom-scrollbar font-sans border-l border-line">
      <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />

      <div className="my-auto mx-auto w-full max-w-[360px] space-y-6 py-4">
        <div className="text-center space-y-2.5">
          <div className="relative mx-auto w-fit">
            <div className="absolute -inset-3 rounded-full bg-accent/15 blur-2xl" />
            <div className="relative grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/20 to-overlay text-accent shadow-lg">
              <HelpCircle size={28} />
            </div>
          </div>
          <h2 className="text-lg font-extrabold tracking-tight text-white">Trắc nghiệm thông minh</h2>
          <p className="text-xs text-muted leading-relaxed">
            Soạn đề tự động bằng AI theo độ khó, code đang mở hoặc chạy Adaptive Quiz thích ứng theo lỗi sai của lớp.
          </p>
        </div>

        {isHost ? (
          <div className="space-y-3">
            <button
              onClick={() => setView('create')}
              className="group w-full text-left rounded-card border border-accent/35 bg-gradient-to-br from-accent/18 via-overlay to-overlay p-4 transition-all hover:border-accent hover:-translate-y-0.5 active:scale-[0.99] shadow-lg shadow-black/20"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink shadow-md">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">Tạo bộ đề kiểm tra bằng AI</div>
                    <div className="text-[11px] text-muted mt-0.5">Sinh 3–15 câu, hẹn giờ & thêm câu trực tiếp khi đang thi</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-accent transition-transform group-hover:translate-x-0.5 shrink-0" />
              </div>
            </button>

            <button
              onClick={() => setView('adaptive')}
              className="group w-full text-left rounded-card border border-purple-500/30 bg-gradient-to-br from-purple-500/12 via-overlay to-overlay p-4 transition-all hover:border-purple-400/60 hover:-translate-y-0.5 active:scale-[0.99] shadow-lg shadow-black/20"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    <Zap size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">Adaptive Quiz (Live)</div>
                    <div className="text-[11px] text-muted mt-0.5">Ra từng câu, AI bắt lỗi sai & gợi ý câu tiếp</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-purple-300 transition-transform group-hover:translate-x-0.5 shrink-0" />
              </div>
            </button>

            {/* Thư viện đề gần đây & Nhập JSON */}
            <div className="rounded-card border border-line bg-overlay/70 p-3 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold text-muted flex items-center gap-1.5">
                  <BookOpen size={12} className="text-accent" /> Đề gần đây ({library.length})
                </span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
                >
                  <Upload size={11} /> Nhập JSON
                </button>
              </div>
              {library.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-muted/80">
                  Các đề bạn tạo sẽ tự động lưu tại đây để tái sử dụng.
                </p>
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto custom-scrollbar">
                  {library.slice(0, 5).map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => handleLoadFromLibrary(tpl)}
                      className="group flex w-full items-center justify-between gap-2 rounded-lg border border-line/70 bg-raised px-3 py-2 text-left text-xs transition-all hover:border-accent/40 hover:bg-elevated"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-white group-hover:text-accent">{tpl.title}</div>
                        <div className="text-[10px] text-muted">
                          {tpl.questions.length} câu {tpl.timeLimit ? `· ${Math.round(tpl.timeLimit / 60)} phút` : ''}
                        </div>
                      </div>
                      <CheckCircle2 size={13} className="text-muted/40 group-hover:text-accent shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-card border border-line bg-overlay/60 p-6 flex flex-col items-center gap-3 text-muted">
            <Loader2 className="animate-spin text-accent w-5 h-5" />
            <p className="text-xs font-semibold text-white/80">Đang chờ giảng viên mở bài trắc nghiệm…</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizManager;
