import crypto from "crypto";
import prisma from "./prisma";

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";

export interface GachaRewardItem {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  rewardType: "xp" | "tokens" | "hint_credits" | "streak_freeze" | "avatar" | "emoji" | "sticker" | "puzzle_piece" | "custom";
  amount: number;
  icon: string;
  avatarId?: string;
  emojiCode?: string;
  stickerId?: string;
  stickerUrl?: string;
  puzzleRewardId?: string;
  pieceIndex?: number; // 0, 1, 2, 3
  pieceName?: string;
  puzzleImageUrl?: string;
}

export const GACHA_COST_X1 = 10;
export const GACHA_COST_X10 = 90; // Giảm 10% khi mở gói 10
export const HARD_PITY = 30;

export const GACHA_RATES: Readonly<Record<Rarity, number>> = {
  common: 0.60,
  rare: 0.25,
  epic: 0.10,
  legendary: 0.04,
  mythic: 0.01,
};

export const RARITY_RANK: Readonly<Record<Rarity, number>> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
  mythic: 4,
};

export const BASE_VIRTUAL_POOL: GachaRewardItem[] = [
  // Common (60%)
  { id: "xp-30", name: "+30 EXP", description: "Động lực học tập cho bài học tiếp theo.", rarity: "common", rewardType: "xp", amount: 30, icon: "⚡" },
  { id: "xp-50", name: "+50 EXP", description: "Thêm điểm kinh nghiệm nâng cao thứ hạng.", rarity: "common", rewardType: "xp", amount: 50, icon: "⚡" },
  { id: "tokens-5", name: "+5 Vàng", description: "Túi vàng nhỏ tích lũy mua sắm.", rarity: "common", rewardType: "tokens", amount: 5, icon: "🪙" },
  { id: "tokens-8", name: "+8 Vàng", description: "Thỏi vàng may mắn từ hộp quà.", rarity: "common", rewardType: "tokens", amount: 8, icon: "🪙" },
  { id: "hint-1", name: "+1 Gợi ý Quiz", description: "Dùng để xem gợi ý khi gặp câu hỏi khó.", rarity: "common", rewardType: "hint_credits", amount: 1, icon: "💡" },
  { id: "emoji-sunglasses", name: "Emoji Kính Đen Ngầu", description: "Mở khóa emoji 😎 độc quyền trong Live Chat.", rarity: "common", rewardType: "emoji", amount: 1, icon: "😎", emojiCode: "😎" },
  { id: "emoji-sparkle", name: "Emoji Ngôi Sao Lấp Lánh", description: "Mở khóa emoji ✨ trong Live Chat.", rarity: "common", rewardType: "emoji", amount: 1, icon: "✨", emojiCode: "✨" },
  
  // Rare (25%)
  { id: "xp-120", name: "+120 EXP", description: "Cú hích kinh nghiệm mạnh mẽ!", rarity: "rare", rewardType: "xp", amount: 120, icon: "✨" },
  { id: "tokens-20", name: "+20 Vàng", description: "Kho báu vàng giá trị.", rarity: "rare", rewardType: "tokens", amount: 20, icon: "💰" },
  { id: "hint-3", name: "+3 Gợi ý Quiz", description: "3 lượt trợ giúp giải bài và câu hỏi hóc búa.", rarity: "rare", rewardType: "hint_credits", amount: 3, icon: "💡" },
  { id: "freeze-1", name: "+1 Khiên Bảo Lưu Streak", description: "Bảo vệ chuỗi học tập nếu lỡ quên 1 ngày.", rarity: "rare", rewardType: "streak_freeze", amount: 1, icon: "🛡️" },
  { id: "avatar-fox", name: "Avatar Cáo Đỏ", description: "Mở khóa avatar Cáo Đỏ lanh lợi.", rarity: "rare", rewardType: "avatar", amount: 1, icon: "🦊", avatarId: "fox" },
  { id: "emoji-fire", name: "Emoji Lửa Chiến Binh", description: "Mở khóa emoji 🔥 rực cháy cho Live Chat.", rarity: "rare", rewardType: "emoji", amount: 1, icon: "🔥", emojiCode: "🔥" },
  { id: "emoji-party", name: "Emoji Pháo Hoa Ăn Mừng", description: "Mở khóa emoji 🎉 ăn mừng điểm cao.", rarity: "rare", rewardType: "emoji", amount: 1, icon: "🎉", emojiCode: "🎉" },
  
  // Epic (10%)
  { id: "xp-300", name: "+300 EXP", description: "Bùng nổ điểm kinh nghiệm vượt bậc!", rarity: "epic", rewardType: "xp", amount: 300, icon: "🔥" },
  { id: "tokens-60", name: "+60 Vàng", description: "Rương vàng trĩu nặng phần thưởng.", rarity: "epic", rewardType: "tokens", amount: 60, icon: "💎" },
  { id: "freeze-3", name: "+3 Khiên Bảo Lưu Streak", description: "Bộ 3 khiên hộ mệnh bảo vệ chuỗi dài ngày.", rarity: "epic", rewardType: "streak_freeze", amount: 3, icon: "🛡️" },
  { id: "avatar-koala", name: "Avatar Gấu Túi Koala", description: "Mở khóa avatar Koala siêu đáng yêu.", rarity: "epic", rewardType: "avatar", amount: 1, icon: "🐨", avatarId: "koala" },
  { id: "emoji-rocket", name: "Emoji Tên Lửa Vút Bay", description: "Mở khóa emoji 🚀 vươn tới vũ trụ.", rarity: "epic", rewardType: "emoji", amount: 1, icon: "🚀", emojiCode: "🚀" },
  { id: "emoji-diamond", name: "Emoji Kim Cương Quý", description: "Mở khóa emoji 💎 quý giá trong Live Chat.", rarity: "epic", rewardType: "emoji", amount: 1, icon: "💎", emojiCode: "💎" },
  
  // Legendary (4%)
  { id: "xp-800", name: "+800 EXP", description: "Kinh nghiệm siêu cấp - Bứt phá top 1!", rarity: "legendary", rewardType: "xp", amount: 800, icon: "👑" },
  { id: "tokens-200", name: "+200 Vàng", description: "Bao vàng đại gia từ thần may mắn.", rarity: "legendary", rewardType: "tokens", amount: 200, icon: "🏆" },
  { id: "avatar-tiger", name: "Avatar Hổ Vằn Chiến Binh", description: "Avatar Hổ Vằn độc quyền dũng mãnh.", rarity: "legendary", rewardType: "avatar", amount: 1, icon: "🐯", avatarId: "tiger" },
  { id: "emoji-crown", name: "Emoji Vương Miện Hoàng Gia", description: "Mở khóa emoji 👑 Vua học tập.", rarity: "legendary", rewardType: "emoji", amount: 1, icon: "👑", emojiCode: "👑" },
  
  // Mythic (1%)
  { id: "xp-2000", name: "+2,000 EXP Thần Thoại", description: "Kho báu huyền thoại tối thượng!", rarity: "mythic", rewardType: "xp", amount: 2000, icon: "🌟" },
  { id: "tokens-500", name: "+500 Vàng Thần Thoại", description: "Kho báu hoàng kim vĩ đại nhất học viện.", rarity: "mythic", rewardType: "tokens", amount: 500, icon: "👑" },
  { id: "avatar-dinosaur", name: "Avatar Khủng Long Huyền Thoại", description: "Avatar Khủng Long tối thượng hiếm có.", rarity: "mythic", rewardType: "avatar", amount: 1, icon: "🦖", avatarId: "dinosaur" },
  { id: "emoji-unicorn", name: "Emoji Kỳ Lân Thần Thoại", description: "Mở khóa emoji 🦄 Huyền thoại tối thượng.", rarity: "mythic", rewardType: "emoji", amount: 1, icon: "🦄", emojiCode: "🦄" },
  ];

export function secureRandom(): number {
  const buf = crypto.randomBytes(4);
  return buf.readUInt32LE(0) / 0x100000000;
}

export function rollRarity(pity: number, rand = secureRandom()): Rarity {
  const pointer = Math.max(0, Math.min(0.999999999, rand));
  let cumulative = 0;
  let result: Rarity = "common";
  const rateEntries: [Rarity, number][] = [
    ["common", GACHA_RATES.common],
    ["rare", GACHA_RATES.rare],
    ["epic", GACHA_RATES.epic],
    ["legendary", GACHA_RATES.legendary],
    ["mythic", GACHA_RATES.mythic],
  ];

  for (const [rarity, rate] of rateEntries) {
    cumulative += rate;
    if (pointer < cumulative) {
      result = rarity;
      break;
    }
  }

  const hardPityReached = pity >= HARD_PITY - 1;
  if (hardPityReached && RARITY_RANK[result] < RARITY_RANK.legendary) {
    return "legendary";
  }
  return result;
}

const PIECE_NAMES = ["Mảnh 1 (Góc trên-trái)", "Mảnh 2 (Góc trên-phải)", "Mảnh 3 (Góc dưới-trái)", "Mảnh 4 (Góc dưới-phải)"];

/**
 * Lấy danh sách pool quà kết hợp giữa quà ảo mặc định, các mảnh ghép puzzle và Meme Stickers do Admin kích hoạt
 */
export async function getDynamicRewardPool(): Promise<GachaRewardItem[]> {
  const [activePhysicalRewards, activeChatStickers, virtualConfigs] = await Promise.all([
    prisma.physicalReward.findMany({ where: { isActive: true } }),
    prisma.chatSticker.findMany({ where: { isGachaReward: true } }),
    prisma.gachaVirtualRewardConfig.findMany(),
  ]);

  const configByKey = new Map(virtualConfigs.map((c) => [c.id, c]));

  // 0. Quà ảo: áp override (bật/tắt, đổi name/rarity/amount/icon) từ admin
  const pool: GachaRewardItem[] = BASE_VIRTUAL_POOL.filter((item) => {
    const cfg = configByKey.get(item.id);
    // Không có config → giữ default (active)
    return !cfg || cfg.isActive;
  }).map((item) => {
    const cfg = configByKey.get(item.id);
    if (!cfg) return item;
    return { ...item, name: cfg.name, description: cfg.description ?? item.description, rarity: (cfg.rarity as Rarity) || item.rarity, amount: cfg.amount, icon: cfg.icon };
  });

  // 1. Thêm Stickers do Admin chọn vào Gacha
  for (const st of activeChatStickers) {
    const rarity = (st.rarity as Rarity) || "rare";
    pool.push({
      id: `sticker-${st.id}`,
      name: `Sticker: ${st.name}`,
      description: `Meme Sticker "${st.name}" độc quyền gửi trong khung Live Chat.`,
      rarity,
      rewardType: "sticker",
      amount: 1,
      icon: "🖼️",
      stickerId: st.id,
      stickerUrl: st.imageUrl,
    });
  }

  // 2. Thêm Puzzle Pieces quà hiện vật
  for (const phys of activePhysicalRewards) {
    const rarity = (phys.rarity as Rarity) || "epic";
    for (let idx = 0; idx < 4; idx++) {
      pool.push({
        id: `puzzle-${phys.id}-${idx}`,
        name: `${phys.name} - [Mảnh ${idx + 1}/4]`,
        description: `Mảnh ghép số ${idx + 1} của "${phys.name}". Thu thập đủ 4 mảnh để ghép thành phần thưởng hoàn chỉnh!`,
        rarity,
        rewardType: "puzzle_piece",
        amount: 1,
        icon: "🧩",
        puzzleRewardId: phys.id,
        pieceIndex: idx,
        pieceName: PIECE_NAMES[idx],
        puzzleImageUrl: phys.imageUrl,
      });
    }
  }

  return pool;
}

export async function rollOneReward(pity: number, pool?: GachaRewardItem[]): Promise<{ reward: GachaRewardItem; rarity: Rarity; nextPity: number }> {
  const fullPool = pool || (await getDynamicRewardPool());
  const rarity = rollRarity(pity);
  const matched = fullPool.filter((r) => r.rarity === rarity);
  const randIndex = Math.floor(secureRandom() * matched.length);
  const reward = matched[randIndex] || matched[0] || fullPool[0];
  const nextPity = RARITY_RANK[rarity] >= RARITY_RANK.legendary ? 0 : pity + 1;
  return { reward, rarity, nextPity };
}

export async function rollGachaPack(pity: number, count: 1 | 10): Promise<{ cards: GachaRewardItem[]; nextPity: number }> {
  const pool = await getDynamicRewardPool();
  const cards: GachaRewardItem[] = [];
  let currentPity = Math.max(0, pity);

  for (let i = 0; i < count; i++) {
    const { reward, nextPity } = await rollOneReward(currentPity, pool);
    cards.push(reward);
    currentPity = nextPity;
  }

  cards.sort((a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]);
  return { cards, nextPity: currentPity };
}
