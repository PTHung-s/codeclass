export type QuizDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';
export type QuizQuestionType = 'mixed' | 'code_output' | 'find_bug' | 'theory';

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer?: number; // Index of the correct option (chỉ có ở host hoặc sau khi nộp bài)
  explanation?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  skillId?: string;
  appendedAt?: number;
}

export interface QuizSubmissionReviewItem {
  id: string;
  correctAnswer: number;
  explanation?: string;
}

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  questions: QuizQuestion[];
  timeLimit?: number; // In seconds
  endsAt?: number | null;
  createdAt: number;
}

export interface QuizResponse {
  userId: string;
  userName: string;
  quizId: string;
  answers: {
    questionId: string;
    selectedOption: number;
    isCorrect: boolean;
  }[];
  score: number;
  timeTaken: number;
  completedAt: number;
}

export interface QuizStats {
  quizId: string;
  totalParticipants: number;
  questionStats: {
    questionId: string;
    correctCount: number;
    incorrectCount: number;
    distribution: number[]; // Count per option
  }[];
  rankings: {
    userId: string;
    userName: string;
    score: number;
    timeTaken: number;
  }[];
}

// === Adaptive Quiz Types ===

export interface AdaptiveSession {
  id: string;
  title: string;
  status: 'active' | 'ended';
  createdAt: number;
}

export interface AdaptiveQuestionResult {
  question: QuizQuestion;
  results: {
    socketId: string;
    userName: string;
    selectedOption: number;
    isCorrect: boolean;
  }[];
  correctCount: number;
  totalCount: number;
  distribution?: number[];
  forced?: boolean;
}

export interface AdaptiveTopicSuggestion {
  title: string;
  reason: string;
  suggestedDifficulty?: 'easy' | 'medium' | 'hard';
}

export interface AdaptiveRecommendation {
  topics: string[];
  questions: QuizQuestion[];
  questionsAlt: QuizQuestion[];
}
