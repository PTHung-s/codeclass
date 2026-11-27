import fs from "node:fs";
import path from "node:path";
import prisma from "../utils/prisma";
import { SKILL_SEEDS } from "../utils/skillGraph";
import { syncSkillCatalog } from "./skillMastery";

export interface ProblemPackTestCase {
  input: string;
  output: string;
  hidden?: boolean;
}

export interface ProblemPackItem {
  slug?: string;
  title: string;
  shortDescription?: string | null;
  statement: string;
  difficulty: "easy" | "medium" | "hard";
  estimatedTime?: number | null;
  skillId?: string | null;
  tags?: string[];
  starterCode?: string | null;
  sampleInput?: string | null;
  sampleOutput?: string | null;
  requirementsText?: string | null;
  rubric?: string | null;
  hints?: string | null;
  teacherSolution?: string | null;
  testCases: ProblemPackTestCase[];
}

export interface ProblemPackFile {
  schemaVersion?: number;
  packId: string;
  title: string;
  tier?: string;
  description?: string;
  problemCount?: number;
  problems: ProblemPackItem[];
}

export interface BuiltInPackSummary {
  packId: string;
  title: string;
  tier: string;
  description: string;
  problemCount: number;
  alreadyImportedCount: number;
  difficulties: { easy: number; medium: number; hard: number };
  tags: string[];
}

export interface ImportPackResult {
  packId: string;
  title: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

const VALID_SKILL_IDS = new Set(SKILL_SEEDS.map((s) => s.skillId));
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const MAX_TESTS = 200;
const MAX_TEST_BYTES = 250_000;

export const CP_PACKS_DIR = path.resolve(__dirname, "../../data/cp-packs");

function normalizeTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanTests(rawTests: unknown, title: string): ProblemPackTestCase[] {
  if (!Array.isArray(rawTests)) {
    throw new Error(`Bài "${title}": testCases phải là một mảng`);
  }
  if (rawTests.length > MAX_TESTS) {
    throw new Error(`Bài "${title}": vượt quá tối đa ${MAX_TESTS} test`);
  }
  const cleaned: ProblemPackTestCase[] = [];
  for (let i = 0; i < rawTests.length; i++) {
    const t = rawTests[i] as any;
    if (!t || typeof t.input !== "string" || typeof t.output !== "string") {
      throw new Error(`Bài "${title}" test #${i + 1}: thiếu input hoặc output kiểu chuỗi`);
    }
    if (
      Buffer.byteLength(t.input, "utf8") > MAX_TEST_BYTES ||
      Buffer.byteLength(t.output, "utf8") > MAX_TEST_BYTES
    ) {
      throw new Error(`Bài "${title}" test #${i + 1}: vượt quá giới hạn 250KB`);
    }
    cleaned.push({
      input: t.input.replace(/\r\n/g, "\n"),
      output: String(t.output).replace(/\r\n/g, "\n").replace(/\n+$/, ""),
      hidden: Boolean(t.hidden),
    });
  }
  return cleaned;
}

export function validateProblemPack(raw: unknown): ProblemPackFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("Dữ liệu gói đề không hợp lệ (cần object JSON)");
  }
  const obj = raw as Record<string, unknown>;
  const problems = obj.problems;
  if (!Array.isArray(problems) || problems.length === 0) {
    throw new Error("Gói đề phải có mảng `problems` không rỗng");
  }
  if (problems.length > 200) {
    throw new Error("Mỗi lần import tối đa 200 bài");
  }

  const normalized: ProblemPackItem[] = problems.map((item: any, idx: number) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Phần tử #${idx + 1} không hợp lệ`);
    }
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!title) throw new Error(`Bài #${idx + 1} thiếu tiêu đề (title)`);

    const statement = typeof item.statement === "string" ? item.statement.trim() : "";
    if (!statement) throw new Error(`Bài "${title}" thiếu đề bài (statement)`);

    const diff = typeof item.difficulty === "string" && VALID_DIFFICULTIES.has(item.difficulty)
      ? (item.difficulty as "easy" | "medium" | "hard")
      : "medium";

    const testCases = cleanTests(item.testCases ?? [], title);
    const rawTags: string[] = Array.isArray(item.tags)
      ? Array.from(
          new Set<string>(
            item.tags
              .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
              .map((t: string) => t.trim().slice(0, 60)),
          ),
        )
      : [];

    const skillId =
      typeof item.skillId === "string" && VALID_SKILL_IDS.has(item.skillId.trim())
        ? item.skillId.trim()
        : null;

    const firstPublic = testCases.find((t) => !t.hidden) || testCases[0];

    return {
      slug: typeof item.slug === "string" ? item.slug.trim() : undefined,
      title,
      shortDescription:
        typeof item.shortDescription === "string" ? item.shortDescription.trim() : null,
      statement,
      difficulty: diff,
      estimatedTime:
        typeof item.estimatedTime === "number" && Number.isFinite(item.estimatedTime)
          ? Math.max(5, Math.min(180, Math.round(item.estimatedTime)))
          : 25,
      skillId,
      tags: rawTags,
      starterCode: typeof item.starterCode === "string" ? item.starterCode : null,
      sampleInput:
        typeof item.sampleInput === "string"
          ? item.sampleInput
          : firstPublic
            ? firstPublic.input.replace(/\n$/, "")
            : null,
      sampleOutput:
        typeof item.sampleOutput === "string"
          ? item.sampleOutput
          : firstPublic
            ? firstPublic.output
            : null,
      requirementsText:
        typeof item.requirementsText === "string" ? item.requirementsText.trim() : null,
      rubric: typeof item.rubric === "string" ? item.rubric.trim() : null,
      hints: typeof item.hints === "string" ? item.hints.trim() : null,
      teacherSolution:
        typeof item.teacherSolution === "string" ? item.teacherSolution : null,
      testCases,
    };
  });

  return {
    schemaVersion: Number(obj.schemaVersion) || 1,
    packId: typeof obj.packId === "string" && obj.packId.trim() ? obj.packId.trim() : "custom-pack",
    title: typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : "Gói đề tùy chỉnh",
    tier: typeof obj.tier === "string" ? obj.tier.trim() : undefined,
    description: typeof obj.description === "string" ? obj.description.trim() : undefined,
    problemCount: normalized.length,
    problems: normalized,
  };
}

export function loadBuiltInPack(packId: string): ProblemPackFile {
  if (!/^[a-z0-9-]+$/i.test(packId)) {
    throw new Error("Mã gói đề không hợp lệ");
  }
  const filePath = path.join(CP_PACKS_DIR, `${packId}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Không tìm thấy gói đề "${packId}"`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return validateProblemPack(raw);
}

export async function listBuiltInPacks(): Promise<BuiltInPackSummary[]> {
  if (!fs.existsSync(CP_PACKS_DIR)) return [];
  const files = fs
    .readdirSync(CP_PACKS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const existingRows = await prisma.problem.findMany({
    where: { status: { not: "archived" } },
    select: { title: true },
  });
  const existingTitles = new Set(existingRows.map((r) => normalizeTitleKey(r.title)));

  const summaries: BuiltInPackSummary[] = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(CP_PACKS_DIR, file), "utf8"));
      const problems: any[] = Array.isArray(parsed.problems) ? parsed.problems : [];
      const diffCounts = { easy: 0, medium: 0, hard: 0 };
      const tagSet = new Set<string>();
      let alreadyImportedCount = 0;

      for (const p of problems) {
        if (p.difficulty === "easy") diffCounts.easy++;
        else if (p.difficulty === "hard") diffCounts.hard++;
        else diffCounts.medium++;

        if (Array.isArray(p.tags)) {
          for (const t of p.tags) {
            if (typeof t === "string" && t.trim()) tagSet.add(t.trim());
          }
        }
        if (typeof p.title === "string" && existingTitles.has(normalizeTitleKey(p.title))) {
          alreadyImportedCount++;
        }
      }

      summaries.push({
        packId: parsed.packId || file.replace(/\.json$/, ""),
        title: parsed.title || file,
        tier: parsed.tier || "CP",
        description: parsed.description || "",
        problemCount: problems.length,
        alreadyImportedCount,
        difficulties: diffCounts,
        tags: Array.from(tagSet).slice(0, 6),
      });
    } catch {
      // ignore malformed file
    }
  }
  return summaries;
}

export async function importProblemPack(
  rawPack: unknown,
  createdById: string,
  opts: { mode?: "skip" | "upsert"; publish?: boolean } = {},
): Promise<ImportPackResult> {
  const mode = opts.mode === "upsert" ? "upsert" : "skip";
  const publish = opts.publish !== false;
  const pack = validateProblemPack(rawPack);

  // Ensure all canonical skills exist in SQLite before tagging imported problems.
  await syncSkillCatalog();

  const existing = await prisma.problem.findMany({
    where: { status: { not: "archived" } },
    select: { id: true, title: true },
  });
  const byTitle = new Map<string, string>();
  for (const row of existing) {
    byTitle.set(normalizeTitleKey(row.title), row.id);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of pack.problems) {
    const key = normalizeTitleKey(item.title);
    const existingId = byTitle.get(key);
    const testCasesJson = JSON.stringify(item.testCases);
    const tags = item.tags || [];

    try {
      if (existingId) {
        if (mode === "skip") {
          skipped++;
          continue;
        }
        await prisma.$transaction([
          prisma.problemTag.deleteMany({ where: { problemId: existingId } }),
          prisma.problem.update({
            where: { id: existingId },
            data: {
              shortDescription: item.shortDescription,
              statement: item.statement,
              difficulty: item.difficulty,
              estimatedTime: item.estimatedTime,
              starterCode: item.starterCode,
              sampleInput: item.sampleInput,
              sampleOutput: item.sampleOutput,
              requirementsText: item.requirementsText,
              rubric: item.rubric,
              hints: item.hints,
              teacherSolution: item.teacherSolution,
              testCases: testCasesJson,
              status: publish ? "published" : "draft",
              ...(item.skillId
                ? { skillId: item.skillId, skillTagStatus: "approved" }
                : {}),
              tags: tags.length ? { create: tags.map((tag) => ({ tag })) } : undefined,
            },
          }),
        ]);
        updated++;
      } else {
        const createdRow = await prisma.problem.create({
          data: {
            title: item.title,
            shortDescription: item.shortDescription,
            statement: item.statement,
            difficulty: item.difficulty,
            estimatedTime: item.estimatedTime,
            starterCode: item.starterCode,
            sampleInput: item.sampleInput,
            sampleOutput: item.sampleOutput,
            requirementsText: item.requirementsText,
            rubric: item.rubric,
            hints: item.hints,
            teacherSolution: item.teacherSolution,
            testCases: testCasesJson,
            status: publish ? "published" : "draft",
            createdById,
            skillId: item.skillId,
            skillTagStatus: item.skillId ? "approved" : "untagged",
            tags: tags.length ? { create: tags.map((tag) => ({ tag })) } : undefined,
          },
          select: { id: true },
        });
        byTitle.set(key, createdRow.id);
        created++;
      }
    } catch (err: any) {
      errors.push(`${item.title}: ${err?.message || "Lỗi lưu DB"}`);
    }
  }

  return {
    packId: pack.packId,
    title: pack.title,
    total: pack.problems.length,
    created,
    updated,
    skipped,
    errors,
  };
}
