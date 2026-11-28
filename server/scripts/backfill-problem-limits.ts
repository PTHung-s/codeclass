import prisma from "../src/utils/prisma";
import { parseLimitsFromRequirements } from "../src/services/problemPackService";

async function main() {
  const problems = await prisma.problem.findMany({
    select: {
      id: true,
      title: true,
      requirementsText: true,
      timeLimitMs: true,
      memoryLimitMb: true,
    },
  });

  let updatedTime = 0;
  let updatedMem = 0;

  for (const p of problems) {
    const parsed = parseLimitsFromRequirements(p.requirementsText);
    const data: { timeLimitMs?: number; memoryLimitMb?: number } = {};
    if (parsed.timeLimitMs && parsed.timeLimitMs !== p.timeLimitMs) {
      data.timeLimitMs = parsed.timeLimitMs;
      updatedTime++;
    }
    if (parsed.memoryLimitMb && parsed.memoryLimitMb !== p.memoryLimitMb) {
      data.memoryLimitMb = parsed.memoryLimitMb;
      updatedMem++;
    }
    if (Object.keys(data).length > 0) {
      await prisma.problem.update({ where: { id: p.id }, data });
    }
  }

  console.log(
    JSON.stringify({
      scanned: problems.length,
      updatedTimeLimit: updatedTime,
      updatedMemoryLimit: updatedMem,
    }),
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
