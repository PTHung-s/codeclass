import path from "path";

const dbPath = "file:" + path.resolve("prod.db").replace(/\\/g, "/");
process.env.DATABASE_URL = dbPath;

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: dbPath } } });

  const rows = await prisma.skillBktCalibration.findMany({ orderBy: { skillId: "asc" } });
  console.log("Total stored calibrations:", rows.length);
  console.log("Python:", rows.filter((r) => r.skillId.startsWith("py.")).length);
  console.log("C++:", rows.filter((r) => r.skillId.startsWith("cpp.")).length);
  console.log("Other:", rows.filter((r) => !r.skillId.startsWith("py.") && !r.skillId.startsWith("cpp.")).map((r) => r.skillId).join(", "));

  await prisma.$disconnect();
}

main().catch((e) => console.error("FATAL:", e)).finally(() => process.exit(0));