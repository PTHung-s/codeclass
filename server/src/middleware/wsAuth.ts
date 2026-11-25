import { IncomingMessage } from "http";
import { verifyToken, JwtPayload } from "../utils/jwt";

/** Authenticate WebSocket upgrade request by extracting JWT from query param or header. */
export function wsAuthenticate(request: IncomingMessage): JwtPayload | null {
  const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
  const token = url.searchParams.get("token") || extractBearer(request.headers["authorization"] || "");
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

function extractBearer(header: string): string {
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}
