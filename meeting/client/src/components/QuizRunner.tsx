import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { HelpCircle, CheckCircle2, Award, Clock, XCircle, ChevronRight, Info, Bot, Sparkles } from 'lucide-react';
import { socket } from '../services/socket';
import { toast, uiConfirm } from '../store/useUiStore';
import { playSoundCue } from '../lib/soundCue';
import QuizMarkdown from './QuizMarkdown';
import { AdaptiveQuizRunner } from './AdaptiveQuizRunner';
import AdaptiveQuizManager from './AdaptiveQuizManager';

export const QuizRunner: React.FC = () => {
  const { activeAdaptive, adaptiveRankings, isHost } = useMeetingStore();
  if (activeAdaptive || adaptiveRankings) {
    return isHost ? <AdaptiveQuizManager onBack={() => {}} embedded /> : <AdaptiveQuizRunner />;
  }
  return <StandardQuizRunner />;
};

const StandardQuizRunner: React.FC = () => {
  const { activeQuiz, roomId, myQuizSubmission, setMyQuizSubmission, attachToAi } = useMeetingStore();

  const [studentAnswers, setStudentAnswers] = useState<Record<string, number>>({});
  const [extraAnswers, setExtraAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittingExtra, setSubmittingExtra] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const startTime = useRef(Date.now());
  const autoSubmittedRef = useRef(false);

  const hasSubmitted = !!myQuizSubmission;
  const score = myQuizSubmission?.score ?? 0;
  const timeTaken = myQuizSubmission?.timeTaken ?? 0;

  useEffect(() => {
    autoSubmittedRef.current = false;
    if (!myQuizSubmission) {
      setStudentAnswers({});
      setElapsed(0);
      startTime.current = Date.now();
    } else {
      const restored: Record<string, number> = {};
      myQuizSubmission.answers.forEach((a, idx) => {
        if (typeof a.selectedOption === 'number' && a.selectedOption >= 0) {
          restored[a.questionId || `q-${idx}`] = a.selectedOption;
        }
      });
      setStudentAnswers(restored);
    }
    setSubmitting(false);
    setSubmittingExtra(false);
  }, [activeQuiz?.id, myQuizSubmission]);

  const answeredIdSet = new Set<string>(
    (myQuizSubmission?.answers || []).map((a) => String(a.questionId)),
  );
  const pendingExtraQuestions = hasSubmitted && activeQuiz
    ? activeQuiz.questions.filter((q, idx) => !answeredIdSet.has(String(q.id || `q-${idx}`)))
    : [];

  const handleSubmitExtra = () => {
    if (!activeQuiz || !roomId || submittingExtra || pendingExtraQuestions.length === 0) return;
    const payloadAnswers = pendingExtraQuestions.map((q) => ({
      questionId: q.id,
      selectedOption: extraAnswers[q.id] ?? -1,
    }));
    setSubmittingExtra(true);
    socket.emit('quiz:submit-extra', { roomId, answers: payloadAnswers }, (res: any) => {
      setSubmittingExtra(false);
      if (res && res.ok && res.response) {
        playSoundCue('runOk');
        setExtraAnswers({});
        setMyQuizSubmission({
          score: res.response.score,
          timeTaken: res.response.timeTaken,
          rank: res.rank,
          totalSubmissions: res.totalSubmissions,
          answers: res.response.answers,
          review: res.review,
        });
        toast.success('Đã nộp phần câu hỏi bổ sung!');
      } else {
        toast.error(res?.error || 'Không nộp được phần bổ sung');
      }
    });
  };

  const submitNow = useCallback(
    async (skipConfirm: boolean) => {
      if (!activeQuiz || hasSubmitted || submitting || !roomId) return;

      const unanswered = activeQuiz.questions.filter(
        (q, i) => studentAnswers[q.id || `q-${i}`] === undefined,
      ).length;

      if (
        !skipConfirm &&
        unanswered > 0 &&
        !(await uiConfirm(`Còn ${unanswered} câu chưa trả lời. Chắc chắn nộp bài?`, {
          title: 'Nộp bài tập',
          confirmLabel: 'Nộp bài',
        }))
      ) {
        return;
      }

      const payloadAnswers = activeQuiz.questions.map((q, qIdx) => {
        const key = q.id || `q-${qIdx}`;
        return {
          questionId: q.id || key,
          selectedOption: studentAnswers[key] ?? -1,
        };
      });

      setSubmitting(true);
      socket.emit('quiz:submit', { roomId, answers: payloadAnswers }, (res: any) => {
        setSubmitting(false);
        if (res && res.ok && res.response) {
          playSoundCue('runOk');
          setMyQuizSubmission({
            score: res.response.score,
            timeTaken: res.response.timeTaken,
            rank: res.rank,
            totalSubmissions: res.totalSubmissions,
            answers: res.response.answers,
            review: res.review,
          });
        } else {
          toast.error(res?.error || 'Không nộp được bài, vui lòng thử lại');
        }
      });
    },
    [activeQuiz, hasSubmitted, submitting, roomId, studentAnswers, setMyQuizSubmission],
  );

  // Đồng hồ đếm lên hoặc đếm ngược thật khi có timeLimit / endsAt
  useEffect(() => {
    if (hasSubmitted || !activeQuiz) {
      setRemaining(null);
      return;
    }
    const endsAt =
      activeQuiz.endsAt ||
      (activeQuiz.timeLimit && activeQuiz.timeLimit > 0
        ? (activeQuiz.createdAt || startTime.current) + activeQuiz.timeLimit * 1000
        : null);

    const tick = () => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
      if (endsAt) {
        const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        setRemaining(left);
        if (left === 0 && !autoSubmittedRef.current) {
          autoSubmittedRef.current = true;
          toast.warning('Đã hết thời gian làm bài — hệ thống tự động nộp bài!');
          void submitNow(true);
        }
      } else {
        setRemaining(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hasSubmitted, activeQuiz, submitNow]);

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (!activeQuiz) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-overlay text-muted p-8 text-center border-l border-line">
        <HelpCircle size={32} className="mb-4 opacity-20 text-muted" />
        <p className="text-[11px] font-black uppercase tracking-widest text-muted">Không có bài tập đang diễn ra</p>
      </div>
    );
  }

  const handleAnswerChange = (qId: string, qIdx: number, aIndex: number) => {
    if (hasSubmitted || submitting) return;
    const key = qId || `q-${qIdx}`;
    setStudentAnswers((prev) => ({
      ...prev,
      [key]: aIndex,
    }));
  };

  const answeredCount = activeQuiz.questions.filter(
    (q, idx) => studentAnswers[q.id || `q-${idx}`] !== undefined,
  ).length;
  const isUrgent = remaining !== null && remaining <= 30;

  const askAiAboutQuestion = (
    idx: number,
    questionText: string,
    options: string[],
    selectedIdx: number | undefined,
    correctIdx: number | undefined,
  ) => {
    const letters = ['A', 'B', 'C', 'D'];
    const optLines = options.map((o, i) => `${letters[i]}. ${o}`).join('\n');
    const summary =
      `Câu ${idx + 1}: ${questionText}\n${optLines}\n` +
      `Tôi đã chọn: ${selectedIdx !== undefined && selectedIdx >= 0 ? letters[selectedIdx] : 'Chưa chọn'}\n` +
      `Đáp án đúng: ${typeof correctIdx === 'number' ? letters[correctIdx] : '?'}\n` +
      `Hãy giải thích chi tiết tại sao đáp án đúng là vậy và chỉ ra chỗ dễ nhầm lẫn.`;
    attachToAi(summary, `Trắc nghiệm câu ${idx + 1}`, 'code');
  };

  return (
    <div className="flex flex-col h-full bg-raised text-white overflow-hidden font-sans border-l border-line">
      {/* Header + Progress bar */}
      <div className="flex flex-col border-b border-line bg-raised shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center text-accent border border-accent/20 shrink-0">
              <HelpCircle size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[11px] font-black text-gray-100 uppercase tracking-tighter truncate max-w-[200px]">
                {activeQuiz.title}
              </h2>
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-black text-accent uppercase tracking-widest">LIVE</span>
                <span className="text-[8px] text-muted font-bold uppercase tracking-widest">
                  • {!hasSubmitted ? `${answeredCount}/${activeQuiz.questions.length} ĐÃ CHỌN` : `${activeQuiz.questions.length} CÂU HỎI`}
                </span>
              </div>
            </div>
          </div>

          {!hasSubmitted && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-black font-mono ${
                isUrgent
                  ? 'border-danger/50 bg-danger/15 text-danger animate-pulse'
                  : 'border-line bg-overlay text-gray-200'
              }`}
              title={remaining !== null ? 'Thời gian còn lại' : 'Thời gian đã làm'}
            >
              <Clock size={11} className={isUrgent ? 'text-danger' : 'text-accent'} />
              <span>{fmtTime(remaining !== null ? remaining : elapsed)}</span>
            </div>
          )}
        </div>

        {/* Thanh tiến độ & chấm nhảy nhanh tới từng câu */}
        {!hasSubmitted && activeQuiz.questions.length > 1 && (
          <div className="px-4 pb-2.5 flex items-center gap-2 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-1">
              {activeQuiz.questions.map((q, idx) => {
                const done = studentAnswers[q.id || `q-${idx}`] !== undefined;
                return (
                  <button
                    key={q.id || idx}
                    onClick={() => {
                      document.getElementById(`quiz-q-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`h-5 min-w-5 rounded px-1 text-[10px] font-black transition-all active:scale-90 ${
                      done
                        ? 'bg-accent text-accent-ink'
                        : 'bg-overlay border border-line text-muted hover:text-white'
                    }`}
                    title={`Đi tới câu ${idx + 1}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            <div className="ml-auto h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-overlay">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${Math.round((answeredCount / activeQuiz.questions.length) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-base">
        <div className="max-w-2xl mx-auto space-y-6">
          {!hasSubmitted ? (
            <>
              {activeQuiz.questions.map((q, qIdx) => (
                <div
                  key={q.id || qIdx}
                  id={`quiz-q-${qIdx}`}
                  className="space-y-4 bg-raised p-5 rounded-2xl border border-line shadow-sm scroll-mt-4"
                >
                  <div className="flex gap-3.5">
                    <span className="shrink-0 w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-[11px] font-black text-accent">
                      {qIdx + 1}
                    </span>
                    <div className="text-[14px] text-gray-100 font-semibold flex-1 min-w-0">
                      {q.appendedAt && (
                        <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-ok/15 border border-ok/35 px-2 py-0.5 text-[10px] font-bold text-ok">
                          <Sparkles size={10} /> Mới thêm
                        </span>
                      )}
                      <QuizMarkdown content={q.question} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 pl-10">
                    {q.options.map((opt, aIdx) => {
                      const selectionKey = q.id || `q-${qIdx}`;
                      const isSelected = studentAnswers[selectionKey] === aIdx;

                      return (
                        <button
                          key={aIdx}
                          onClick={() => handleAnswerChange(q.id, qIdx, aIdx)}
                          className={`text-left px-4 py-3 rounded-xl text-[13px] transition-all active:scale-[0.99] border flex items-center gap-3.5 ${
                            isSelected
                              ? 'bg-accent border-accent text-accent-ink shadow-md'
                              : 'bg-overlay border-line hover:border-accent/40 hover:bg-elevated text-gray-300'
                          }`}
                        >
                          <span
                            className={`w-6 h-6 shrink-0 rounded flex items-center justify-center text-[11px] font-black border transition-colors ${
                              isSelected
                                ? 'bg-white text-accent-ink border-white'
                                : 'bg-elevated border-line-strong text-muted'
                            }`}
                          >
                            {String.fromCharCode(65 + aIdx)}
                          </span>
                          <span className="font-semibold flex-1 min-w-0">
                            <QuizMarkdown content={opt} inline />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="pt-4 pb-10 flex flex-col items-center gap-3">
                <button
                  onClick={() => void submitNow(false)}
                  disabled={submitting}
                  className="w-full py-3.5 bg-accent hover:brightness-110 active:scale-[0.99] disabled:opacity-60 text-accent-ink text-[12px] font-black rounded-xl transition-all shadow-lg uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  {submitting ? 'ĐANG CHẤM BÀI...' : `NỘP BÀI (${answeredCount}/${activeQuiz.questions.length} CÂU)`}
                  <ChevronRight size={16} />
                </button>
                <p className="text-[10px] text-muted font-bold uppercase tracking-widest italic">
                  * Kiểm tra kỹ trước khi nộp — kết quả & lời giải hiển thị ngay sau khi nộp *
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-6 py-2 animate-in fade-in slide-in-from-bottom-2">
              {/* Khung làm bổ sung RIÊNG cho học sinh đã nộp khi giáo viên thêm câu mới */}
              {pendingExtraQuestions.length > 0 && (
                <div className="rounded-2xl border border-accent/50 bg-gradient-to-br from-accent/15 via-raised to-raised p-5 space-y-4 shadow-lg">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-accent" />
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          Giáo viên vừa bổ sung {pendingExtraQuestions.length} câu hỏi mới!
                        </h3>
                        <p className="text-[11px] text-muted">
                          Các câu đã nộp trước đó được giữ nguyên — hãy làm thêm phần mới này để cập nhật điểm.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {pendingExtraQuestions.map((q, eIdx) => (
                      <div key={q.id} className="rounded-xl border border-line bg-overlay/80 p-4 space-y-3">
                        <div className="flex gap-2.5">
                          <span className="shrink-0 h-6 w-6 rounded-md bg-accent/20 text-accent text-[11px] font-bold grid place-items-center">
                            +{eIdx + 1}
                          </span>
                          <div className="text-xs font-semibold text-white flex-1 min-w-0">
                            <QuizMarkdown content={q.question} />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 pl-8">
                          {q.options.map((opt, aIdx) => {
                            const isSel = extraAnswers[q.id] === aIdx;
                            return (
                              <button
                                key={aIdx}
                                onClick={() => setExtraAnswers((prev) => ({ ...prev, [q.id]: aIdx }))}
                                className={`text-left px-3.5 py-2.5 rounded-xl text-xs transition-all border flex items-center gap-3 ${
                                  isSel
                                    ? 'bg-accent border-accent text-accent-ink font-bold'
                                    : 'bg-raised border-line hover:border-accent/40 text-gray-200'
                                }`}
                              >
                                <span className={`w-5 h-5 shrink-0 rounded flex items-center justify-center text-[10px] font-bold ${isSel ? 'bg-white text-accent-ink' : 'bg-elevated text-muted'}`}>
                                  {String.fromCharCode(65 + aIdx)}
                                </span>
                                <QuizMarkdown content={opt} inline />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleSubmitExtra}
                    disabled={submittingExtra}
                    className="w-full py-3 rounded-xl bg-accent text-accent-ink font-bold text-xs hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                  >
                    {submittingExtra ? 'Đang chấm phần bổ sung…' : `Nộp ${pendingExtraQuestions.length} câu bổ sung`}
                  </button>
                </div>
              )}

              <div className="p-6 bg-raised border border-line rounded-3xl flex flex-col items-center text-center space-y-5 shadow-sm">
                <div className="w-14 h-14 bg-accent/10 rounded-2xl flex items-center justify-center text-accent border border-accent/20">
                  <Award size={28} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Hoàn thành bài tập!</h3>
                  <p className="text-[11px] text-muted font-bold uppercase tracking-widest bg-elevated px-3 py-1 rounded-full inline-block">
                    Thời gian: {timeTaken}s
                  </p>
                </div>

                <div className="flex gap-3 w-full pt-2">
                  <div className="flex-1 py-3.5 bg-accent/10 border border-accent/20 rounded-2xl">
                    <p className="text-[10px] text-accent font-black uppercase tracking-widest mb-1">Kết quả</p>
                    <p className="text-3xl font-black text-accent">
                      {score}
                      <span className="text-sm text-accent/70 ml-1">/{activeQuiz.questions.length}</span>
                    </p>
                  </div>
                  <div className="flex-1 py-3.5 bg-overlay border border-line rounded-2xl">
                    <p className="text-[10px] text-muted font-black uppercase tracking-widest mb-1">Xếp hạng</p>
                    <p className="text-3xl font-black text-white">
                      {myQuizSubmission?.rank
                        ? `#${myQuizSubmission.rank}${myQuizSubmission.totalSubmissions ? `/${myQuizSubmission.totalSubmissions}` : ''}`
                        : '--'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[11px] font-black text-muted uppercase tracking-[0.2em] border-b border-line pb-2.5">
                  Xem lại bài làm & lời giải
                </h4>
                {activeQuiz.questions
                  .filter((q, idx) => answeredIdSet.has(String(q.id || `q-${idx}`)))
                  .map((q, idx) => {
                  const selectionKey = q.id || `q-${idx}`;
                  const selected = studentAnswers[selectionKey];
                  const rev = myQuizSubmission?.review?.find((rv) => rv.id === q.id) || myQuizSubmission?.review?.[idx];
                  const correctIdx = typeof rev?.correctAnswer === 'number' ? rev.correctAnswer : q.correctAnswer;
                  const explanation = rev?.explanation || q.explanation;
                  const isCorrect = selected === correctIdx;

                  return (
                    <div
                      key={q.id || idx}
                      className={`p-5 rounded-2xl border transition-all ${
                        isCorrect
                          ? 'bg-emerald-500/10 border-emerald-500/25'
                          : 'bg-rose-500/10 border-rose-500/25'
                      }`}
                    >
                      <div className="flex gap-3 mb-4">
                        <span
                          className={`shrink-0 w-6 h-6 rounded flex items-center justify-center text-[11px] font-black ${
                            isCorrect ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <div className="text-[13px] font-bold text-gray-100 flex-1 min-w-0">
                          <QuizMarkdown content={q.question} />
                        </div>
                      </div>

                      <div className="space-y-2 pl-9">
                        {q.options.map((opt, aIdx) => {
                          const isSelected = selected === aIdx;
                          const isCorrectOption = correctIdx === aIdx;

                          return (
                            <div
                              key={aIdx}
                              className={`text-[12px] font-bold flex items-center gap-2.5 py-1 ${
                                isCorrectOption ? 'text-emerald-400' : isSelected ? 'text-rose-400' : 'text-muted'
                              }`}
                            >
                              {isCorrectOption ? (
                                <CheckCircle2 size={14} className="shrink-0" />
                              ) : isSelected ? (
                                <XCircle size={14} className="shrink-0" />
                              ) : (
                                <span className="w-3.5 text-center text-[10px] opacity-60">{String.fromCharCode(65 + aIdx)}</span>
                              )}
                              <QuizMarkdown content={opt} inline />
                            </div>
                          );
                        })}

                        {explanation && (
                          <div className="mt-3 p-3.5 bg-raised/70 rounded-xl border-l-4 border-accent">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Info size={12} className="text-accent" />
                              <span className="text-[10px] font-black text-accent uppercase tracking-widest">Giải thích</span>
                            </div>
                            <div className="text-[12px] text-gray-300">
                              <QuizMarkdown content={explanation} />
                            </div>
                          </div>
                        )}

                        {!isCorrect && (
                          <div className="pt-2">
                            <button
                              onClick={() => askAiAboutQuestion(idx, q.question, q.options, selected, correctIdx)}
                              className="inline-flex items-center gap-1.5 rounded-ctl border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent transition-all hover:bg-accent/20 active:scale-95"
                            >
                              <Bot size={12} /> Hỏi AI giải thích thêm câu này
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
