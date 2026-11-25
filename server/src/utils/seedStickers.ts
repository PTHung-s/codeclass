import prisma from "./prisma";

/**
 * Seed idempotent Meme Sticker PNG (3D Fluent, giống sticker dán thật) vào bảng chat_stickers.
 * - Chỉ tạo/update khi chưa tồn tại (bảo toàn cấu hình Admin: rarity, isGachaReward).
 * - Chạy tự động lúc app khởi động (index.ts).
 */

// slug -> { name, category, rarity }
const STICKERS: Array<{ slug: string; name: string; category: string; rarity: string }> = [
  // Meme pack (cut-out, transparent) — đặt tên theo index, admin có thể sửa tên sau
  { slug: "meme01", name: "Meme 01", category: "meme", rarity: "common" },
  { slug: "meme02", name: "Meme 02", category: "meme", rarity: "common" },
  { slug: "meme03", name: "Meme 03", category: "meme", rarity: "common" },
  { slug: "meme04", name: "Meme 04", category: "meme", rarity: "common" },
  { slug: "meme05", name: "Meme 05", category: "meme", rarity: "common" },
  { slug: "meme06", name: "Meme 06", category: "meme", rarity: "common" },
  { slug: "meme07", name: "Meme 07", category: "meme", rarity: "rare" },
  { slug: "meme08", name: "Meme 08", category: "meme", rarity: "rare" },
  { slug: "meme09", name: "Meme 09", category: "meme", rarity: "rare" },
  { slug: "meme10", name: "Meme 10", category: "meme", rarity: "rare" },
  { slug: "meme11", name: "Meme 11", category: "meme", rarity: "rare" },
  { slug: "meme12", name: "Meme 12", category: "meme", rarity: "rare" },
  { slug: "meme13", name: "Meme 13", category: "meme", rarity: "epic" },
  { slug: "meme14", name: "Meme 14", category: "meme", rarity: "epic" },
  { slug: "meme15", name: "Meme 15", category: "meme", rarity: "epic" },
  { slug: "meme16", name: "Meme 16", category: "meme", rarity: "epic" },
  { slug: "meme17", name: "Meme 17", category: "meme", rarity: "epic" },
  { slug: "meme18", name: "Meme 18", category: "meme", rarity: "epic" },
  { slug: "meme19", name: "Meme 19", category: "meme", rarity: "legendary" },
  { slug: "meme20", name: "Meme 20", category: "meme", rarity: "legendary" },
  { slug: "meme21", name: "Meme 21", category: "meme", rarity: "legendary" },
  { slug: "meme22", name: "Meme 22", category: "meme", rarity: "legendary" },
  { slug: "meme23", name: "Meme 23", category: "meme", rarity: "mythic" },
  { slug: "meme24", name: "Meme 24", category: "meme", rarity: "mythic" },
];

export async function seedDefaultStickers(): Promise<number> {
  let created = 0;
  const seedUrls = new Set(STICKERS.map((s) => `/stickers/memes/${s.slug}.webp`));
  for (const s of STICKERS) {
    const url = `/stickers/memes/${s.slug}.webp`;
    const existing = await prisma.chatSticker.findFirst({
      where: { imageUrl: url },
    });
    if (!existing) {
      await prisma.chatSticker.create({
        data: { name: s.name, category: s.category, imageUrl: url, rarity: s.rarity, isGachaReward: true },
      });
      created++;
    }
  }

  // Dọn các sticker cũ không thuộc seed (3D-emoji / SVG) → tắt isGachaReward, giữ khỏi pool
  const nonSeed = await prisma.chatSticker.findMany({
    where: { imageUrl: { notIn: [...seedUrls] }, isGachaReward: true },
  });
  if (nonSeed.length > 0) {
    await prisma.chatSticker.updateMany({
      where: { imageUrl: { notIn: [...seedUrls] }, isGachaReward: true },
      data: { isGachaReward: false },
    });
  }

  if (created > 0 || nonSeed.length > 0) {
    console.log(`[Stickers] Seeded ${created} meme stickers, disabled ${nonSeed.length} non-seed stickers`);
  }
  return created;
}