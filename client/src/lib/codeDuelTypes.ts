// Shared types for Code Duel — mirrors the server's CodeDuelState contract.

export type CodeDuelStatus = "draft" | "lobby" | "countdown" | "in_progress" | "judging" | "reveal" | "podium" | "finished";

export interface CodeDuelPlayer {
  userId: string;
  fullName: string;
  nickname?: string | null;
  avatarUrl: string | null;
  totalScore: number;
  finalRank: number | null;
  outTabCount: number;
}

export interface CodeDuelRoundPublic {
  id: string;
  orderIndex: number;
  title: string;
  statement: string;
  difficulty: string;
  timeLimitSeconds: number;
  topic: string;
  algorithm: string;
  starterCode: string;
  samples: { input: string; output: string }[];
  status: string;
  enabled: boolean;
}

export interface CodeDuelSubmissionPublic {
  id: string;
  userId: string;
  fullName: string;
  code: string;
  language: string;
  verdict: string | null;
  score: number;
  passedTests: number;
  totalTests: number;
  acceptedAt: string | null;
  outTabCount: number;
  isVerified: boolean;
  verifiedComment?: string | null;
  testPerTest?: Array<{ testNum: number; passed: boolean; hidden?: boolean; status: string; durationMs: number }>;
}

export interface CodeDuelState {
  match: {
    id: string;
    title: string;
    status: CodeDuelStatus;
    language: string;
    level: string;
    scheduledStartAt: string | null;
    totalRounds: number | null;
    roundsCount: number;
    pointsPerProblem: number;
    paused: boolean;
    currentRoundIndex: number;
    roundEndsAt: string | null;
    leaderboardVisible: boolean;
    createdAt: string;
  };
  players: CodeDuelPlayer[];
  round: CodeDuelRoundPublic | null;
  reveal: { round: CodeDuelRoundPublic; top3: CodeDuelSubmissionPublic[]; all: CodeDuelSubmissionPublic[] } | null;
  remainingSeconds: number;
  mySubmission?: { submitted: boolean; code: string; submittedAt: string | null; verdict: string | null; score: number };
  isStaff: boolean;
}

export interface CodeDuelPanelState {
  userId: string;
  hasCode: boolean;
  language: string;
  code: string;
}

export interface CodeDuelTabEvent {
  userId: string;
  out: boolean;
  outTabCount: number;
}

export interface CodeDuelReadyState {
  userId: string;
  ready: boolean;
}

export interface CodeDuelDraft {
  title: string;
  statement: string;
  difficulty: "easy" | "medium" | "hard";
  timeLimitSeconds: number;
  topic: string;
  algorithm: string;
  starterCode: string;
  constraints: string;
  maxInputSize: number;
  generator: string;
  referenceSolution: string;
  publicSamples: { input: string; output: string }[];
  /** Skill tag (AI-suggested; teacher confirms before finalize). */
  skillId?: string;
}

export interface CodeDuelMatchSummary {
  id: string;
  title: string;
  language: string;
  status: CodeDuelStatus;
  currentRoundIndex: number;
  roundEndsAt: string | null;
  leaderboardVisible: boolean;
  createdAt: string;
  createdBy?: { id: string; fullName: string };
  players?: (CodeDuelPlayer & { user?: { id: string; fullName: string; avatarUrl: string | null } })[];
  _count?: { rounds: number };
}
