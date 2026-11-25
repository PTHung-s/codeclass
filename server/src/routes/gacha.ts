import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { spendTokens, awardTokens } from "../utils/tokens";
import { awardXp } from "../utils/xpLedger";
import {
  GACHA_COST_X1,
  GACHA_COST_X10,
  HARD_PITY,
  GACHA_RATES,
  getDynamicRewardPool,
  rollGachaPack,
  BASE_VIRTUAL_POOL,
} from "../utils/gachaEngine";
import { notifyWalletChanged } from "../utils/realtimeEvents";
import { notifyNotificationChanged } from "../services/notificationEvents";

const router = Router();
router.use(authenticate);

const GEM_RATES: Record<string, number> = { common: 1, rare: 2, epic: 5, legendary: 15, mythic: 50 };

// ── GET /api/gacha/info: Lấy thông tin pity, số dư, tỉ lệ và danh sách phần thưởng ──
router.get("/info", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tokenBalance: true, xp: true, gachaPity: true, unlockedEmojis: true, unlockedStickers: true, gemBalance: true },
    });

    const unlockedEmojis: string[] = JSON.parse(user?.unlockedEmojis || "[]");
    const unlockedStickers: string[] = JSON.parse(user?.unlockedStickers || "[]");

    const [recentPulls, pool, userPieces, physicalRewards, allStickers] = await Promise.all([
      prisma.gachaPull.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      getDynamicRewardPool(),
      prisma.userPuzzlePiece.findMany({
        where: { userId },
        include: { reward: true },
      }),
      prisma.physicalReward.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.chatSticker.findMany({
        orderBy: [{ isGachaReward: "desc" }, { name: "asc" }],
      }),
    ]);

    // Nhóm mảnh ghép của user theo từng phần thưởng
    const puzzleProgress = physicalRewards.map((reward) => {
      const pieces = userPieces.filter((p) => p.rewardId === reward.id);
      const pieceIndices = pieces.map((p) => p.pieceIndex);
      const isComplete = [0, 1, 2, 3].every((idx) => pieceIndices.includes(idx));
      return {
        reward,
        pieces,
        collectedCount: pieceIndices.length,
        totalRequired: 4,
        isComplete,
      };
    });

    res.json({
      tokenBalance: user?.tokenBalance ?? 0,
      xp: user?.xp ?? 0,
      pity: user?.gachaPity ?? 0,
      gemBalance: user?.gemBalance ?? 0,
      hardPity: HARD_PITY,
      costs: {
        x1: GACHA_COST_X1,
        x10: GACHA_COST_X10,
      },
      rates: GACHA_RATES,
      rewardsPool: pool,
      unlockedEmojis,
      unlockedStickers,
      stickers: allStickers.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        imageUrl: s.imageUrl,
        rarity: s.rarity,
        isGachaReward: s.isGachaReward,
        unlocked: unlockedStickers.includes(s.id),
      })),
      recentPulls,
      puzzleProgress,
    });
  } catch (err: any) {
    console.error("Gacha info error:", err);
    res.status(500).json({ error: "Không thể tải thông tin gacha" });
  }
});

// ── POST /api/gacha/roll: Thực hiện mở 1 gói hoặc 10 gói ──
router.post("/roll", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const count = Number(req.body.count) === 10 ? 10 : 1;
    const cost = count === 10 ? GACHA_COST_X10 : GACHA_COST_X1;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tokenBalance: true, gachaPity: true, unlockedAvatars: true, unlockedEmojis: true, unlockedStickers: true },
    });

    if (!user) {
      res.status(404).json({ error: "Không tìm thấy người dùng" });
      return;
    }

    if (user.tokenBalance < cost) {
      res.status(400).json({
        error: `Số dư không đủ! Cần ${cost} Vàng/Tokens để mở gói x${count}`,
        balance: user.tokenBalance,
        cost,
      });
      return;
    }

    // 1. Trừ tokens mở gacha
    try {
      await spendTokens(userId, cost, {
        reason: "gacha_roll",
        description: `Mở gói thẻ bài may mắn x${count}`,
        refType: "gacha",
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Không thể trừ tokens" });
      return;
    }

    // 2. Roll phần thưởng từ Gacha Engine (bao gồm cả puzzle pieces)
    const { cards, nextPity } = await rollGachaPack(user.gachaPity || 0, count);

    // 3. Cập nhật pity cho user
    await prisma.user.update({
      where: { id: userId },
      data: { gachaPity: nextPity },
    });

    // 4. Phân phối phần thưởng
    const currentUnlockedAvatars: string[] = JSON.parse(user.unlockedAvatars || "[]");
    const newUnlockedAvatars = new Set<string>(currentUnlockedAvatars);
    const currentUnlockedEmojis: string[] = JSON.parse(user.unlockedEmojis || "[]");
    const newUnlockedEmojis = new Set<string>(currentUnlockedEmojis);
    const currentUnlockedStickers: string[] = JSON.parse(user.unlockedStickers || "[]");
    const newUnlockedStickers = new Set<string>(currentUnlockedStickers);
    let gemsEarned = 0;
    const perCardGem = new Map<string, number>();

    for (const card of cards) {
      await prisma.gachaPull.create({
        data: {
          userId,
          rewardId: card.id,
          name: card.name,
          description: card.description,
          rarity: card.rarity,
          rewardType: card.rewardType,
          amount: card.amount,
          icon: card.icon,
          packSize: count,
          costTokens: Math.round(cost / count),
        },
      });

      if (card.rewardType === "xp") {
        await awardXp(userId, card.amount, {
          reason: "gacha_reward",
          description: `Phần thưởng từ Gói thẻ: ${card.name}`,
          refType: "gacha",
        });
      } else if (card.rewardType === "tokens") {
        await awardTokens(userId, card.amount, {
          reason: "gacha_reward",
          description: `Phần thưởng từ Gói thẻ: ${card.name}`,
          refType: "gacha",
        });
      } else if (card.rewardType === "hint_credits") {
        await prisma.user.update({
          where: { id: userId },
          data: { hintCredits: { increment: card.amount } },
        });
      } else if (card.rewardType === "streak_freeze") {
        await prisma.user.update({
          where: { id: userId },
          data: { streakFreezes: { increment: card.amount } },
        });
      } else if (card.rewardType === "avatar" && card.avatarId) {
        if (newUnlockedAvatars.has(card.avatarId)) {
          const g = GEM_RATES[card.rarity] || 1;
          gemsEarned += g;
          perCardGem.set(card.id, g);
        } else {
          newUnlockedAvatars.add(card.avatarId);
        }
      } else if (card.rewardType === "emoji" && card.emojiCode) {
        if (newUnlockedEmojis.has(card.emojiCode)) {
          const g = GEM_RATES[card.rarity] || 1;
          gemsEarned += g;
          perCardGem.set(card.id, g);
        } else {
          newUnlockedEmojis.add(card.emojiCode);
        }
      } else if (card.rewardType === "sticker" && card.stickerId) {
        if (newUnlockedStickers.has(card.stickerId)) {
          const g = GEM_RATES[card.rarity] || 1;
          gemsEarned += g;
          perCardGem.set(card.id, g);
        } else {
          newUnlockedStickers.add(card.stickerId);
        }
      } else if (card.rewardType === "puzzle_piece" && card.puzzleRewardId && card.pieceIndex !== undefined) {
        // Lưu mảnh ghép vào bảng user_puzzle_pieces
        await prisma.userPuzzlePiece.upsert({
          where: {
            userId_rewardId_pieceIndex: {
              userId,
              rewardId: card.puzzleRewardId,
              pieceIndex: card.pieceIndex,
            },
          },
          update: {
            count: { increment: 1 },
          },
          create: {
            userId,
            rewardId: card.puzzleRewardId,
            pieceIndex: card.pieceIndex,
            count: 1,
          },
        });

        // Kiểm tra xem đã đủ 4 mảnh chưa
        const userPieces = await prisma.userPuzzlePiece.findMany({
          where: { userId, rewardId: card.puzzleRewardId },
        });
        if (userPieces.length === 4) {
          await prisma.notification.create({
            data: {
              userId,
              title: "Thu thập đủ 4 Mảnh Ghép! 🧩🎉",
              message: `Chúc mừng bạn đã thu thập đủ 4 mảnh ghép của phần thưởng "${card.name.split(" - ")[0]}". Vào mục Mảnh ghép để đổi quà ngay!`,
              type: "puzzle_completed",
            },
          });
        }
      }
    }

    if (newUnlockedAvatars.size > currentUnlockedAvatars.length) {
      await prisma.user.update({
        where: { id: userId },
        data: { unlockedAvatars: JSON.stringify(Array.from(newUnlockedAvatars)) },
      });
    }

    if (newUnlockedEmojis.size > currentUnlockedEmojis.length) {
      await prisma.user.update({
        where: { id: userId },
        data: { unlockedEmojis: JSON.stringify(Array.from(newUnlockedEmojis)) },
      });
    }

    if (newUnlockedStickers.size > currentUnlockedStickers.length) {
      await prisma.user.update({
        where: { id: userId },
        data: { unlockedStickers: JSON.stringify(Array.from(newUnlockedStickers)) },
      });
    }

    // Cập nhật gem balance nếu có trùng
    if (gemsEarned > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { gemBalance: { increment: gemsEarned } },
      });
    }

    notifyWalletChanged(userId);
    notifyNotificationChanged(userId);

    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { tokenBalance: true, xp: true, gachaPity: true, hintCredits: true, streakFreezes: true, unlockedStickers: true, gemBalance: true },
    });

    res.json({
      cards: cards.map((c, idx) => ({ ...c, uniqueId: `${c.id}-${Date.now()}-${idx}`, gemsEarned: perCardGem.get(c.id) || 0 })),
      balance: updatedUser?.tokenBalance ?? 0,
      xp: updatedUser?.xp ?? 0,
      pity: updatedUser?.gachaPity ?? 0,
      hintCredits: updatedUser?.hintCredits ?? 0,
      streakFreezes: updatedUser?.streakFreezes ?? 0,
      unlockedStickers: JSON.parse(updatedUser?.unlockedStickers || "[]"),
      gemsEarned,
      gemBalance: updatedUser?.gemBalance ?? 0,
    });
  } catch (err: any) {
    console.error("Gacha roll error:", err);
    res.status(500).json({ error: err.message || "Lỗi khi mở gói thẻ bài" });
  }
});

// ── POST /api/gacha/claim-puzzle: Đổi quà hiện vật sau khi ghép đủ 4 mảnh ──
router.post("/claim-puzzle/:rewardId", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const rewardId = String(req.params.rewardId);
    const { note } = req.body;

    const reward = await prisma.physicalReward.findUnique({
      where: { id: rewardId },
    });

    if (!reward || !reward.isActive) {
      res.status(404).json({ error: "Quà tặng không tồn tại hoặc đã ngừng" });
      return;
    }

    if (reward.stock !== null && reward.stock <= 0) {
      res.status(400).json({ error: "Quà tặng này hiện đã hết hàng" });
      return;
    }

    // Kiểm tra sở hữu đủ 4 mảnh ghép
    const pieces = await prisma.userPuzzlePiece.findMany({
      where: { userId, rewardId },
    });

    const hasAll4 = [0, 1, 2, 3].every((idx) => pieces.some((p) => p.pieceIndex === idx));
    if (!hasAll4) {
      res.status(400).json({ error: "Bạn chưa thu thập đủ 4 mảnh ghép của phần thưởng này!" });
      return;
    }

    // Tiêu thụ 1 mảnh mỗi loại
    for (let idx = 0; idx < 4; idx++) {
      const p = pieces.find((item) => item.pieceIndex === idx);
      if (p && p.count > 1) {
        await prisma.userPuzzlePiece.update({
          where: { id: p.id },
          data: { count: { decrement: 1 } },
        });
      } else if (p) {
        await prisma.userPuzzlePiece.delete({
          where: { id: p.id },
        });
      }
    }

    // Trừ stock nếu hữu hạn
    if (reward.stock !== null) {
      await prisma.physicalReward.update({
        where: { id: rewardId },
        data: { stock: { decrement: 1 } },
      });
    }

    // Tạo yêu cầu nhận quà hiện vật
    const claim = await prisma.physicalRewardClaim.create({
      data: {
        userId,
        rewardId,
        note,
        status: "pending",
      },
    });

    // Thông báo cho học sinh
    await prisma.notification.create({
      data: {
        userId,
        title: "Yêu cầu đổi quà đã gửi! 🎁",
        message: `Bạn đã đổi thành công 4 mảnh ghép của "${reward.name}". Vui lòng liên hệ giáo viên tại lớp để nhận quà thực tế nhé!`,
        type: "physical_claim_pending",
      },
    });
    notifyNotificationChanged(userId);

    res.status(201).json({ claim, message: "Đổi quà thành công! Đang chờ giáo viên trao quà." });
  } catch (err: any) {
    console.error("Claim puzzle error:", err);
    res.status(500).json({ error: err.message || "Lỗi khi đổi quà mảnh ghép" });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GEM SHOP — mua sticker với gems (từ gacha trùng)
// ─────────────────────────────────────────────────────────────────────────

const GEM_SHOP_COST: Record<string, number> = { common: 5, rare: 10, epic: 25, legendary: 80, mythic: 250 };

// GET /api/gacha/gem-shop: Danh sách sticker có thể mua bằng gems (chưa sở hữu)
router.get("/gem-shop", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { gemBalance: true, unlockedStickers: true, unlockedAvatars: true, unlockedEmojis: true },
    });
    const stickerIds = new Set(JSON.parse(user?.unlockedStickers || "[]"));
    const allStickers = await prisma.chatSticker.findMany({ where: { isGachaReward: true }, orderBy: { rarity: "asc" }, select: { id: true, name: true, imageUrl: true, rarity: true, category: true } });
    const catalog = allStickers.filter((s) => !stickerIds.has(s.id)).map((s) => ({
      ...s,
      gemCost: GEM_SHOP_COST[s.rarity] || 10,
    }));
    res.json({ gemBalance: user?.gemBalance ?? 0, catalog });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load gem shop" });
  }
});

// POST /api/gacha/gem-shop/buy/:stickerId: Mua sticker bằng gems
router.post("/gem-shop/buy/:stickerId", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const stickerId = String(req.params.stickerId);
    const sticker = await prisma.chatSticker.findUnique({ where: { id: stickerId } });
    if (!sticker || !sticker.isGachaReward) {
      res.status(400).json({ error: "Sticker không tồn tại hoặc không thể mua" });
      return;
    }
    const cost = GEM_SHOP_COST[sticker.rarity] || 10;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { gemBalance: true, unlockedStickers: true } });
    if (!user || user.gemBalance < cost) {
      res.status(400).json({ error: "Không đủ gems", gemBalance: user?.gemBalance ?? 0, cost });
      return;
    }
    const unlocked: string[] = JSON.parse(user.unlockedStickers || "[]");
    if (unlocked.includes(stickerId)) {
      res.status(400).json({ error: "Bạn đã sở hữu sticker này rồi" });
      return;
    }
    unlocked.push(stickerId);
    await prisma.user.update({ where: { id: userId }, data: { unlockedStickers: JSON.stringify(unlocked), gemBalance: { decrement: cost } } });
    res.json({ ok: true, gemBalance: user.gemBalance - cost, sticker });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to buy sticker" });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// ADMIN / TEACHER CRUD QUẢN LÝ QUÀ HIỆN VẬT & DUYỆT ĐỔI QUÀ
// ─────────────────────────────────────────────────────────────────────────

// GET /api/gacha/admin/rewards: Danh sách quà hiện vật
router.get("/admin/rewards", requireRole("admin", "teacher"), async (_req: Request, res: Response) => {
  try {
    const rewards = await prisma.physicalReward.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { userPieces: true, claims: true } },
      },
    });
    res.json(rewards);
  } catch (err: any) {
    res.status(500).json({ error: "Không thể tải danh sách quà" });
  }
});

// POST /api/gacha/admin/rewards: Tạo quà hiện vật mới
router.post("/admin/rewards", requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const { name, description, imageUrl, rarity, stock } = req.body;
    if (!name || !imageUrl) {
      res.status(400).json({ error: "Tên quà và ảnh quà tặng là bắt buộc!" });
      return;
    }

    const reward = await prisma.physicalReward.create({
      data: {
        name,
        description,
        imageUrl,
        rarity: rarity || "epic",
        stock: typeof stock === "number" ? stock : 10,
      },
    });

    res.status(201).json(reward);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Không thể tạo quà" });
  }
});

// PUT /api/gacha/admin/rewards/:id: Cập nhật quà hiện vật
router.put("/admin/rewards/:id", requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, description, imageUrl, rarity, stock, isActive } = req.body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (rarity !== undefined) data.rarity = rarity;
    if (stock !== undefined) data.stock = typeof stock === "number" ? stock : null;
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await prisma.physicalReward.update({
      where: { id },
      data,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Không thể cập nhật quà" });
  }
});

// DELETE /api/gacha/admin/rewards/:id: Xóa / Vô hiệu hóa
router.delete("/admin/rewards/:id", requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.physicalReward.update({
      where: { id },
      data: { isActive: false },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Không thể vô hiệu hoá quà tặng" });
  }
});

// GET /api/gacha/admin/claims: Danh sách học sinh xin đổi quà
router.get("/admin/claims", requireRole("admin", "teacher", "teaching_assistant"), async (_req: Request, res: Response) => {
  try {
    const claims = await prisma.physicalRewardClaim.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, fullName: true, nickname: true, avatarUrl: true, email: true } },
        reward: true,
      },
    });
    res.json(claims);
  } catch (err: any) {
    res.status(500).json({ error: "Không thể tải danh sách đổi quà" });
  }
});

// POST /api/gacha/admin/claims/:id/complete: Duyệt đã trao quà tận tay
router.post("/admin/claims/:id/complete", requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const reviewerId = req.user!.userId;

    const claim = await prisma.physicalRewardClaim.update({
      where: { id },
      data: {
        status: "completed",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
      include: { reward: true },
    });

    const rewardName = (claim as any).reward?.name || "quà tặng";

    await prisma.notification.create({
      data: {
        userId: claim.userId,
        title: "Đã nhận quà tặng hiện vật! 🎉",
        message: `Giáo viên đã xác nhận trao phần thưởng "${rewardName}" cho bạn. Chúc mừng bạn nhé!`,
        type: "physical_claim_completed",
      },
    });
    notifyNotificationChanged(claim.userId);

    res.json(claim);
  } catch (err: any) {
    res.status(500).json({ error: "Không thể duyệt trao quà" });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// ADMIN / TEACHER QUẢN LÝ MEME STICKER (Chọn sticker nào được làm quà Gacha)
// ─────────────────────────────────────────────────────────────────────────

// GET /api/gacha/admin/stickers: Danh sách tất cả sticker + số lượng học sinh sở hữu
router.get("/admin/stickers", requireRole("admin", "teacher"), async (_req: Request, res: Response) => {
  try {
    const stickers = await prisma.chatSticker.findMany({
      orderBy: [{ isGachaReward: "desc" }, { category: "asc" }, { name: "asc" }],
    });
    res.json(stickers);
  } catch (err: any) {
    res.status(500).json({ error: "Không thể tải danh sách sticker" });
  }
});

// POST /api/gacha/admin/stickers: Tạo sticker mới
router.post("/admin/stickers", requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const { name, category, imageUrl, rarity } = req.body;
    if (!name || !imageUrl) {
      res.status(400).json({ error: "Tên sticker và đường dẫn ảnh là bắt buộc!" });
      return;
    }
    const sticker = await prisma.chatSticker.create({
      data: {
        name,
        category: category || "meme",
        imageUrl,
        rarity: rarity || "rare",
        isGachaReward: true,
      },
    });
    res.status(201).json(sticker);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Không thể tạo sticker" });
  }
});

// PUT /api/gacha/admin/stickers/:id: Bật/tắt gacha + sửa rarity/category
router.put("/admin/stickers/:id", requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, category, imageUrl, rarity, isGachaReward } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (category !== undefined) data.category = category;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (rarity !== undefined) data.rarity = rarity;
    if (isGachaReward !== undefined) data.isGachaReward = !!isGachaReward;

    const updated = await prisma.chatSticker.update({ where: { id }, data });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Không thể cập nhật sticker" });
  }
});

// DELETE /api/gacha/admin/stickers/:id: Xóa sticker
router.delete("/admin/stickers/:id", requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.chatSticker.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Không thể xóa sticker" });
  }
});

const VIRTUAL_REWARD_RARITIES = ["common", "rare", "epic", "legendary", "mythic"];
// Quà ảo = rewardType không phải puzzle_piece / sticker
const VIRTUAL_BASE_REWARDS = BASE_VIRTUAL_POOL.filter((r) => r.rewardType !== "puzzle_piece" && r.rewardType !== "sticker");

// GET /api/gacha/admin/virtual-rewards: Danh sách đầy đủ quà ảo (base + override)
router.get("/admin/virtual-rewards", requireRole("admin", "teacher"), async (_req: Request, res: Response) => {
  try {
    const configs = await prisma.gachaVirtualRewardConfig.findMany();
    const configByKey = new Map(configs.map((c) => [c.id, c]));
    const result = VIRTUAL_BASE_REWARDS.map((r) => {
      const cfg = configByKey.get(r.id);
      return {
        id: r.id,
        rewardType: r.rewardType,
        baseName: r.name,
        baseRarity: r.rarity,
        baseAmount: r.amount,
        baseIcon: r.icon,
        name: cfg?.name ?? r.name,
        description: cfg?.description ?? r.description,
        rarity: cfg?.rarity ?? r.rarity,
        amount: cfg?.amount ?? r.amount,
        icon: cfg?.icon ?? r.icon,
        isActive: cfg ? cfg.isActive : true,
      };
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "Không thể tải danh sách quà ảo" });
  }
});

// PUT /api/gacha/admin/virtual-rewards/:id: Cập nhật override (bật/tắt, đổi rarity/tên/amount)
router.put("/admin/virtual-rewards/:id", requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const base = VIRTUAL_BASE_REWARDS.find((r) => r.id === id);
    if (!base) {
      res.status(400).json({ error: "Không tìm thấy quà ảo này" });
      return;
    }
    const { name, description, rarity, amount, icon, isActive } = req.body;

    if (rarity !== undefined && !VIRTUAL_REWARD_RARITIES.includes(String(rarity))) {
      res.status(400).json({ error: "Độ hiếm không hợp lệ" });
      return;
    }

    const data: any = {
      id,
      name: name !== undefined ? String(name) : base.name,
      description: description !== undefined ? String(description) : base.description,
      rarity: rarity !== undefined ? String(rarity) : (await prisma.gachaVirtualRewardConfig.findUnique({ where: { id } }))?.rarity ?? base.rarity,
      amount: amount !== undefined ? Math.max(1, Number(amount)) : base.amount,
      icon: icon !== undefined ? String(icon) : base.icon,
      isActive: isActive !== undefined ? !!isActive : true,
    };

    const saved = await prisma.gachaVirtualRewardConfig.upsert({
      where: { id },
      update: data,
      create: data,
    });
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Không thể cập nhật quà ảo" });
  }
});

export default router;
