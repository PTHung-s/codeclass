import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { HelpCircle, CheckCircle2, XCircle, Clock, Loader2, Bot, Award, Trophy } from 'lucide-react';
import { socket } from '../services/socket';
import { playSoundCue } from '../lib/soundCue';
import QuizMarkdown from './QuizMarkdown';

const MEDALS = ['🥇', '🥈', '🥉'];

export const AdaptiveQuizRunner: React.FC = () => {
  const {
    activeAdaptive,
    adaptiveCurrentQuestion,
    adaptiveQuestionEndsAt,
    adaptiveQuestionIndex,
    adaptiveMyAnswer,
    adaptiveMyResult,
    adaptiveMyCorrectAnswer,
    adaptiveMyExplanation,
    adaptiveScores,
    adaptiveQuestionResults,
    adaptiveRankings,
    setAdaptiveMyAnswer,
    adaptiveCountdown,
    attachToAi,
    roomId,
  } = useMeetingStore();

  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [qTimeLeft, setQTimeLeft] = useState<number | null>(null);
  const [viewedResultIdx, setViewedResultIdx] = useState<number | null>(null);
  const prevResultRef = useRef<boolean | null>(null);
  const mySocketId = useMeetingStore((s) => s.mySocketId) || socket.id;

  useEffect(() => {
    setViewedResultIdx(null);
  }, [adaptiveQuestionResults.length]);

  const activeResultIdx = useMemo(() => {
    if (adaptiveQuestionResults.length === 0) return -1;
    if (viewedResultIdx !== null && viewedResultIdx >= 0 && viewedResultIdx < adaptiveQuestionResults.length) {
      return viewedResultIdx;
    }
    return adaptiveQuestionResults.length - 1;
  }, [adaptiveQuestionResults.length, viewedResultIdx]);

  // Phản hồi âm thanh ngay khi nhận kết quả đúng / sai
  useEffect(() => {
    if (adaptiveMyResult !== null && adaptiveMyResult !== prevResultRef.current) {
      playSoundCue(adaptiveMyResult ? 'runOk' : 'runErr');
    }
    prevResultRef.current = adaptiveMyResult;
  }, [adaptiveMyResult]);

  // Đếm ngược giữa 2 câu
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

  // Đếm ngược thời gian câu hỏi hiện tại
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

  const handleAnswer = useCallback(
    (optionIndex: number) => {
      if (adaptiveMyAnswer !== null || !adaptiveCurrentQuestion) return;
      if (optionIndex < 0 || optionIndex >= adaptiveCurrentQuestion.options.length) return;
      setAdaptiveMyAnswer(optionIndex);
      if (roomId) {
        socket.emit('adaptive:answer', { roomId, selectedOption: optionIndex });
      }
    },
    [adaptiveMyAnswer, adaptiveCurrentQuestion, setAdaptiveMyAnswer, roomId],
  );

  // Phím tắt nhanh 1-4 / A-D để chọn đáp án khi câu đang mở (bỏ qua nếu đang gõ trong input/Monaco)
  useEffect(() => {
    if (!adaptiveCurrentQuestion || adaptiveMyAnswer !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || t.closest('.monaco-editor'))
      ) {
        return;
      }
      const k = e.key.toLowerCase();
      const map: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 };
      if (k in map) {
        e.preventDefault();
        handleAnswer(map[k]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adaptiveCurrentQuestion, adaptiveMyAnswer, handleAnswer]);

  const askAiExplain = (questionText: string, options: string[], selectedIdx: number | null, correctIdx: number | undefined) => {
    const letters = ['A', 'B', 'C', 'D'];
    const optLines = options.map((o, i) => `${letters[i]}. ${o}`).join('\n');
    const summary =
      `Câu hỏi Adaptive: ${questionText}\n${optLines}\n` +
      `Tôi đã chọn: ${selectedIdx !== null && selectedIdx >= 0 ? letters[selectedIdx] : 'Chưa kịp chọn'}\n` +
      `Đáp án đúng: ${typeof correctIdx === 'number' ? letters[correctIdx] : '?'}\n` +
      `Hãy giải thích ngắn gọn và dễ hiểu vì sao đáp án đúng là như vậy.`;
    attachToAi(summary, 'Giải thích câu Adaptive', 'code');
  };

  // Final rankings screen
  if (!activeAdaptive && adaptiveRankings) {
    const totalDone = adaptiveQuestionResults.length;
    return (
      <div className="flex flex-col h-full bg-raised text-white overflow-hidden font-sans border-l border-line">
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-overlay border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <Trophy size={15} className="text-accent" />
            <h2 className="text-xs font-bold text-white">Kết thúc — Bảng xếp hạng</h2>
          </div>
          {totalDone > 0 && (
            <span className="rounded-full bg-elevated px-2.5 py-0.5 text-[10px] font-semibold text-muted">
              {totalDone} câu hỏi
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
          {adaptiveRankings.map((r, i) => {
            const isMe = r.socketId === mySocketId;
            const pct = totalDone > 0 ? Math.round((r.score / totalDone) * 100) : null;
            return (
              <div
                key={r.socketId}
                className={`p-3 rounded-xl border space-y-1.5 ${
                  isMe
                    ? 'bg-accent/15 border-accent/45'
                    : i === 0
                      ? 'bg-accent/10 border-accent/30'
                      : 'bg-overlay border-line'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 text-center text-sm font-bold shrink-0">
                      {i < 3 ? MEDALS[i] : <span className="text-xs text-muted">#{i + 1}</span>}
                    </span>
                    <span className="text-sm font-bold text-white truncate">
                      {r.userName}
                      {isMe && <span className="ml-1.5 rounded bg-accent/25 px-1.5 py-0.5 text-[9px] font-bold text-accent">Bạn</span>}
                    </span>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <span className="text-base font-black text-accent">
                      {totalDone > 0 ? `${r.score}/${totalDone}` : `${r.score} đ`}
                    </span>
                    {pct !== null && <span className="ml-1.5 text-[11px] font-semibold text-muted">({pct}%)</span>}
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

  if (!activeAdaptive) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-overlay text-muted p-8 text-center border-l border-line">
        <HelpCircle size={32} className="mb-4 opacity-20 text-muted" />
        <p className="text-[11px] font-black uppercase tracking-widest text-muted">Không có phiên adaptive đang diễn ra</p>
      </div>
    );
  }

  // Waiting for next question (Màn hình công bố câu hỏi + đáp án đúng + phân bố + bảng điểm từng người)
  if (!adaptiveCurrentQuestion) {
    const viewedResult = activeResultIdx >= 0 ? adaptiveQuestionResults[activeResultIdx] : null;
    const totalDone = adaptiveQuestionResults.length;
    const myViewedResult = viewedResult?.results.find((r) => r.socketId === mySocketId);
    const optCount = viewedResult ? Math.max(4, viewedResult.question.options?.length || 4) : 4;
    const dist = (() => {
      if (!viewedResult) return Array.from({ length: optCount }, () => 0);
      if (Array.isArray(viewedResult.distribution) && viewedResult.distribution.length >= optCount) {
        return viewedResult.distribution.slice(0, optCount);
      }
      const d = Array.from({ length: optCount }, () => 0);
      for (const r of viewedResult.results) {
        if (r.selectedOption >= 0 && r.selectedOption < d.length) d[r.selectedOption]++;
      }
      return d;
    })();

    // Gộp bảng điểm tích lũy + kết quả câu đang xem cho từng học viên
    const scoreRows = (() => {
      const byId = new Map<
        string,
        { socketId: string; userName: string; score: number; selectedOption?: number; isCorrect?: boolean }
      >();
      for (const s of adaptiveScores) {
        byId.set(s.socketId, { socketId: s.socketId, userName: s.userName, score: s.score });
      }
      if (viewedResult) {
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
      }
      return Array.from(byId.values()).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return Number(!!b.isCorrect) - Number(!!a.isCorrect);
      });
    })();

    const correctIdx = typeof viewedResult?.question.correctAnswer === 'number' ? viewedResult.question.correctAnswer : -1;
    const accuracyPct =
      viewedResult && viewedResult.totalCount > 0
        ? Math.round((viewedResult.correctCount / viewedResult.totalCount) * 100)
        : 0;

    return (
      <div className="flex flex-col h-full bg-raised text-white overflow-hidden font-sans border-l border-line">
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-overlay border-b border-line shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Clock size={14} className="text-accent animate-pulse shrink-0" />
            <h2 className="text-xs font-bold text-white truncate">{activeAdaptive.title}</h2>
          </div>
          {countdown > 0 ? (
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/15 px-2.5 py-0.5 text-[11px] font-bold text-accent tabular-nums">
              Câu tiếp sau {countdown}s
            </span>
          ) : (
            <span className="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted">
              <Loader2 className="w-3 h-3 animate-spin" /> Chờ câu tiếp…
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-base custom-scrollbar">
          <div className="max-w-2xl mx-auto space-y-4">
            {viewedResult ? (
              <div className="anim-modal rounded-2xl border border-line bg-raised p-4 sm:p-5 space-y-4 shadow-sm">
                {/* Bộ chuyển xem lại các câu đã chốt */}
                {totalDone > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    {adaptiveQuestionResults.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setViewedResultIdx(idx)}
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all ${
                          idx === activeResultIdx
                            ? 'bg-accent text-accent-ink shadow-sm'
                            : 'border border-line bg-overlay text-muted hover:text-white'
                        }`}
                      >
                        Câu {idx + 1}
                      </button>
                    ))}
                  </div>
                )}

                {/* Banner kết quả cá nhân + tổng quan lớp */}
                <div
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-3 ${
                    myViewedResult
                      ? myViewedResult.isCorrect
                        ? 'border-emerald-500/40 bg-emerald-500/12'
                        : myViewedResult.selectedOption < 0
                          ? 'border-warn/40 bg-warn/10'
                          : 'border-rose-500/40 bg-rose-500/12'
                      : 'border-accent/35 bg-accent/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {myViewedResult ? (
                      myViewedResult.isCorrect ? (
                        <CheckCircle2 size={22} className="text-emerald-400 shrink-0" />
                      ) : myViewedResult.selectedOption < 0 ? (
                        <Clock size={22} className="text-warn shrink-0" />
                      ) : (
                        <XCircle size={22} className="text-rose-400 shrink-0" />
                      )
                    ) : (
                      <CheckCircle2 size={22} className="text-accent shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-white">
                        {myViewedResult
                          ? myViewedResult.isCorrect
                            ? `Câu ${activeResultIdx + 1}: Chính xác! +1 điểm`
                            : myViewedResult.selectedOption < 0
                              ? `Câu ${activeResultIdx + 1}: Hết giờ — chưa kịp chọn`
                              : `Câu ${activeResultIdx + 1}: Chưa chính xác (Bạn chọn ${String.fromCharCode(65 + myViewedResult.selectedOption)})`
                          : `Công bố đáp án · Câu ${activeResultIdx + 1}`}
                      </p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {correctIdx >= 0 ? `Đáp án đúng: ${String.fromCharCode(65 + correctIdx)} · ` : ''}
                        {viewedResult.correctCount}/{viewedResult.totalCount} bạn trả lời đúng ({accuracyPct}%)
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${
                      accuracyPct >= 70
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : accuracyPct >= 40
                          ? 'bg-accent/20 text-accent'
                          : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {accuracyPct}% đúng
                  </span>
                </div>

                {/* Nội dung đầy đủ câu hỏi vừa công bố */}
                <div className="rounded-xl border border-line/80 bg-overlay/70 p-3.5 text-[14px] font-semibold text-gray-100 leading-relaxed">
                  <QuizMarkdown content={viewedResult.question.question} />
                </div>

                {/* 4 Đáp án kèm đáp án đúng, lựa chọn của bạn & biểu đồ phân bố cả lớp */}
                <div className="space-y-2">
                  {(viewedResult.question.options || []).map((opt, oIdx) => {
                    const isRight = oIdx === correctIdx;
                    const isMine = myViewedResult?.selectedOption === oIdx;
                    const cnt = dist[oIdx] || 0;
                    const pct = viewedResult.totalCount > 0 ? Math.round((cnt / viewedResult.totalCount) * 100) : 0;

                    return (
                      <div
                        key={oIdx}
                        className={`rounded-xl border p-3 space-y-2 transition-all ${
                          isRight
                            ? 'border-emerald-500/50 bg-emerald-500/12'
                            : isMine
                              ? 'border-rose-500/45 bg-rose-500/10'
                              : 'border-line bg-overlay/60'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-extrabold ${
                              isRight
                                ? 'bg-emerald-500 text-black'
                                : isMine
                                  ? 'bg-rose-500 text-white'
                                  : 'bg-elevated text-muted'
                            }`}
                          >
                            {String.fromCharCode(65 + oIdx)}
                          </span>
                          <div className="flex-1 min-w-0 text-[13px] font-semibold text-gray-100">
                            <QuizMarkdown content={opt} inline />
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {isRight && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                  <CheckCircle2 size={11} /> Đáp án đúng
                                </span>
                              )}
                              {isMine && (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    isRight ? 'bg-emerald-500/25 text-emerald-200' : 'bg-rose-500/20 text-rose-300'
                                  }`}
                                >
                                  Bạn chọn
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 text-right tabular-nums">
                            <div className={`text-xs font-extrabold ${isRight ? 'text-emerald-300' : 'text-white'}`}>{cnt}</div>
                            <div className="text-[10px] text-muted">{pct}%</div>
                          </div>
                        </div>

                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-base">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isRight ? 'bg-emerald-400' : isMine ? 'bg-rose-400' : 'bg-muted/50'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Giải thích + Hỏi AI */}
                {viewedResult.question.explanation && (
                  <div className="rounded-xl border-l-4 border-accent bg-overlay/80 p-3.5 space-y-1.5">
                    <span className="text-[11px] font-bold text-accent">Giải thích đáp án</span>
                    <div className="text-xs text-gray-200 leading-relaxed">
                      <QuizMarkdown content={viewedResult.question.explanation} />
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      askAiExplain(
                        viewedResult.question.question,
                        viewedResult.question.options,
                        myViewedResult?.selectedOption ?? null,
                        viewedResult.question.correctAnswer,
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-ctl border border-accent/35 bg-accent/15 px-3 py-1.5 text-[11px] font-bold text-accent hover:bg-accent/25 active:scale-95 transition-all"
                  >
                    <Bot size={13} /> Hỏi AI giải thích thêm
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-raised p-8 text-center space-y-2.5">
                <Loader2 className="animate-spin w-6 h-6 text-accent mx-auto" />
                <p className="text-sm font-bold text-white">Phiên Adaptive đã bắt đầu</p>
                <p className="text-xs text-muted">Đang chờ giáo viên phát câu hỏi đầu tiên…</p>
              </div>
            )}

            {/* Bảng thống kê điểm chi tiết từng thành viên */}
            {scoreRows.length > 0 && (
              <div className="rounded-2xl border border-line bg-raised p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Award size={14} className="text-accent" /> Thống kê điểm lớp
                  </h3>
                  <span className="text-[11px] text-muted tabular-nums">
                    {scoreRows.length} thành viên · {totalDone} câu
                  </span>
                </div>

                <div className="space-y-1.5">
                  {scoreRows.map((s, i) => {
                    const isMe = s.socketId === mySocketId;
                    const pct = totalDone > 0 ? Math.round((s.score / totalDone) * 100) : 0;
                    return (
                      <div
                        key={s.socketId}
                        className={`rounded-xl border px-3 py-2 space-y-1.5 ${
                          isMe
                            ? 'border-accent/45 bg-accent/12'
                            : i === 0
                              ? 'border-accent/25 bg-overlay'
                              : 'border-line bg-overlay/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-6 text-center text-xs font-bold shrink-0">
                              {i < 3 ? MEDALS[i] : <span className="text-muted">#{i + 1}</span>}
                            </span>
                            <span className="text-xs font-bold text-white truncate">
                              {s.userName}
                              {isMe && (
                                <span className="ml-1.5 rounded bg-accent/25 px-1.5 py-0.2 text-[9px] font-bold text-accent">
                                  Bạn
                                </span>
                              )}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 tabular-nums">
                            {viewedResult && s.selectedOption !== undefined && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  s.isCorrect
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : s.selectedOption < 0
                                      ? 'bg-elevated text-muted'
                                      : 'bg-rose-500/15 text-rose-300'
                                }`}
                              >
                                {s.isCorrect
                                  ? `${String.fromCharCode(65 + s.selectedOption)} +1`
                                  : s.selectedOption >= 0
                                    ? `${String.fromCharCode(65 + s.selectedOption)} ✗`
                                    : 'Chưa chọn'}
                              </span>
                            )}
                            <span className="text-xs font-extrabold text-accent">
                              {totalDone > 0 ? `${s.score}/${totalDone}` : `${s.score} đ`}
                            </span>
                            {totalDone > 0 && <span className="text-[10px] text-muted w-8 text-right">{pct}%</span>}
                          </div>
                        </div>

                        {totalDone > 0 && (
                          <div className="h-1 w-full overflow-hidden rounded-full bg-base">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isMe ? 'bg-accent' : 'bg-emerald-400/75'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
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
  }

  // Showing current question
  const q = adaptiveCurrentQuestion;
  const hasAnswered = adaptiveMyAnswer !== null;

  return (
    <div className="flex flex-col h-full bg-raised text-white overflow-hidden font-sans border-l border-line">
      <div className="flex items-center justify-between px-4 py-2.5 bg-raised border-b border-line shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center text-accent border border-accent/20">
            <span className="text-xs font-black">{adaptiveQuestionIndex}</span>
          </div>
          <div>
            <h2 className="text-[11px] font-black text-gray-100 uppercase tracking-tighter truncate max-w-[160px]">
              {activeAdaptive.title}
            </h2>
            <span className="text-[8px] font-black text-accent uppercase tracking-widest">
              ADAPTIVE LIVE · Phím A-D / 1-4
            </span>
          </div>
        </div>
        {qTimeLeft !== null && (
          <div
            className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-xs font-black ${
              qTimeLeft <= 10
                ? 'border-danger/50 bg-danger/20 text-danger animate-pulse'
                : 'border-accent/30 bg-accent/15 text-accent'
            }`}
          >
            <Clock size={12} /> {qTimeLeft}s
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-base custom-scrollbar">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-raised p-6 rounded-2xl border border-line shadow-sm space-y-4 animate-fade-in">
            <div className="text-[14px] text-gray-100 font-bold">
              <QuizMarkdown content={q.question} />
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {q.options.map((opt: string, aIdx: number) => {
                const isSelected = adaptiveMyAnswer === aIdx;
                const showResult = adaptiveMyResult !== null;
                const correctIdx = adaptiveMyCorrectAnswer ?? q.correctAnswer;
                const isCorrectOption = showResult && aIdx === correctIdx;
                const isWrongSelected = showResult && isSelected && !adaptiveMyResult;

                let btnClass = 'bg-overlay border-line hover:border-accent/40 hover:bg-elevated text-gray-300';
                if (isSelected && !showResult) btnClass = 'bg-accent border-accent text-accent-ink shadow-md shadow-black/30';
                if (isCorrectOption) btnClass = 'bg-emerald-500/20 border-emerald-400 text-emerald-400';
                if (isWrongSelected) btnClass = 'bg-rose-500/20 border-rose-400 text-rose-400';

                return (
                  <button
                    key={aIdx}
                    onClick={() => handleAnswer(aIdx)}
                    disabled={hasAnswered}
                    className={`text-left px-5 py-3.5 rounded-xl text-[13px] transition-all active:scale-[0.99] border flex items-center gap-4 disabled:cursor-default ${btnClass}`}
                  >
                    <span
                      className={`w-6 h-6 shrink-0 rounded flex items-center justify-center text-[11px] font-black border transition-colors ${
                        isSelected ? 'bg-raised text-accent border-white' : 'bg-raised border-line-strong text-muted'
                      }`}
                    >
                      {String.fromCharCode(65 + aIdx)}
                    </span>
                    <span className="font-semibold flex-1 min-w-0">
                      <QuizMarkdown content={opt} inline />
                    </span>
                    {isCorrectOption && <CheckCircle2 size={16} className="ml-auto text-emerald-500 shrink-0" />}
                    {isWrongSelected && <XCircle size={16} className="ml-auto text-rose-500 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {hasAnswered && adaptiveMyResult === null && (
              <div className="flex items-center justify-center gap-2 py-3 text-muted">
                <Loader2 className="animate-spin w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">Đang chờ mọi người trả lời...</span>
              </div>
            )}

            {adaptiveMyResult !== null && (adaptiveMyExplanation || q.explanation) && (
              <div className="mt-4 p-4 bg-raised/60 rounded-xl border-l-4 border-accent space-y-2">
                <span className="text-[10px] font-black text-accent uppercase tracking-widest">Giải thích</span>
                <div className="text-[12px] text-gray-300">
                  <QuizMarkdown content={adaptiveMyExplanation || q.explanation || ''} />
                </div>
                {adaptiveMyResult === false && (
                  <button
                    onClick={() => askAiExplain(q.question, q.options, adaptiveMyAnswer, adaptiveMyCorrectAnswer ?? q.correctAnswer)}
                    className="inline-flex items-center gap-1.5 rounded-ctl border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent hover:bg-accent/20 active:scale-95"
                  >
                    <Bot size={12} /> Hỏi AI giải thích thêm
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdaptiveQuizRunner;
