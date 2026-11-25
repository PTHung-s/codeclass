import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { param } from "../utils/routeHelpers";
import db from "../utils/prisma";

const router = Router();
router.use(authenticate);

// Avatar shop configuration (synced with client)
const AVATAR_TIERS = [
  { id: "default", name: "Mặc định", animalName: "Penguin", cost: 0, order: 0 },
  { id: "fox", name: "Cáo Đỏ", animalName: "Fox", cost: 25, order: 1 },
  { id: "panda", name: "Gấu Trúc", animalName: "Panda", cost: 50, order: 2 },
  { id: "raccoon", name: "Gấu Trúc Đỏ", animalName: "Raccoon", cost: 75, order: 3 },
  { id: "koala", name: "Gấu Túi", animalName: "Koala", cost: 125, order: 4 },
  { id: "axolotl", name: "Kỳ Nhông", animalName: "Axolotl", cost: 200, order: 5 },
  { id: "tiger", name: "Hổ Vằn", animalName: "Tiger", cost: 300, order: 6 },
  { id: "dinosaur", name: "Khủng Long", animalName: "Dinosaur", cost: 450, order: 7 },
];

function getAvatarUrl(animalName: string): string {
  return `https://anonymous-animals.azurewebsites.net/animal/${animalName}`;
}

// ── GET /api/avatars/shop — avatar gallery with unlock status ──
router.get("/shop", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).userId;
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { tokenBalance: true, selectedAvatar: true, unlockedAvatars: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const unlocked = new Set<string>(JSON.parse(user.unlockedAvatars || "[]"));
    const selected = user.selectedAvatar || "default";

    const avatars = AVATAR_TIERS.map((tier) => ({
      ...tier,
      unlocked: tier.id === "default" || unlocked.has(tier.id),
      selected: tier.id === selected,
    }));

    res.json({
      avatars,
      tokenBalance: user.tokenBalance,
      selectedAvatar: selected,
    });
  } catch (err: any) {
    console.error("avatar shop error:", err);
    res.status(500).json({ error: "Không thể tải avatar shop." });
  }
});

// ── POST /api/avatars/unlock/:avatarId — unlock with tokens ──
router.post("/unlock/:avatarId", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).userId;
    const avatarId = param(req, "avatarId");

    const tier = AVATAR_TIERS.find((t) => t.id === avatarId);
    if (!tier) {
      res.status(404).json({ error: "Avatar không tồn tại." });
      return;
    }
    if (tier.id === "default") {
      res.status(400).json({ error: "Avatar mặc định đã được mở sẵn." });
      return;
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { tokenBalance: true, unlockedAvatars: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const unlocked = new Set<string>(JSON.parse(user.unlockedAvatars || "[]"));
    if (unlocked.has(avatarId)) {
      res.status(400).json({ error: "Avatar đã được mở khoá rồi." });
      return;
    }

    if (user.tokenBalance < tier.cost) {
      res.status(400).json({ error: `Không đủ tokens. Cần ${tier.cost} tokens.` });
      return;
    }

    unlocked.add(avatarId);
    // Atomic: deduct tokens + record the spend in the ledger + unlock, in one transaction,
    // so the balance and the token_transactions ledger always stay in sync.
    await db.$transaction(async (tx) => {
      const current =
        (await tx.user.findUnique({ where: { id: userId }, select: { tokenBalance: true } }))
          ?.tokenBalance ?? 0;
      if (current < tier.cost) {
        throw new Error("INSUFFICIENT");
      }
      const balanceAfter = current - tier.cost;
      await tx.tokenTransaction.create({
        data: {
          userId,
          amount: -tier.cost,
          balanceAfter,
          type: "spend",
          reason: "avatar_purchase",
          description: `Mở khoá avatar ${tier.name}`,
          refType: "Avatar",
          refId: avatarId,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          tokenBalance: balanceAfter,
          unlockedAvatars: JSON.stringify([...unlocked]),
        },
      });
    });

    res.json({ ok: true, message: `Đã mở khoá ${tier.name}!` });
  } catch (err: any) {
    console.error("unlock avatar error:", err);
    res.status(500).json({ error: "Không thể mở khoá avatar." });
  }
});

// ── POST /api/avatars/select/:avatarId — select unlocked avatar ──
router.post("/select/:avatarId", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).userId;
    const avatarId = param(req, "avatarId");

    const tier = AVATAR_TIERS.find((t) => t.id === avatarId);
    if (!tier) {
      res.status(404).json({ error: "Avatar không tồn tại." });
      return;
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { unlockedAvatars: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const unlocked = new Set<string>(JSON.parse(user.unlockedAvatars || "[]"));
    if (avatarId !== "default" && !unlocked.has(avatarId)) {
      res.status(400).json({ error: "Avatar chưa được mở khoá." });
      return;
    }

    await db.user.update({
      where: { id: userId },
      data: {
        selectedAvatar: avatarId,
        avatarUrl: getAvatarUrl(tier.animalName),
      },
    });

    res.json({ ok: true, message: `Đã chọn ${tier.name}!` });
  } catch (err: any) {
    console.error("select avatar error:", err);
    res.status(500).json({ error: "Không thể chọn avatar." });
  }
});

export default router;
