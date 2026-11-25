import {
  SKILL_SEEDS,
  TOPICS,
  getSkillPrerequisites,
  getSkillDependents,
  getPrerequisiteAncestors,
} from "../skillGraph";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
  }
}

console.log("\n── Skill graph taxonomy ──");
const canonicalIds = new Set(SKILL_SEEDS.map((skill) => skill.skillId));
check("canonical catalog has 71 skills", SKILL_SEEDS.length === 71);
check("skill IDs are unique", canonicalIds.size === SKILL_SEEDS.length);
check("skill order indexes are contiguous", SKILL_SEEDS.every((skill, index) => skill.orderIndex === index));
check("skill IDs use a known namespace prefix", SKILL_SEEDS.every((s) => /^(py|cpp|algo)\./.test(s.skillId)));
check("topic references only canonical skills", TOPICS.every((topic) => topic.skillIds.every((id) => canonicalIds.has(id))));
check(
  "every skill belongs to exactly one topic",
  TOPICS.flatMap((t) => t.skillIds).length === SKILL_SEEDS.length &&
    new Set(TOPICS.flatMap((t) => t.skillIds)).size === SKILL_SEEDS.length,
);
check(
  "topic ids and sequence numbers are unique",
  new Set(TOPICS.map((t) => t.topicId)).size === TOPICS.length &&
    new Set(TOPICS.map((t) => t.sequenceNo)).size === TOPICS.length,
);
check(
  "algorithm course namespace covers its 10 curriculum chapters",
  TOPICS.filter((t) => t.topicId.startsWith("t") && t.topicName.startsWith("Thuật toán:")).length === 10 &&
    SKILL_SEEDS.filter((s) => s.skillId.startsWith("algo.")).length === 27,
);

const orderById = new Map(SKILL_SEEDS.map((s) => [s.skillId, s.orderIndex]));
check(
  "every skill prerequisite exists and has strictly lower orderIndex (acyclic DAG)",
  SKILL_SEEDS.every((s) => {
    const prereqs = getSkillPrerequisites(s.skillId);
    return Array.isArray(s.prerequisites) && prereqs.every((p) => canonicalIds.has(p) && (orderById.get(p) ?? 999) < s.orderIndex);
  }),
);
check(
  "getSkillPrerequisites and getSkillDependents are inverse mappings",
  SKILL_SEEDS.every((s) =>
    getSkillPrerequisites(s.skillId).every((p) => getSkillDependents(p).includes(s.skillId)) &&
    getSkillDependents(s.skillId).every((d) => getSkillPrerequisites(d).includes(s.skillId)),
  ),
);
check(
  "getPrerequisiteAncestors traverses upstream DAG cleanly",
  getPrerequisiteAncestors("py.loop_while", 3).includes("py.operators") &&
    !getPrerequisiteAncestors("py.loop_while", 3).includes("py.loop_while"),
);

console.log(`  Passed: ${pass} / ${pass + fail}`);
console.log(`  Failed: ${fail}`);
if (fail > 0) process.exit(1);
