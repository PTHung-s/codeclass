import prisma from "./prisma";

/**
 * Seed idempotent các GameEvent + migrate quest chưa thuộc event vào event "Tổng hợp".
 * - Chạy tự động lúc app khởi động (index.ts).
 * - GIỮ DỮ LIỆU: không xoá quest/progress, chỉ gắn `eventId` cho quest còn null.
 */
export async function seedDefaultEvents(): Promise<number> {
  let created = 0;

  // 1. Event "Tổng hợp" — nơi chứa quest cũ (daily/weekly/achievement) chưa có event.
  let aggregate = await prisma.gameEvent.findFirst({ where: { name: "Tổng hợp" } });
  if (!aggregate) {
    aggregate = await prisma.gameEvent.create({
      data: {
        name: "Tổng hợp",
        subtitle: "Nhiệm vụ chung của học viện — làm hằng ngày để giữ phong độ.",
        icon: "🏛️",
        theme: "sky",
        startsAt: new Date(),
        endsAt: null,
        sortOrder: 999,
      },
    });
    created++;
  }

  // 2. Migrate mọi quest đang active + chưa có eventId vào event "Tổng hợp".
  const migrated = await prisma.quest.updateMany({
    where: { isActive: true, eventId: null },
    data: { eventId: aggregate.id },
  });

  // 3. Seed event "Sự kiện Tháng" (nếu chưa có) kèm vài nhiệm vụ chống rush.
  let monthEvent = await prisma.gameEvent.findFirst({ where: { name: "Sự kiện Tháng" } });
  if (!monthEvent) {
    monthEvent = await prisma.gameEvent.create({
      data: {
        name: "Sự kiện Tháng",
        subtitle: "Thử thách lớn của tháng — có cơ hội nhận thêm token.",
        icon: "🏆",
        theme: "indigo",
        startsAt: new Date(),
        endsAt: null,
        sortOrder: 0,
      },
    });
    created++;

    // Nhiệm vụ chống rush: đỗ bài ngay lần đầu, học đủ thời lượng, đỗ quiz.
    const monthTasks = [
      {
        title: "Chinh phục bài khó",
        description: "Yêu cầu: Đỗ 5 bài tập ngay trong lần chạy đầu tiên (không sửa sai)",
        type: "achievement",
        metric: "first_pass_solved",
        target: 5,
        tokenReward: 25,
        icon: "⚡",
      },
      {
        title: "Thời gian vàng",
        description: "Yêu cầu: Học tập tập trung tổng cộng 90 phút trong sự kiện",
        type: "achievement",
        metric: "study_minutes",
        target: 90,
        tokenReward: 30,
        icon: "⏱️",
      },
      {
        title: "Quiz bách chiến",
        description: "Yêu cầu: Đỗ 3 bài quiz trong sự kiện",
        type: "achievement",
        metric: "quizzes_passed",
        target: 3,
        tokenReward: 20,
        icon: "📝",
      },
    ];
    for (const t of monthTasks) {
      const exists = await prisma.quest.findFirst({
        where: { title: t.title, eventId: monthEvent!.id },
      });
      if (!exists) {
        await prisma.quest.create({
          data: { ...t, eventId: monthEvent!.id, category: "month_event", sortOrder: 0 },
        });
        created++;
      }
    }
  }

  if (created > 0 || migrated.count > 0) {
    console.log(`[Events] Seeded ${created} items, migrated ${migrated.count} quests into event`);
  }
  return created;
}