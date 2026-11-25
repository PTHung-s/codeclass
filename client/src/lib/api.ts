// ── Skill Assessment Types ──

export interface SkillState {
  skillId: string;
  name: string;
  mastery: number; // 0.0 → 1.0
  trend: "up" | "down" | "flat";
  hasEvidence?: boolean;
  evidenceCount?: number;
  lowerBound?: number;
  upperBound?: number;
  confidenceLevel?: "low" | "forming" | "medium" | "high";
}

export interface TopicGroup {
  topicId: string;
  topicName: string;
  sequenceNo: number;
  skills: { skillId: string; name: string; description?: string; orderIndex: number }[];
}

export interface Recommendation {
  id: string;
  type: string; // remedial | visualize | verify
  title: string;
  skillId: string;
  reason: string;
  evidence: string;
  ruleId: string;
  confidence: number;
  mandatory: boolean;
  status: string;
  lessonId?: string | null;
  detailLevel?: string | null;
  createdAt: string;
}

export interface DailyStudyItem {
  id: string;
  skillId: string;
  lessonId: string | null;
  quizId: string | null;
  problemId: string | null;
  itemType: "lesson" | "quiz" | "problem";
  title: string;
  reason: string;
  evidence: string;
  actionUrl: string;
  position: number;
  priority: number;
  masterySnapshot: number;
  estimatedMinutes: number;
  status: "pending" | "completed" | "skipped";
  completedAt: string | null;
  skill: { name: string; topicName: string };
}

export interface DailyStudyPlan {
  id: string;
  dateKey: string;
  status: "pending" | "in_progress" | "completed" | "empty";
  generatedBy: string;
  estimatedMinutes: number;
  completedAt: string | null;
  items: DailyStudyItem[];
}

export interface HeatmapStudent {
  userId: string;
  fullName: string;
  nickname?: string | null;
  avatarUrl: string | null;
  skills: Record<string, {
    mastery: number;
    lowerBound: number;
    upperBound: number;
    confidenceLevel: "low" | "forming" | "medium" | "high";
    evidenceCount: number;
  }>;
}

export interface HeatmapResponse {
  students: HeatmapStudent[];
  skills: { skillId: string; name: string; topicName: string }[];
  stuckClusters: { skillId: string; skillName: string; count: number; userIds: string[] }[];
}

export interface EngineConfig {
  activeEngine: string;
  bktParams: Record<string, { pL0: number; pT: number; pSlip: number; pGuess: number }> | null;
}

export interface RecLogEntry {
  id: string;
  userId: string;
  recommendationId: string | null;
  ruleId: string;
  skillId: string;
  reason: string;
  evidence: string;
  confidence: number;
  action: string;
  costMs: number | null;
  createdAt: string;
}

import axios from "axios";

// ── Unauthorized (401) broadcast ──
// The interceptor cannot reach React state directly; useAuth subscribes here
// so a dead token logs the user out of the UI instead of just dropping the
// localStorage token.
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      for (const listener of unauthorizedListeners) listener();
    }
    return Promise.reject(error);
  }
);

export default api;
