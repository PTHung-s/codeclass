import jwt from "jsonwebtoken";

const TOKEN_TTL_SECONDS = 15 * 60;

function tokenSecret() {
  const secret = process.env.CENTRIFUGO_TOKEN_SECRET;
  if (!secret) throw new Error("CENTRIFUGO_TOKEN_SECRET chưa được cấu hình");
  return secret;
}

export function centrifugoEnabled() {
  return Boolean(process.env.CENTRIFUGO_API_URL && process.env.CENTRIFUGO_API_KEY && process.env.CENTRIFUGO_TOKEN_SECRET);
}

export function createCentrifugoToken(
  user: { id: string; role: string; fullName?: string | null; avatarUrl?: string | null },
  channels: string[] = [],
) {
  return jwt.sign({
    sub: user.id,
    info: { role: user.role, fullName: user.fullName ?? null, avatarUrl: user.avatarUrl ?? null },
    channels,
    aud: "codeclass-realtime",
    iss: "codeclass",
  }, tokenSecret(), { expiresIn: TOKEN_TTL_SECONDS });
}

/** A per-channel token authorizes one private room only. */
export function createCentrifugoSubscriptionToken(userId: string, channel: string) {
  return jwt.sign({
    sub: userId,
    channel,
    aud: "codeclass-realtime",
    iss: "codeclass",
  }, tokenSecret(), { expiresIn: TOKEN_TTL_SECONDS });
}

/** Publish an app event. Failing realtime must never fail the originating API action. */
export async function publishCentrifugo(channel: string, event: unknown): Promise<void> {
  if (!centrifugoEnabled()) return;
  const endpoint = `${process.env.CENTRIFUGO_API_URL!.replace(/\/$/, "")}/publish`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "X-API-Key": process.env.CENTRIFUGO_API_KEY! },
      body: JSON.stringify({ channel, data: event }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.warn("[centrifugo] publish failed:", error instanceof Error ? error.message : error);
  }
}

export const realtimeChannel = {
  global: "global:events",
  staff: "staff:events",
  user: (userId: string) => `user:${userId}`,
  arena: (arenaId: string) => `arena:${arenaId}`,
  arenaStaff: (arenaId: string) => `arena_staff:${arenaId}`,
  duel: (matchId: string) => `duel:${matchId}`,
  duelStaff: (matchId: string) => `duel_staff:${matchId}`,
  examStaff: (examId: string) => `exam_staff:${examId}`,
};
