import fs from "fs";
import path from "path";
import prisma from "../utils/prisma";

interface CourseContent {
  course: { title: string; description?: string };
  modules: Array<{
    order: number;
    title: string;
    summary?: string;
    lessons: Array<{
      order: number;
      title: string;
      estimatedMinutes?: number;
    }>;
  }>;
}

const COURSE_ID = "cpp-co-ban-id";
const CONTENT_PATH = path.resolve(
  process.cwd(),
  "../client/dist/course-content/cpp-co-ban.json",
);

// When the Vite build output is missing we fall back to the source JSON so the
// seeder works during development without rebuilding the client.
function resolveContentPath(): string {
  if (fs.existsSync(CONTENT_PATH)) return CONTENT_PATH;
  const fallback = path.resolve(
    process.cwd(),
    "../client/public/course-content/cpp-co-ban.json",
  );
  if (fs.existsSync(fallback)) return fallback;
  return CONTENT_PATH;
}

async function main() {
  const resolvedPath = resolveContentPath();
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Không tìm thấy course content JSON: ${resolvedPath}`);
  }
  const content = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as CourseContent;
  const owner = await prisma.user.findFirst({
    where: { role: { in: ["teacher", "admin", "teaching_assistant"] }, status: "active" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (!owner) {
    throw new Error("Cần ít nhất một tài khoản giáo viên hoặc quản trị active để tạo khóa C++.");
  }

  await prisma.course.upsert({
    where: { id: COURSE_ID },
    create: {
      id: COURSE_ID,
      title: content.course.title,
      description: `${content.course.description || ""} course-type:cpp-basic`.trim(),
      ownerId: owner.id,
      status: "active",
      visibility: "public",
    },
    update: {
      title: content.course.title,
      description: `${content.course.description || ""} course-type:cpp-basic`.trim(),
      ownerId: owner.id,
      status: "active",
      visibility: "public",
    },
  });

  let lessonCount = 0;
  for (const moduleContent of content.modules) {
    const moduleId = `cpp-module-${String(moduleContent.order).padStart(2, "0")}`;
    await prisma.module.upsert({
      where: { id: moduleId },
      create: {
        id: moduleId,
        courseId: COURSE_ID,
        title: moduleContent.title,
        description: moduleContent.summary || null,
        orderIndex: moduleContent.order,
        status: "active",
      },
      update: {
        courseId: COURSE_ID,
        title: moduleContent.title,
        description: moduleContent.summary || null,
        orderIndex: moduleContent.order,
        status: "active",
      },
    });

    for (const lessonContent of moduleContent.lessons) {
      const lessonId = `cpp-lesson-${String(moduleContent.order).padStart(2, "0")}-${String(lessonContent.order).padStart(2, "0")}`;
      await prisma.lesson.upsert({
        where: { id: lessonId },
        create: {
          id: lessonId,
          courseId: COURSE_ID,
          moduleId,
          title: lessonContent.title,
          orderIndex: lessonContent.order,
          status: "active",
          estimatedDuration: lessonContent.estimatedMinutes || 15,
        },
        update: {
          courseId: COURSE_ID,
          moduleId,
          title: lessonContent.title,
          orderIndex: lessonContent.order,
          status: "active",
          estimatedDuration: lessonContent.estimatedMinutes || 15,
        },
      });
      lessonCount += 1;
    }
  }

  console.log(`C++ course is ready: ${content.modules.length} modules, ${lessonCount} lessons.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
