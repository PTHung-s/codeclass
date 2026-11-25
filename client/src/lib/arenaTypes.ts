export type ArenaStatus = "lobby" | "generating" | "in_progress" | "finished";
export type ArenaPhase = "lobby" | "generating" | "countdown" | "question" | "reveal" | "podium";

export interface ArenaPlayer {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  totalScore: number;
  finalRank: number | null;
}

export interface ArenaQuestionPublic {
  id: string;
  orderIndex: number;
  language: string;
  title: string;
  statement: string;
  input: string;
  expectedOutput: string;
  shownCode: string;
  arenaType?: "debug" | "quiz";
  options?: string[];
  correctIndex?: number;
  explanation?: string | null;
  topic?: string | null;
  difficulty?: number;
  effectiveDifficulty?: number;
  calibrationSamples?: number;
  calibrationConfidence?: number;
  calibrationStatus?: string;
}

export interface ArenaRevealResult {
  userId: string;
  fullName: string;
  identified: boolean; // correctly highlighted the buggy line
  score: number;
  timeBonus: number;
  fixed: boolean; // code fix produced the expected output
  highlightedLines: number[];
  submittedCode: string | null;
  selectedIndex?: number | null;
  isCorrect?: boolean;
  responseTimeMs?: number | null;
}

export interface ArenaReveal {
  question: ArenaQuestionPublic & { hasBug: boolean; correctCode: string; bugDescription: string | null; buggyLineNumbers: number[] };
  results: ArenaRevealResult[];
  difficulty?: { before: number; after: number; samples: number; confidence: number; status: string };
}

export interface ArenaMatchMeta {
  id: string;
  title: string;
  status: ArenaStatus;
  phase: ArenaPhase;
  mode: string;
  arenaType?: "debug" | "quiz";
  currentQuestionIndex: number;
  questionCount: number;
  secondsPerQuestion: number;
  revealSeconds: number;
  tokenRewards: number[];
  languages: string[];
  knowledgeScope: number;
  scopeNote: string | null;
  chaosEnabled: boolean;
  createdAt: string;
}

export interface ArenaChaosEffect {
  id: string;
  power: "blackout" | "generator";
  sourceUserId: string;
  targetUserIds: string[];
  questionIndex: number;
  endsAt: string;
}

export interface ArenaMyAnswer {
  highlightedLines: number[];
  submittedCode: string | null;
  answeredAt: string | null;
  score: number;
  selectedIndex?: number | null;
  isCorrect?: boolean;
}

export interface ArenaState {
  match: ArenaMatchMeta;
  players: ArenaPlayer[];
  remainingSeconds: number;
  question: ArenaQuestionPublic | null;
  reveal: ArenaReveal | null;
  submittedUserIds: string[];
  chaosEffects: ArenaChaosEffect[];
  myAnswer?: ArenaMyAnswer;
  viewerKicked?: boolean;
}

export interface ArenaListItem {
  id: string;
  title: string;
  status: ArenaStatus;
  phase: ArenaPhase;
  mode?: string;
  arenaType?: "debug" | "quiz";
  questionCount: number;
  knowledgeScope: number;
  tokenRewards: string;
  languages: string;
  createdAt: string;
  createdBy: { id: string; fullName: string };
  players: Array<{ user: { id: string; fullName: string; avatarUrl: string | null } }>;
  _count?: { questions: number };
}

export interface ArenaPanelState {
  userId: string;
  hasCode: boolean;
  language: string;
  code: string;
  highlighted?: number[];
}

// ── GET /arenas/:id/review ──────────────────────────────────────────────────
// One row per player per question. `identified` / `highlightedLines` /
// `timeBonus` mirror the live reveal so the review can explain a score the same
// way the match did, instead of showing only the total.

export interface ArenaReviewAnswer {
  userId: string;
  fullName: string;
  decision: string | null;
  submittedCode: string | null;
  score: number;
  fixed: boolean;
  identified: boolean;
  highlightedLines: number[];
  timeBonus: number;
  selectedIndex: number | null;
  isCorrect: boolean | null;
  responseTimeMs: number | null;
}

export interface ArenaReviewQuestion {
  id: string;
  orderIndex: number;
  language: string;
  title: string;
  statement: string;
  input: string;
  expectedOutput: string;
  shownCode: string;
  correctCode: string;
  hasBug: boolean;
  bugDescription: string | null;
  buggyLineNumbers: number[];
  options?: string[];
  correctIndex: number | null;
  explanation: string | null;
  difficulty: number | null;
  effectiveDifficulty: number | null;
  calibrationSamples: number | null;
  calibrationConfidence: number | null;
  calibrationStatus: string | null;
  answers: ArenaReviewAnswer[];
}

export interface ArenaReviewData {
  match: {
    id: string;
    title: string;
    mode: string;
    arenaType?: "debug" | "quiz";
    createdAt: string;
    createdBy: { id: string; fullName: string };
  };
  questions: ArenaReviewQuestion[];
  players: Array<{ userId: string; fullName: string; totalScore: number; finalRank: number | null }>;
}
