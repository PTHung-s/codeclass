/**
 * LLM Synthetic Data Generator — dùng LLM client chung (vilao primary,
 * DeepSeek fallback) để sinh học sinh ảo cho các skill thiếu dữ liệu
 * (C++, py.string, py.list, py.function)
 */
import { chatCompletion } from "../utils/llmClient";

export interface SyntheticSequence {
  studentId: string;
  correct: boolean[];
}

export interface SyntheticSkillData {
  skillId: string;
  sequences: SyntheticSequence[];
}

/**
 * Gọi API sinh synthetic student sequences cho một skill.
 * Trả về mảng sequences hoặc null nếu lỗi.
 */
export async function generateSyntheticSequences(
  skillId: string,
  skillName: string,
  skillDescription: string,
  difficulty: string,
): Promise<SyntheticSequence[] | null> {
  const systemPrompt = `You are an educational data generation assistant. You generate realistic synthetic student answer sequences for a specific programming skill.

Each sequence represents one student's journey: an ordered list of correct/wrong answers (true = correct, false = wrong) as they practice the skill over time.

Generate sequences that reflect realistic learning patterns:
- Some students get it right away (mostly true)
- Some students learn gradually (starts with some false, then becomes mostly true)
- Some students struggle (starts mostly false, may improve slightly)
- Include occasional slip (false when the student generally knows) and guess (true when the student generally doesn't know)
- Sequences should be 3-8 observations long
- Generate 5-8 synthetic students per skill

Return a JSON array of objects: [{"studentId": "synth_1", "correct": [true, false, true, true, true]}, ...]`;

  const userPrompt = `Skill ID: ${skillId}
Skill Name: ${skillName}
Description: ${skillDescription}
Difficulty: ${difficulty}

Generate 5-8 realistic synthetic student answer sequences for this skill.`;

  try {
    const result = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.7, max_tokens: 2000, timeoutMs: 120000 },
    );

    const content = result?.content;
    if (!content) return null;

    // Parse JSON from response (may have markdown code fences)
    let json = content.trim();
    if (json.startsWith("```")) {
      json = json.replace(/```(?:json)?\s*/g, "").trim();
    }

    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;

    // Validate and transform
    const sequences: SyntheticSequence[] = [];
    for (const item of parsed) {
      if (Array.isArray(item.correct) && item.correct.length >= 2) {
        sequences.push({
          studentId: `synth_${skillId}_${item.studentId || sequences.length}`,
          correct: item.correct.map((b: any) => Boolean(b)),
        });
      }
    }

    return sequences.length >= 3 ? sequences : null;
  } catch (err: any) {
    console.error(`[LLM] Error generating synthetic data for ${skillId}:`, err?.response?.data || err?.message);
    return null;
  }
}

/**
 * Run LLM generation for all skills that lack data, then return the combined synthetic data.
 * @param skillsNeedingData Array of {skillId, name, description, difficulty}
 */
export async function generateAllSynthetic(
  skillsNeedingData: { skillId: string; name: string; description: string; difficulty: string }[],
): Promise<Map<string, SyntheticSequence[]>> {
  const result = new Map<string, SyntheticSequence[]>();

  for (const skill of skillsNeedingData) {
    console.log(`  [LLM] Generating synthetic data for ${skill.skillId}...`);
    const seqs = await generateSyntheticSequences(
      skill.skillId,
      skill.name,
      skill.description,
      skill.difficulty,
    );
    if (seqs && seqs.length >= 3) {
      result.set(skill.skillId, seqs);
      console.log(`  [LLM] ✔ ${skill.skillId}: ${seqs.length} sequences generated`);
    } else {
      console.log(`  [LLM] ✘ ${skill.skillId}: failed or insufficient sequences`);
    }
    // Pace between API calls
    await new Promise((r) => setTimeout(r, 500));
  }

  return result;
}