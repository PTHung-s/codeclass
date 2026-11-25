import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, paginate } from "../utils/routeHelpers";
import { awardTokens, spendTokens, adjustTokens, getTokenBalance } from "../utils/tokens";
import { getRates, saveRates, getLbRewards, saveLbRewards, invalidateAllCaches, getStreakConfig, saveStreakConfig } from "../utils/gamificationSettings";
import { getStreakByUser } from "../utils/xpLedger";
import { vnStartOfDay, vnStartOfWeek, vnWeekKey } from "../utils/vnTime";
import { notifyNotificationChanged } from "../services/notificationEvents";

const router = Router();

// ─────────────────────────────────────────────
// Balance & history
// ─────────────────────────────────────────────

router.get("/tokens/balance", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { tokenBalance: true, hintCredits: true, streakFreezes: true } });
    const recent = await prisma.tokenTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, amount: true, type: true, reason: true, description: true, createdAt: true },
    });
    res.json({ balance: user?.tokenBalance ?? 0, hintCredits: user?.hintCredits ?? 0, streakFreezes: user?.streakFreezes ?? 0, recent });
  } catch {
    res.status(500).json({ error: "Failed to load token balance" });
  }
});

router.get("/tokens/transactions", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const pg = paginate(req, { maxLimit: 100 });
    const type = typeof req.query.type === "string" ? req.query.type : undefined;

    const where: any = { userId };
    if (type) where.type = type;

    const [total, items] = await Promise.all([
      prisma.tokenTransaction.count({ where }),
      prisma.tokenTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pg.skip,
        take: pg.limit,
      }),
    ]);

    res.json(pg.envelope("items", items, total));
  } catch {
    res.status(500).json({ error: "Failed to load transactions" });
  }
});

// ─────────────────────────────────────────────
// Leaderboard: top streak + top tokens
// ─────────────────────────────────────────────

router.get("/tokens/leaderboard", authenticate, async (_req: Request, res: Response) => {
  try {
    const [topTokens, streaks] = await Promise.all([
      prisma.user.findMany({
        where: { role: "student", status: "active" },
        select: { id: true, fullName: true, avatarUrl: true, tokenBalance: true },
        orderBy: { tokenBalance: "desc" },
        take: 20,
      }),
      getStreakByUser(),
    ]);

    // getStreakByUser returns Map<userId, streak> for ALL users; filter to active students
    const topStreakIds = [...streaks.entries()]
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    // Resolve names for top streak users
    const streakUsers = await prisma.user.findMany({
      where: { id: { in: topStreakIds.map(([id]) => id) }, role: "student", status: "active" },
      select: { id: true, fullName: true, avatarUrl: true },
    });
    const userMap = new Map(streakUsers.map((u) => [u.id, u]));
    const topStreak = topStreakIds
      .map(([id, streak]) => {
        const u = userMap.get(id);
        return u ? { id: u.id, fullName: u.fullName, avatarUrl: u.avatarUrl, streak } : null;
      })
      .filter(Boolean);

    res.json({
      topTokens: topTokens.map((u) => ({ id: u.id, fullName: u.fullName, avatarUrl: u.avatarUrl, tokens: u.tokenBalance })),
      topStreak,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load leaderboard" });
  }
});

// ── Daily claim (engagement: students press a button once a day for a bonus) ──
const DAILY_CLAIM_BASE = 3;
const DAILY_CLAIM_MAX_LUCKY = 7;
const DAILY_CLAIM_STREAK_MULTIPLIER = 2; // extra tokens per streak day

function vnDateString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}

router.get("/tokens/daily-claim/status", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const todayKey = vnDateString(new Date());
    const refId = `${userId}_${todayKey}`;
    const claimedToday = await prisma.tokenTransaction.findFirst({
      where: { userId, refType: "daily_claim", refId },
      select: { amount: true, createdAt: true, description: true },
    });
    const lastClaim = await prisma.tokenTransaction.findFirst({
      where: { userId, refType: "daily_claim" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, refId: true },
    });
    res.json({
      canClaim: !claimedToday,
      claimedToday: claimedToday ? { amount: claimedToday.amount, at: claimedToday.createdAt } : null,
      lastClaimAt: lastClaim?.createdAt ?? null,
    });
  } catch {
    res.status(500).json({ error: "Failed to load claim status" });
  }
});

router.post("/tokens/daily-claim", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const todayKey = vnDateString(new Date());
    const refId = `${userId}_${todayKey}`;

    // Compute consecutive claim streak from history
    const claims = await prisma.tokenTransaction.findMany({
      where: { userId, refType: "daily_claim" },
      select: { refId: true },
    });
    const claimedDays = new Set(claims.map((c) => c.refId));

    // Walk back from yesterday to count consecutive days claimed
    let claimStreak = 1; // today will be the first
    for (let i = 1; i <= 400; i++) {
      const d = new Date(Date.now() - i * 86400000);
      const key = `${userId}_${vnDateString(d)}`;
      if (claimedDays.has(key)) claimStreak++;
      else break;
    }

    const lucky = Math.floor(Math.random() * (DAILY_CLAIM_MAX_LUCKY + 1)); // 0..7
    // Streak bonus scales linearly with streak: 2 tokens per streak day, capped at 30 total
    const streakBonus = (claimStreak - 1) * DAILY_CLAIM_STREAK_MULTIPLIER;
    const amount = Math.min(DAILY_CLAIM_BASE + lucky + streakBonus, 30);

    const result = await awardTokens(userId, amount, {
      reason: "daily_claim",
      description: `Nhận thưởng hàng ngày (streak ${claimStreak} ngày${streakBonus > 0 ? `, bonus streak +${streakBonus}` : ""})`,
      refType: "daily_claim",
      refId,
    });

    if (!result.awarded) {
      res.status(400).json({ error: "Bạn đã nhận thưởng hôm nay rồi. Quay lại vào ngày mai nhé!" });
      return;
    }

    res.json({
      amount,
      lucky,
      streakBonus,
      claimStreak,
      balance: result.balance,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to claim" });
  }
});

// How-to-earn guide (public to any logged-in user)
router.get("/tokens/guide", authenticate, async (_req: Request, res: Response) => {
  try {
    const rates = await getRates();
    res.json({
      rates: [
        { label: "Giải bài Easy", amount: rates.tokens.problemEasyTokens, icon: "🟢" },
        { label: "Giải bài Medium", amount: rates.tokens.problemMediumTokens, icon: "🟡" },
        { label: "Giải bài Hard", amount: rates.tokens.problemHardTokens, icon: "🔴" },
        { label: "Hoàn thành bài học", amount: rates.tokens.lessonTokens, icon: "📚" },
        { label: "Nộp bài tập", amount: rates.tokens.assignmentTokens, icon: "📝" },
        { label: "Đỗ quiz", amount: rates.tokens.quizPassTokens, icon: "✅" },
        { label: "Được giáo viên chấm điểm", amount: `theo điểm (hệ số ×${rates.tokens.reviewTokensMultiplier})`, icon: "⭐" },
        { label: "Vượt bài kiểm tra chương", amount: rates.tokens.adaptivePassTokens, icon: "🎯" },
        { label: "Xóa chương học", amount: rates.tokens.chapterClearTokens, icon: "🔓" },
        { label: "Hoàn thành kỳ thi", amount: rates.tokens.contestFinishTokens, icon: "🏁" },
        { label: "Tham gia game Fortress", amount: rates.tokens.gameParticipationTokens, icon: "🏰" },
        { label: "Trả lời giúp đỡ (chọn là giải pháp)", amount: rates.tokens.helpSolutionTokens, icon: "💡" },
        { label: "Đặt câu hỏi hỗ trợ", amount: rates.tokens.helpRequestTokens, icon: "🙋" },
        { label: "Báo lỗi được xử lý", amount: rates.tokens.bugReportTokens, icon: "🐛" },
        { label: "Đề xuất test case được duyệt", amount: rates.tokens.hacktestTokens, icon: "🧪" },
        { label: "Điểm danh có mặt", amount: rates.tokens.attendanceTokens, icon: "📅" },
      ],
    });
  } catch {
    res.status(500).json({ error: "Failed to load guide" });
  }
});

// ─────────────────────────────────────────────
// Reward catalog (shop)
// ─────────────────────────────────────────────

router.get("/rewards", authenticate, async (_req: Request, res: Response) => {
  try {
    const rewards = await prisma.reward.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { tokenCost: "asc" }],
    });
    res.json(rewards);
  } catch {
    res.status(500).json({ error: "Failed to load rewards" });
  }
});

router.post("/rewards/:id/redeem", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const rewardId = param(req, "id");
    const note = typeof req.body.note === "string" ? req.body.note.trim() : undefined;

    const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
    if (!reward || !reward.isActive) {
      res.status(404).json({ error: "Phần thưởng không tồn tại hoặc đã ngừng" });
      return;
    }
    if (reward.stock !== null && reward.stock <= 0) {
      res.status(400).json({ error: "Phần thưởng đã hết" });
      return;
    }

    const balance = await getTokenBalance(userId);
    if (balance < reward.tokenCost) {
      res.status(400).json({ error: "Số dư token không đủ", balance, cost: reward.tokenCost });
      return;
    }

    // Create redemption, then spend atomically.
    const redemption = await prisma.rewardRedemption.create({
      data: {
        userId,
        rewardId,
        tokenCost: reward.tokenCost,
        status: reward.autoFulfill ? "completed" : "pending",
        note,
      },
    });

    try {
      await spendTokens(userId, reward.tokenCost, {
        reason: "redeem",
        description: `Đổi: ${reward.name}`,
        refType: "reward_redemption",
        refId: redemption.id,
      });
    } catch (err: any) {
      // Roll back the redemption if spend failed (e.g. race)
      await prisma.rewardRedemption.delete({ where: { id: redemption.id } }).catch(() => {});
      res.status(400).json({ error: err.message || "Không thể đổi thưởng" });
      return;
    }

    // Decrement stock atomically if finite (prevents oversell under concurrency)
    if (reward.stock !== null) {
      const upd = await prisma.reward.updateMany({
        where: { id: rewardId, stock: { gt: 0 } },
        data: { stock: { decrement: 1 } },
      });
      if (upd.count === 0) {
        // Sold out between check and decrement: refund and cancel
        await prisma.rewardRedemption.delete({ where: { id: redemption.id } }).catch(() => {});
        await awardTokens(userId, reward.tokenCost, {
          reason: "refund",
          description: `Hoàn tokens: phần thưởng hết hàng`,
          refType: "refund",
          refId: redemption.id,
        }).catch(() => {});
        res.status(400).json({ error: "Phần thưởng vừa hết hàng", balance: await getTokenBalance(userId) });
        return;
      }
    }

    const newBalance = await getTokenBalance(userId);

    // Fulfill virtual perks (e.g. hint credits) if applicable
    if (reward.autoFulfill && reward.metadata) {
      try {
        const meta = JSON.parse(reward.metadata);
        if (meta.perkType === "hint_credits" && typeof meta.amount === "number" && meta.amount > 0) {
          await prisma.user.update({
            where: { id: userId },
            data: { hintCredits: { increment: meta.amount } },
          });
        }
        if (meta.perkType === "streak_freeze") {
          const amt = typeof meta.amount === "number" && meta.amount > 0 ? meta.amount : 1;
          await prisma.user.update({
            where: { id: userId },
            data: { streakFreezes: { increment: amt } },
          });
        }
      } catch { /* metadata not JSON or unknown format — silent skip */ }
    }

    // Notify student
    await prisma.notification.create({
      data: {
        userId,
        title: reward.autoFulfill ? "Đổi thưởng thành công" : "Yêu cầu đổi thưởng đã gửi",
        message: reward.autoFulfill
          ? `Bạn đã đổi "${reward.name}" bằng ${reward.tokenCost} tokens.`
          : `Yêu cầu đổi "${reward.name}" đang chờ giáo viên/phụ huynh duyệt.`,
        type: reward.autoFulfill ? "reward_completed" : "reward_pending",
        relatedEntityType: "reward_redemption",
        relatedEntityId: redemption.id,
      },
    });
    notifyNotificationChanged(userId);

    res.status(201).json({ redemption, balance: newBalance });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to redeem reward" });
  }
});

router.get("/rewards/my-redemptions", authenticate, async (req: Request, res: Response) => {
  try {
    const items = await prisma.rewardRedemption.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      include: { reward: { select: { name: true, icon: true, type: true } } },
    });
    res.json(items);
  } catch {
    res.status(500).json({ error: "Failed to load redemptions" });
  }
});

// ─────────────────────────────────────────────
// Admin: reward CRUD + redemption management + manual grants
// ─────────────────────────────────────────────

router.post(
  "/rewards",
  authenticate,
  requireRole("admin", "teacher"),
  async (req: Request, res: Response) => {
    try {
      const { name, description, type, icon, tokenCost, category, stock, autoFulfill, metadata } = req.body;
      if (!name || typeof tokenCost !== "number") {
        res.status(400).json({ error: "name và tokenCost là bắt buộc" });
        return;
      }
      const reward = await prisma.reward.create({
        data: {
          name,
          description,
          type: type || "virtual",
          icon,
          tokenCost,
          category: category || "misc",
          stock: typeof stock === "number" ? stock : null,
          autoFulfill: !!autoFulfill,
          metadata: !metadata ? null : typeof metadata === "string" ? metadata : JSON.stringify(metadata),
        },
      });
      res.status(201).json(reward);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to create reward" });
    }
  }
);

router.put(
  "/rewards/:id",
  authenticate,
  requireRole("admin", "teacher"),
  async (req: Request, res: Response) => {
    try {
      const { name, description, type, icon, tokenCost, category, stock, isActive, autoFulfill, metadata } = req.body;
      const data: any = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;
      if (type !== undefined) data.type = type;
      if (icon !== undefined) data.icon = icon;
      if (tokenCost !== undefined) data.tokenCost = tokenCost;
      if (category !== undefined) data.category = category;
      if (stock !== undefined) data.stock = typeof stock === "number" ? stock : null;
      if (isActive !== undefined) data.isActive = isActive;
      if (autoFulfill !== undefined) data.autoFulfill = autoFulfill;
      if (metadata !== undefined) data.metadata = !metadata ? null : typeof metadata === "string" ? metadata : JSON.stringify(metadata);
      const reward = await prisma.reward.update({ where: { id: param(req, "id") }, data });
      res.json(reward);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update reward" });
    }
  }
);

router.delete(
  "/rewards/:id",
  authenticate,
  requireRole("admin", "teacher"),
  async (req: Request, res: Response) => {
    try {
      await prisma.reward.update({ where: { id: param(req, "id") }, data: { isActive: false } });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to deactivate reward" });
    }
  }
);

router.get(
  "/rewards/redemptions",
  authenticate,
  requireRole("admin", "teacher", "teaching_assistant"),
  async (req: Request, res: Response) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const where: any = {};
      if (status) where.status = status;
      const items = await prisma.rewardRedemption.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, fullName: true, nickname: true, avatarUrl: true } },
          reward: { select: { name: true, icon: true, type: true } },
        },
      });
      res.json(items);
    } catch {
      res.status(500).json({ error: "Failed to load redemptions" });
    }
  }
);

async function processRedemption(
  req: Request,
  res: Response,
  newStatus: "completed" | "rejected"
) {
  try {
    const redemptionId = param(req, "id");
    const userId = req.user!.userId;
    const note = typeof req.body.note === "string" ? req.body.note.trim() : undefined;
    const redemption = await prisma.rewardRedemption.findUnique({ where: { id: redemptionId } });
    if (!redemption) {
      res.status(404).json({ error: "Không tìm thấy yêu cầu" });
      return;
    }

    // Atomic status transition: only a still-pending row can be processed,
    // preventing double-approve/double-refund under concurrency.
    const upd = await prisma.rewardRedemption.updateMany({
      where: { id: redemptionId, status: "pending" },
      data: { status: newStatus, reviewedById: userId, reviewedAt: new Date(), note: note ?? redemption.note },
    });
    if (upd.count === 0) {
      res.status(400).json({ error: "Yêu cầu đã được xử lý" });
      return;
    }

    // If rejected, refund the tokens (idempotent via dedupKey on refId)
    if (newStatus === "rejected") {
      await awardTokens(redemption.userId, redemption.tokenCost, {
        reason: "refund",
        description: `Hoàn tokens: yêu cầu đổi thưởng bị từ chối`,
        refType: "refund",
        refId: redemption.id,
      }).catch(() => {});
      // Restore stock if finite
      await prisma.reward.updateMany({
        where: { id: redemption.rewardId, stock: { not: null } },
        data: { stock: { increment: 1 } },
      }).catch(() => {});
    }

    await prisma.notification.create({
      data: {
        userId: redemption.userId,
        title: newStatus === "completed" ? "Đổi thưởng đã hoàn tất" : "Yêu cầu đổi thưởng bị từ chối",
        message:
          newStatus === "completed"
            ? `Yêu cầu đổi thưởng của bạn đã được duyệt và hoàn tất.`
            : `Yêu cầu đổi thưởng bị từ chối. ${redemption.tokenCost} tokens đã được hoàn lại.`,
        type: newStatus === "completed" ? "reward_completed" : "reward_rejected",
        relatedEntityType: "reward_redemption",
        relatedEntityId: redemption.id,
      },
    });
    notifyNotificationChanged(redemption.userId);

    res.json({ ...redemption, status: newStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to process redemption" });
  }
}

router.post(
  "/rewards/redemptions/:id/approve",
  authenticate,
  requireRole("admin", "teacher", "teaching_assistant"),
  (req, res) => processRedemption(req, res, "completed")
);

router.post(
  "/rewards/redemptions/:id/reject",
  authenticate,
  requireRole("admin", "teacher", "teaching_assistant"),
  (req, res) => processRedemption(req, res, "rejected")
);

// Manual grant / adjust a student's tokens
router.post(
  "/tokens/grant",
  authenticate,
  requireRole("admin", "teacher", "teaching_assistant"),
  async (req: Request, res: Response) => {
    try {
      const { userId, amount, reason, description, requestId } = req.body;
      if (!userId || typeof amount !== "number" || !Number.isFinite(amount) || amount === 0) {
        res.status(400).json({ error: "userId và amount (khác 0) là bắt buộc" });
        return;
      }
      // Guard against a non-existent userId (would otherwise throw a Prisma FK error).
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!target) {
        res.status(400).json({ error: "Không tìm thấy học sinh với ID này" });
        return;
      }
      const balance = await adjustTokens(userId, amount, {
        reason: reason || "manual_grant",
        description: description || `Cấp/trừ token thủ công bởi ${req.user!.role}`,
        refType: "manual",
        // `requestId` (client-generated per submit) makes the grant idempotent so a
        // double-click or network retry cannot apply the same grant twice.
        dedupKey: typeof requestId === "string" && requestId.trim() ? `${userId}_${req.user!.userId}_${requestId.trim()}` : undefined,
      });
      res.json({ balance });
    } catch (err: any) {
      if (err?.code === "P2003") {
        res.status(400).json({ error: "Không tìm thấy học sinh với ID này" });
        return;
      }
      res.status(500).json({ error: err.message || "Failed to grant tokens" });
    }
  }
);

// ─────────────────────────────────────────────
// Admin: gamification rate settings (XP + token earning values)
// ─────────────────────────────────────────────

router.get(
  "/settings/gamification",
  authenticate,
  requireRole("admin", "teacher", "teaching_assistant"),
  async (_req: Request, res: Response) => {
    try {
      const [rates, streak] = await Promise.all([getRates(), getStreakConfig()]);
      res.json({ ...rates, streak });
    } catch {
      res.status(500).json({ error: "Failed to load gamification settings" });
    }
  }
);

router.put(
  "/settings/gamification",
  authenticate,
  requireRole("admin", "teacher"),
  async (req: Request, res: Response) => {
    try {
      const { xp, tokens, streak } = req.body;
      // Only keep numeric fields; saveRates merges over current values.
      const cleanNum = (obj: any): Record<string, number> => {
        const out: Record<string, number> = {};
        if (obj && typeof obj === "object") {
          for (const [k, v] of Object.entries(obj)) {
            if (typeof v === "number" && isFinite(v) && v >= 0) out[k] = v;
          }
        }
        return out;
      };
      await saveRates(cleanNum(xp), cleanNum(tokens));
      if (streak && typeof streak === "object") {
        const cfg: Record<string, number> = {};
        const min = Number(streak.minActiveMinutes);
        const lookback = Number(streak.bridgeLookbackDays);
        if (Number.isFinite(min) && min >= 0 && min <= 60) cfg.minActiveMinutes = Math.round(min);
        if (Number.isFinite(lookback) && lookback >= 0 && lookback <= 365) cfg.bridgeLookbackDays = Math.round(lookback);
        if (Object.keys(cfg).length) await saveStreakConfig(cfg);
      }
      const [rates, streakCfg] = await Promise.all([getRates(), getStreakConfig()]);
      res.json({ ...rates, streak: streakCfg });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to save gamification settings" });
    }
  }
);

// ── Leaderboard rewards settings + distribution ──

router.get("/settings/leaderboard-rewards", authenticate, requireRole("admin", "teacher"), async (_req: Request, res: Response) => {
  try {
    const rewards = await getLbRewards();
    res.json(rewards);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load leaderboard rewards" });
  }
});

router.put("/settings/leaderboard-rewards", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    await saveLbRewards(req.body);
    const rewards = await getLbRewards();
    res.json(rewards);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save leaderboard rewards" });
  }
});

// Manual trigger: distribute daily top 5 + weekly #1 leaderboard rewards
router.post("/admin/distribute-leaderboard-rewards", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const rewards = await getLbRewards();
    const { xp: rates } = await getRates();
    const todayKey = vnDateString(new Date());

    // ── Build a leaderboard scoped to a time window ──
    // Previously one unscoped, all-time table was used for BOTH the daily and the
    // weekly payout, so "top 3 of the day" and "top 3 of the week" were really
    // "top 3 ever" — a student who did nothing this week still collected.
    const users = await prisma.user.findMany({
      where: { role: "student", status: "active" },
      select: { id: true, fullName: true, nickname: true },
    });
    const userIds = users.map((u) => u.id);

    async function buildLeaderboard(since: Date | null) {
      const subWhere: any = { studentId: { in: userIds } };
      if (since) subWhere.submittedAt = { gte: since };
      const subCounts = await prisma.submission.groupBy({
        by: ["studentId"],
        _count: { id: true },
        where: subWhere,
      });
      const subCountMap = new Map(subCounts.map((s) => [s.studentId, s._count.id]));

      const lessonWhere: any = { userId: { in: userIds } };
      if (since) lessonWhere.completedAt = { gte: since };
      const lessonCounts = await prisma.lessonProgress.groupBy({
        by: ["userId"],
        _count: { id: true },
        where: lessonWhere,
      });
      const lessonCountMap = new Map(lessonCounts.map((l) => [l.userId, l._count.id]));

      // Problem XP — simplified: submission count * flat rate (the full calc needs
      // the assignment->problem chain).
      const table = users.map((u) => {
        const count = subCountMap.get(u.id) || 0;
        const problemXp = count * rates.problemMediumXp;
        const submissionXp = count * rates.submissionXp;
        const lessonXp = (lessonCountMap.get(u.id) || 0) * rates.lessonXp;
        return { userId: u.id, fullName: u.fullName, xp: problemXp + submissionXp + lessonXp };
      });
      // Students with no activity in the window cannot be "top" of it.
      return table.filter((row) => row.xp > 0).sort((a, b) => b.xp - a.xp);
    }

    const lb = await buildLeaderboard(vnStartOfDay());

    const results: string[] = [];

    // ── Daily top 3 ──
    const top3 = lb.slice(0, 3);
    for (let i = 0; i < top3.length; i++) {
      const amount = rewards.dailyTop3[i] ?? 0;
      if (amount <= 0) continue;
      const refId = `daily_top3_${todayKey}_${top3[i].userId}`;
      const existing = await prisma.tokenTransaction.findFirst({ where: { refType: "daily_top3", refId } });
      if (existing) continue;
      await awardTokens(top3[i].userId, amount, {
        reason: "daily_top3",
        description: `Top ${i + 1} bảng xếp hạng ngày ${todayKey}`,
        refType: "daily_top3",
        refId,
      });
      results.push(`#${i + 1} ${top3[i].fullName}: +${amount} tokens`);
    }

    // ── Weekly top 3 (only on Sundays, day 0) ──
    // Sunday in VN time, not the host's: the container runs in UTC, where VN
    // Sunday evening is still Saturday, so getDay() could skip the payout.
    const nowVnDay = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short" });
    const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(nowVnDay);
    if (dayOfWeek === 0) {
      // Scored over the VN week (Monday 00:00), not reused from the daily table.
      const weeklyLb = await buildLeaderboard(vnStartOfWeek());
      const weeklyTop3 = weeklyLb.slice(0, 3);
      const weekKey = vnWeekKey();
      for (let i = 0; i < weeklyTop3.length; i++) {
        const amount = rewards.weeklyTop3[i] ?? 0;
        if (amount <= 0) continue;
        const refId = `weekly_top3_${weekKey}_${weeklyTop3[i].userId}`;
        const existing = await prisma.tokenTransaction.findFirst({ where: { refType: "weekly_top3", refId } });
        if (existing) continue;
        await awardTokens(weeklyTop3[i].userId, amount, {
          reason: "weekly_top3",
          description: `Hạng ${i + 1} tuần ${weekKey}`,
          refType: "weekly_top3",
          refId,
        });
        results.push(`🏆 Tuần #${i + 1}: ${weeklyTop3[i].fullName}: +${amount} tokens`);
      }
    }

    // Also invalidate caches so admin sees fresh rates
    invalidateAllCaches();

    res.json({ ok: true, dayOfWeek, results, top3: top3.map((t, i) => ({ rank: i + 1, ...t, reward: rewards.dailyTop3[i] || 0 })) });
  } catch (err: any) {
    console.error("distribute-leaderboard-rewards error:", err);
    res.status(500).json({ error: err.message || "Failed to distribute rewards" });
  }
});

export default router;
