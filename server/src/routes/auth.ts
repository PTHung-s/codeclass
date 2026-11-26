import { Router, Request, Response } from "express";
import { hashPassword, comparePassword, generateToken } from "../utils/jwt";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import { invalidateUserProfile } from "../services/gameWebSocket";

const router = Router();
const MAX_FULL_NAME_LENGTH = 40;
const MAX_NICKNAME_LENGTH = 24;

function normalizeFullName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function validateFullName(value: unknown) {
  const fullName = normalizeFullName(value);
  if (!fullName) return { error: "Full name is required" };
  if (fullName.length > MAX_FULL_NAME_LENGTH) {
    return { error: `Full name must be at most ${MAX_FULL_NAME_LENGTH} characters` };
  }
  return { fullName };
}

function validateNickname(value: unknown) {
  if (value === undefined || value === null || value === "") return { nickname: null };
  const nickname = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!nickname) return { nickname: null };
  if (nickname.length > MAX_NICKNAME_LENGTH) return { error: `Nickname must be at most ${MAX_NICKNAME_LENGTH} characters` };
  return { nickname };
}

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { fullName, nickname, email, password, role } = req.body;

    if (!fullName || !email || !password) {
      res.status(400).json({ error: "Full name, email, and password are required" });
      return;
    }

    const nameResult = validateFullName(fullName);
    if ("error" in nameResult) {
      res.status(400).json({ error: nameResult.error });
      return;
    }
    const nicknameResult = validateNickname(nickname);
    if ("error" in nicknameResult) {
      res.status(400).json({ error: nicknameResult.error });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    if (role && role !== "student") {
      res.status(403).json({ error: "Public registration only allows student accounts" });
      return;
    }
    const userRole = "student";

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { fullName: nameResult.fullName, nickname: nicknameResult.nickname, email, passwordHash, role: userRole },
      select: { id: true, fullName: true, nickname: true, email: true, role: true, createdAt: true },
    });

    const token = generateToken({ userId: user.id, email: user.email, role: user.role });

    import("../services/assignmentService")
      .then(({ syncAutoAssignmentsForStudent }) => syncAutoAssignmentsForStudent(user.id))
      .catch(() => {});

    res.status(201).json({ user, token });
  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (user.status !== "active") {
      res.status(403).json({ error: "Account is not active" });
      return;
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = generateToken({ userId: user.id, email: user.email, role: user.role });

    res.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        nickname: user.nickname,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        mustChangePassword: user.mustChangePassword,
      },
      token,
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true, fullName: true, nickname: true, email: true, role: true,
        avatarUrl: true, phone: true, bio: true, status: true,
        unlockedEmojis: true,
        createdAt: true, lastLoginAt: true, mustChangePassword: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to get user info" });
  }
});

// Lightweight rewards snapshot for the client's balance watcher (useBalanceRewards).
// Two cheap single-row reads — far cheaper than polling /dashboard (leaderboard scan).
router.get("/me/rewards", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { xp: true, tokenBalance: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ xp: user.xp ?? 0, tokenBalance: user.tokenBalance ?? 0 });
  } catch (err) {
    res.status(500).json({ error: "Failed to get rewards" });
  }
});

router.patch("/me", authenticate, async (req: Request, res: Response) => {
  try {
    const { fullName, nickname, avatarUrl, phone, bio } = req.body;
    const nameResult = fullName !== undefined ? validateFullName(fullName) : null;
    if (nameResult && "error" in nameResult) {
      res.status(400).json({ error: nameResult.error });
      return;
    }
    const nicknameResult = nickname !== undefined ? validateNickname(nickname) : null;
    if (nicknameResult && "error" in nicknameResult) {
      res.status(400).json({ error: nicknameResult.error });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(nameResult && "fullName" in nameResult && { fullName: nameResult.fullName }),
        ...(nicknameResult && "nickname" in nicknameResult && { nickname: nicknameResult.nickname }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(phone !== undefined && { phone }),
        ...(bio !== undefined && { bio }),
      },
      select: {
        id: true, fullName: true, nickname: true, email: true, role: true,
        avatarUrl: true, phone: true, bio: true, status: true,
      },
    });

    invalidateUserProfile(user.id);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.post("/change-password", authenticate, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Current and new password are required" });
      return;
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      res.status(400).json({ error: "Mật khẩu mới phải có ít nhất 8 ký tự" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: "Current password is incorrect" });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
    });

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
