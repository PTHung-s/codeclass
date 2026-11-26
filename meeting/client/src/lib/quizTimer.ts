import type { Quiz } from '../types/quiz';

export interface QuizClockSnapshot {
  isTimed: boolean;
  endsAt: number | null;
  remainingSec: number | null;
  elapsedSec: number;
  totalSec: number | null;
  remainingPct: number | null;
  isExpired: boolean;
  isWarning: boolean;
  isUrgent: boolean;
}

export function getQuizClock(quiz: Quiz | null | undefined, now: number): QuizClockSnapshot {
  if (!quiz) {
    return {
      isTimed: false,
      endsAt: null,
      remainingSec: null,
      elapsedSec: 0,
      totalSec: null,
      remainingPct: null,
      isExpired: false,
      isWarning: false,
      isUrgent: false,
    };
  }

  const createdAt = quiz.createdAt || now;
  const elapsedSec = Math.max(0, Math.floor((now - createdAt) / 1000));
  const endsAt =
    typeof quiz.endsAt === 'number' && quiz.endsAt > 0
      ? quiz.endsAt
      : quiz.timeLimit && quiz.timeLimit > 0
        ? createdAt + quiz.timeLimit * 1000
        : null;

  if (endsAt === null) {
    return {
      isTimed: false,
      endsAt: null,
      remainingSec: null,
      elapsedSec,
      totalSec: null,
      remainingPct: null,
      isExpired: false,
      isWarning: false,
      isUrgent: false,
    };
  }

  const remainingSec = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const derivedTotal = Math.max(1, quiz.timeLimit || Math.ceil((endsAt - createdAt) / 1000));
  const totalSec = Math.max(derivedTotal, remainingSec);
  const remainingPct = Math.min(100, Math.max(0, Math.round((remainingSec / totalSec) * 100)));

  return {
    isTimed: true,
    endsAt,
    remainingSec,
    elapsedSec,
    totalSec,
    remainingPct,
    isExpired: remainingSec === 0,
    isWarning: remainingSec > 0 && remainingSec <= 60,
    isUrgent: remainingSec > 0 && remainingSec <= 20,
  };
}

export function formatQuizClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
