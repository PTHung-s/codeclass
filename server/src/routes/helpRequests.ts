import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param } from "../utils/routeHelpers";
import { broadcastToAll } from "../services/gameWebSocket";
import { presentUserForViewer, presentUserPublicly } from "../utils/userPresentation";

const router = Router();

function safeParseTags(tags: string): string[] {
  try { return JSON.parse(tags); } catch { return []; }
}

/** Detail/list pages refetch only when the ticket they show has changed. */
function broadcastHelpRequestChange(requestId: string, action: string) {
  broadcastToAll({ type: "help_request_changed", payload: { requestId, action } });
}

function presentRequestForViewer<T extends { createdBy?: any; claimedBy?: any; replies?: Array<{ author?: any }> }>(request: T, role: string): T {
  return {
    ...request,
    createdBy: presentUserForViewer(request.createdBy, role),
    claimedBy: presentUserForViewer(request.claimedBy, role),
    replies: request.replies?.map((reply) => ({ ...reply, author: presentUserForViewer(reply.author, role) })),
  } as T;
}

function presentRequestPublicly<T extends { createdBy?: any; claimedBy?: any }>(request: T): T {
  return {
    ...request,
    createdBy: presentUserPublicly(request.createdBy),
    claimedBy: presentUserPublicly(request.claimedBy),
  } as T;
}

// ── GET /api/help-requests ──
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;

    const where: any = {};
    if (type === "chat" || type === "help") where.type = type;

    console.log("[help-requests] GET type=", type, "where=", JSON.stringify(where));

    const requests = await prisma.helpRequest.findMany({
      where,
      include: {
        createdBy: { select: { id: true, fullName: true, nickname: true, avatarUrl: true, role: true } },
        claimedBy: { select: { id: true, fullName: true, nickname: true, avatarUrl: true, role: true } },
        problem: { select: { id: true, title: true } },
        _count: { select: { replies: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    console.log("[help-requests] GET success, count=", requests.length);

    const result = requests.map((r) => ({
      ...presentRequestForViewer(r, req.user!.role),
      tags: safeParseTags(r.tags),
      replyCount: r._count.replies,
      _count: undefined,
    }));

    res.json(result);
  } catch (err: any) {
    console.error("[help-requests] GET ERROR:", err?.message, err?.code, err?.meta);
    res.status(500).json({ error: "Failed to fetch help requests" });
  }
});

// ── GET /api/help-requests/unread ──
router.get("/unread", authenticate, async (req: Request, res: Response) => {
  try {
    const { userId } = req.user!;
    const since = req.query.since as string | undefined;

    const where: any = {
      type: "chat",
      createdById: { not: userId }, // only messages from others
    };

    if (since) {
      where.createdAt = { gt: new Date(since) };
    }

    const count = await prisma.helpRequest.count({ where });
    res.json({ count });
  } catch (err: any) {
    console.error("[help-requests] unread ERROR:", err?.message);
    res.status(500).json({ error: "Failed to count unread" });
  }
});

// ── GET /api/help-requests/:id ──
router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");

    // Increment view count
    await prisma.helpRequest.update({ where: { id }, data: { viewCount: { increment: 1 } } });

    const request = await prisma.helpRequest.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true, nickname: true, avatarUrl: true, role: true } },
        claimedBy: { select: { id: true, fullName: true, nickname: true, avatarUrl: true, role: true } },
        problem: { select: { id: true, title: true, difficulty: true } },
        replies: {
          include: {
            author: { select: { id: true, fullName: true, nickname: true, avatarUrl: true, role: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { replies: true } },
      },
    });

    if (!request) {
      res.status(404).json({ error: "Help request not found" });
      return;
    }

    res.json({
      ...presentRequestForViewer(request, req.user!.role),
      tags: safeParseTags(request.tags),
      replyCount: request._count.replies,
      _count: undefined,
    });
  } catch (err: any) {
    console.error("GET /api/help-requests/:id error:", err?.message || err);
    res.status(500).json({ error: "Failed to fetch help request", detail: err?.message || String(err) });
  }
});

// ── POST /api/help-requests ──
router.post("/", authenticate, async (req: Request, res: Response) => {
  try {
    const { userId } = req.user!;
    const { title, description, tags, problemId, priority, type } = req.body;
    const messageType = type === "help" ? "help" : "chat";

    if (!description?.trim()) {
      res.status(400).json({ error: "Nội dung không được để trống" });
      return;
    }
    if (messageType === "help" && !title?.trim()) {
      res.status(400).json({ error: "Tiêu đề không được để trống với ticket" });
      return;
    }

    const request = await prisma.helpRequest.create({
      data: {
        type: messageType,
        title: messageType === "help" ? title.trim() : null,
        description: description.trim(),
        tags: JSON.stringify(Array.isArray(tags) ? tags : []),
        problemId: problemId || null,
        priority: priority || "medium",
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, fullName: true, nickname: true, avatarUrl: true, role: true } },
      },
    });

    const result = {
      ...presentRequestForViewer(request, req.user!.role),
      tags: safeParseTags(request.tags),
      replyCount: 0,
    };

    res.status(201).json(result);

    // Broadcast real-time to all connected clients
    broadcastToAll({ type: "chat_new", payload: presentRequestPublicly(result) });
    broadcastHelpRequestChange(request.id, "created");

    // Gamification: award tokens only for help tickets (not chat messages)
    if (messageType === "help" && title?.trim()) {
      import("../utils/tokens")
        .then(({ awardHelpRequestTokens }) => awardHelpRequestTokens(userId, request.id, title!.trim()))
        .catch(() => {});
    }
  } catch (err: any) {
    console.error("POST /api/help-requests error:", err?.message || err);
    res.status(500).json({ error: "Failed to create help request", detail: err?.message || String(err) });
  }
});

// ── PATCH /api/help-requests/:id ──
router.patch("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { userId, role } = req.user!;
    const { status, claimedById, priority } = req.body;

    const existing = await prisma.helpRequest.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Help request not found" });
      return;
    }

    // Only author or teacher/admin can update
    if (existing.createdById !== userId && !["teacher", "admin", "teaching_assistant"].includes(role)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const data: any = {};
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;

    // Claim: teacher/admin can assign, anyone can claim unclaimed requests
    if (claimedById !== undefined) {
      if (claimedById === null) {
        data.claimedById = null;
      } else if (existing.claimedById === null || ["teacher", "admin", "teaching_assistant"].includes(role)) {
        data.claimedById = claimedById;
      }
    }

    if (status === "resolved" || status === "closed") {
      data.resolvedAt = new Date();
    }
    if (status === "open") {
      data.resolvedAt = null;
    }

    // Auto-claim when moving to in_progress
    if (status === "in_progress" && !existing.claimedById) {
      data.claimedById = userId;
    }

    const updated = await prisma.helpRequest.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, fullName: true, nickname: true, avatarUrl: true, role: true } },
        claimedBy: { select: { id: true, fullName: true, nickname: true, avatarUrl: true, role: true } },
      },
    });

    res.json({
      ...presentRequestForViewer(updated, req.user!.role),
      tags: safeParseTags(updated.tags),
    });
    broadcastHelpRequestChange(id, "updated");
  } catch (err: any) {
    console.error("PATCH /api/help-requests/:id error:", err?.message || err);
    res.status(500).json({ error: "Failed to update help request", detail: err?.message || String(err) });
  }
});

router.delete("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { userId, role } = req.user!;

    const existing = await prisma.helpRequest.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Help request not found" });
      return;
    }

    const isStaff = ["teacher", "admin", "teaching_assistant"].includes(role);
    const isOwnerOpenTicket = existing.createdById === userId && existing.status === "open";
    if (!isStaff && !isOwnerOpenTicket) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    await prisma.helpRequest.delete({ where: { id } });
    broadcastHelpRequestChange(id, "deleted");
    res.json({ message: "Help request deleted" });
  } catch (err: any) {
    console.error("DELETE /api/help-requests/:id error:", err?.message || err);
    res.status(500).json({ error: "Failed to delete help request", detail: err?.message || String(err) });
  }
});

// ── POST /api/help-requests/:id/replies ──
router.post("/:id/replies", authenticate, async (req: Request, res: Response) => {
  try {
    const requestId = param(req, "id");
    const { userId } = req.user!;
    const { content } = req.body;

    if (!content?.trim()) {
      res.status(400).json({ error: "Nội dung không được để trống" });
      return;
    }

    const existing = await prisma.helpRequest.findUnique({ where: { id: requestId } });
    if (!existing || existing.status === "closed") {
      res.status(400).json({ error: "Yêu cầu không tồn tại hoặc đã đóng" });
      return;
    }

    const reply = await prisma.helpReply.create({
      data: {
        requestId,
        authorId: userId,
        content: content.trim(),
      },
      include: {
        author: { select: { id: true, fullName: true, nickname: true, avatarUrl: true, role: true } },
      },
    });

    await prisma.helpRequest.update({
      where: { id: requestId },
      data: { replyCount: { increment: 1 } },
    });

    broadcastHelpRequestChange(requestId, "reply_created");
    res.status(201).json({ ...reply, author: presentUserForViewer(reply.author, req.user!.role) });
  } catch (err: any) {
    console.error("POST /api/help-requests/:id/replies error:", err?.message || err);
    res.status(500).json({ error: "Failed to create reply", detail: err?.message || String(err) });
  }
});

// ── PATCH /api/help-requests/:id/replies/:replyId ──
router.patch("/:id/replies/:replyId", authenticate, async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const replyId = param(req, "replyId");
    const { userId, role } = req.user!;
    const { isSolution, content } = req.body;

    const request = await prisma.helpRequest.findUnique({ where: { id } });
    if (!request) {
      res.status(404).json({ error: "Help request not found" });
      return;
    }

    // Only author of the request or teacher/admin can mark as solution
    if (isSolution !== undefined && request.createdById !== userId && !["teacher", "admin", "teaching_assistant"].includes(role)) {
      res.status(403).json({ error: "Chỉ người tạo yêu cầu mới có thể đánh dấu câu trả lời là giải pháp" });
      return;
    }

    // Clear other solutions if marking this as solution
    if (isSolution === true) {
      await prisma.helpReply.updateMany({
        where: { requestId: id, isSolution: true },
        data: { isSolution: false },
      });
    }

    const data: any = {};
    if (isSolution !== undefined) data.isSolution = isSolution;
    if (content !== undefined) data.content = content;

    const reply = await prisma.helpReply.update({
      where: { id: replyId },
      data,
      include: {
        author: { select: { id: true, fullName: true, nickname: true, avatarUrl: true, role: true } },
      },
    });

    res.json({ ...reply, author: presentUserForViewer(reply.author, req.user!.role) });
    broadcastHelpRequestChange(id, "reply_updated");

    // Gamification: reward the helper whose reply is marked as the solution
    if (isSolution === true) {
      import("../utils/tokens")
        .then(({ awardHelpSolutionTokens }) => awardHelpSolutionTokens(reply.authorId, replyId))
        .catch(() => {});
    }
  } catch (err: any) {
    console.error("PATCH /api/help-requests/:id/replies/:replyId error:", err?.message || err);
    res.status(500).json({ error: "Failed to update reply", detail: err?.message || String(err) });
  }
});

export default router;
