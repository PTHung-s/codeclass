import fs from "node:fs";
import path from "node:path";
import prisma from "../utils/prisma";
import { CP_PACKS_DIR } from "./problemPackService";
import { getSkillStates } from "./skillMastery";

export interface RoadmapProblemNode {
  slug: string;
  title: string;
  shortDescription: string;
  difficulty: "easy" | "medium" | "hard";
  estimatedTime: number;
  skillId: string | null;
  tags: string[];
  problemId: string | null; // null if pack not yet imported into DB
  solveStatus: "solved" | "attempted" | "unstarted" | "not_imported";
}

export interface RoadmapPackSummary {
  packId: string;
  title: string;
  tierKey: "tier1" | "tier2" | "tier3" | "tier4";
  tierLabel: string;
  description: string;
  totalCount: number;
  importedCount: number;
  solvedCount: number;
  attemptedCount: number;
  problems: RoadmapProblemNode[];
}

export interface RoadmapTierSummary {
  tierKey: "tier1" | "tier2" | "tier3" | "tier4";
  label: string;
  subtitle: string;
  totalCount: number;
  importedCount: number;
  solvedCount: number;
  packs: RoadmapPackSummary[];
}

export interface RoadmapRecommendation {
  problemId: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  packTitle: string;
  skillId: string | null;
  reason: string;
}

export interface CpRoadmapPayload {
  summary: {
    totalPackProblems: number;
    totalImported: number;
    totalSolved: number;
    totalAttempted: number;
  };
  tiers: RoadmapTierSummary[];
  recommendations: RoadmapRecommendation[];
}

const TIER_DEFS: Array<{
  tierKey: "tier1" | "tier2" | "tier3" | "tier4";
  label: string;
  subtitle: string;
  packPrefixes: string[];
}> = [
  {
    tierKey: "tier1",
    label: "Tầng 1 — Nền tảng thi đấu",
    subtitle: "Số học, Sàng nguyên tố, Prefix Sum, Map/Set, Xâu cơ bản, Sắp xếp & Tham lam",
    packPrefixes: ["01-", "02-", "03-", "04-"],
  },
  {
    tierKey: "tier2",
    label: "Tầng 2 — Kỹ thuật lõi",
    subtitle: "Nhị phân trên đáp án, Hai con trỏ, Stack/Queue/Heap, Đệ quy/Quay lui, Bitmask & Ad-hoc",
    packPrefixes: ["05-", "06-", "07-", "10-", "11-"],
  },
  {
    tierKey: "tier3",
    label: "Tầng 3 — Quy hoạch động & Đồ thị",
    subtitle: "DP 1D–Tree–Bitmask, Digit/Deque DP, Tổ hợp Modulo, BFS/DFS, Dijkstra, MST & SCC",
    packPrefixes: ["08-", "09-", "12-", "13-", "14-"],
  },
  {
    tierKey: "tier4",
    label: "Tầng 4 — CTDL & Thực chiến HSG QG",
    subtitle: "BIT, Segment Tree + Lazy, LCA/Euler Tour, Trie/Z/Manacher, Hình học, Nim & Đề Hybrid",
    packPrefixes: ["15-", "16-", "17-", "18-", "19-"],
  },
];

function normalizeKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function tierForPackFile(filename: string) {
  for (const t of TIER_DEFS) {
    if (t.packPrefixes.some((p) => filename.startsWith(p))) return t;
  }
  return TIER_DEFS[TIER_DEFS.length - 1];
}

interface ParsedPackMeta {
  packId: string;
  title: string;
  description: string;
  filename: string;
  problems: Array<{
    slug: string;
    title: string;
    shortDescription: string;
    difficulty: "easy" | "medium" | "hard";
    estimatedTime: number;
    skillId: string | null;
    tags: string[];
  }>;
}

let cachedPackIndex: ParsedPackMeta[] | null = null;

export function loadPackMetadataIndex(): ParsedPackMeta[] {
  if (cachedPackIndex) return cachedPackIndex;
  if (!fs.existsSync(CP_PACKS_DIR)) return [];
  const files = fs
    .readdirSync(CP_PACKS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const out: ParsedPackMeta[] = [];
  for (const filename of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(CP_PACKS_DIR, filename), "utf8"));
      const rawProblems = Array.isArray(parsed.problems) ? parsed.problems : [];
      out.push({
        packId: parsed.packId || filename.replace(/\.json$/, ""),
        title: parsed.title || filename,
        description: parsed.description || "",
        filename,
        problems: rawProblems.map((p: any) => ({
          slug: String(p.slug || p.title || ""),
          title: String(p.title || ""),
          shortDescription: String(p.shortDescription || ""),
          difficulty:
            p.difficulty === "easy" || p.difficulty === "hard" ? p.difficulty : "medium",
          estimatedTime: typeof p.estimatedTime === "number" ? p.estimatedTime : 25,
          skillId: typeof p.skillId === "string" ? p.skillId : null,
          tags: Array.isArray(p.tags) ? p.tags.slice(0, 6) : [],
        })),
      });
    } catch {
      /* ignore malformed */
    }
  }
  cachedPackIndex = out;
  return out;
}

export async function buildCpRoadmap(userId: string, role: string): Promise<CpRoadmapPayload> {
  const packsMeta = loadPackMetadataIndex();

  const [dbProblems, userSubs, skillStates] = await Promise.all([
    prisma.problem.findMany({
      where: role === "student" ? { status: "published" } : { status: { not: "archived" } },
      select: { id: true, title: true, skillId: true },
    }),
    prisma.problemSubmission.findMany({
      where: { studentId: userId },
      select: { problemId: true, passed: true },
    }),
    role === "student" ? getSkillStates(userId).catch(() => []) : Promise.resolve([]),
  ]);

  const dbByTitle = new Map<string, { id: string; skillId: string | null }>();
  for (const p of dbProblems) {
    dbByTitle.set(normalizeKey(p.title), { id: p.id, skillId: p.skillId });
  }

  const solvedSet = new Set<string>();
  const attemptedSet = new Set<string>();
  for (const sub of userSubs) {
    attemptedSet.add(sub.problemId);
    if (sub.passed) solvedSet.add(sub.problemId);
  }

  const skillById = new Map(skillStates.map((s) => [s.skillId, s]));

  const tierMap = new Map<
    "tier1" | "tier2" | "tier3" | "tier4",
    RoadmapTierSummary
  >();
  for (const td of TIER_DEFS) {
    tierMap.set(td.tierKey, {
      tierKey: td.tierKey,
      label: td.label,
      subtitle: td.subtitle,
      totalCount: 0,
      importedCount: 0,
      solvedCount: 0,
      packs: [],
    });
  }

  let totalPackProblems = 0;
  let totalImported = 0;
  let totalSolved = 0;
  let totalAttempted = 0;

  const candidateRecommendations: Array<RoadmapRecommendation & { priority: number }> = [];
  const diffWeight: Record<string, number> = { easy: 1, medium: 2, hard: 3 };

  for (let packIdx = 0; packIdx < packsMeta.length; packIdx++) {
    const meta = packsMeta[packIdx];
    const tierDef = tierForPackFile(meta.filename);
    const tierBucket = tierMap.get(tierDef.tierKey)!;

    let packImported = 0;
    let packSolved = 0;
    let packAttempted = 0;

    const nodes: RoadmapProblemNode[] = meta.problems.map((p, probIdx) => {
      const dbMatch = dbByTitle.get(normalizeKey(p.title));
      const problemId = dbMatch?.id ?? null;
      let solveStatus: RoadmapProblemNode["solveStatus"] = "not_imported";
      if (problemId) {
        packImported++;
        if (solvedSet.has(problemId)) {
          solveStatus = "solved";
          packSolved++;
        } else if (attemptedSet.has(problemId)) {
          solveStatus = "attempted";
          packAttempted++;
        } else {
          solveStatus = "unstarted";
        }
      }

      if (problemId && (solveStatus === "unstarted" || solveStatus === "attempted")) {
        const sk = p.skillId ? skillById.get(p.skillId) : undefined;
        let priority = packIdx * 100 + diffWeight[p.difficulty] * 20 + probIdx;
        let reason = `Tiếp nối lộ trình ${meta.title}`;
        if (solveStatus === "attempted") {
          priority -= 40;
          reason = "Bạn đã thử bài này — quay lại chinh phục nốt nhé!";
        } else if (sk && sk.hasEvidence && (sk.mastery < 0.65 || sk.dueForReview)) {
          priority -= 35;
          reason = `Củng cố kỹ năng "${sk.name}" (${Math.round(sk.mastery * 100)}%)`;
        }
        candidateRecommendations.push({
          problemId,
          title: p.title,
          difficulty: p.difficulty,
          packTitle: meta.title,
          skillId: p.skillId,
          reason,
          priority,
        });
      }

      return {
        ...p,
        problemId,
        solveStatus,
      };
    });

    totalPackProblems += nodes.length;
    totalImported += packImported;
    totalSolved += packSolved;
    totalAttempted += packAttempted;

    tierBucket.totalCount += nodes.length;
    tierBucket.importedCount += packImported;
    tierBucket.solvedCount += packSolved;
    tierBucket.packs.push({
      packId: meta.packId,
      title: meta.title,
      tierKey: tierDef.tierKey,
      tierLabel: tierDef.label,
      description: meta.description,
      totalCount: nodes.length,
      importedCount: packImported,
      solvedCount: packSolved,
      attemptedCount: packAttempted,
      problems: nodes,
    });
  }

  candidateRecommendations.sort((a, b) => a.priority - b.priority);
  const recommendations = candidateRecommendations.slice(0, 3).map(({ priority: _p, ...rest }) => rest);

  return {
    summary: {
      totalPackProblems,
      totalImported,
      totalSolved,
      totalAttempted,
    },
    tiers: TIER_DEFS.map((td) => tierMap.get(td.tierKey)!),
    recommendations,
  };
}

export interface ProblemNeighborNode {
  id: string;
  title: string;
  difficulty: string;
}

export interface ProblemNeighborsPayload {
  packTitle: string | null;
  tierLabel: string | null;
  position: number | null;
  totalInGroup: number | null;
  prev: ProblemNeighborNode | null;
  next: ProblemNeighborNode | null;
}

export async function getProblemNeighbors(
  problemId: string,
  role: string,
): Promise<ProblemNeighborsPayload | null> {
  const where = role === "student" ? { status: "published" } : { status: { not: "archived" } };
  const dbProblems = await prisma.problem.findMany({
    where,
    select: { id: true, title: true, difficulty: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const current = dbProblems.find((p) => p.id === problemId);
  if (!current) return null;

  const dbByTitle = new Map(dbProblems.map((p) => [normalizeKey(p.title), p]));
  const packsMeta = loadPackMetadataIndex();

  for (const meta of packsMeta) {
    const importedInPack: ProblemNeighborNode[] = [];
    for (const item of meta.problems) {
      const match = dbByTitle.get(normalizeKey(item.title));
      if (match) {
        importedInPack.push({ id: match.id, title: match.title, difficulty: match.difficulty });
      }
    }
    const idx = importedInPack.findIndex((p) => p.id === problemId);
    if (idx !== -1) {
      const tierDef = tierForPackFile(meta.filename);
      return {
        packTitle: meta.title,
        tierLabel: tierDef.label,
        position: idx + 1,
        totalInGroup: importedInPack.length,
        prev: idx > 0 ? importedInPack[idx - 1] : null,
        next: idx < importedInPack.length - 1 ? importedInPack[idx + 1] : null,
      };
    }
  }

  const fallbackIdx = dbProblems.findIndex((p) => p.id === problemId);
  return {
    packTitle: null,
    tierLabel: null,
    position: fallbackIdx !== -1 ? fallbackIdx + 1 : null,
    totalInGroup: dbProblems.length,
    prev: fallbackIdx > 0 ? { id: dbProblems[fallbackIdx - 1].id, title: dbProblems[fallbackIdx - 1].title, difficulty: dbProblems[fallbackIdx - 1].difficulty } : null,
    next: fallbackIdx !== -1 && fallbackIdx < dbProblems.length - 1 ? { id: dbProblems[fallbackIdx + 1].id, title: dbProblems[fallbackIdx + 1].title, difficulty: dbProblems[fallbackIdx + 1].difficulty } : null,
  };
}
