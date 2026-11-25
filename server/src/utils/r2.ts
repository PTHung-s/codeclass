/**
 * R2 / S3-compatible upload — zero-dependency, via Node's global fetch + AWS Signature V4.
 *
 * Chosen deliberately: the Dockerfile runs `npm ci`, so adding a new npm package would
 * require regenerating package-lock.json (no local node here). Hand-rolling the S3
 * PUT keeps the deploy lockfile-stable.
 *
 * If the R2_* env vars are not set yet the functions fall back to writing the file to
 * the local `/uploads` dir (served statically) so the session-course feature works in
 * dev / before the user fills in the R2 credentials.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";

const hasR2 =
  !!process.env.R2_ACCOUNT_ID &&
  !!process.env.R2_ACCESS_KEY_ID &&
  !!process.env.R2_SECRET_ACCESS_KEY &&
  !!process.env.R2_BUCKET;

const CODECLASS_WEB_ORIGIN = process.env.CLIENT_URL || "https://codeclass.vnotemate.com";
let corsSetup: Promise<void> | null = null;

export function isR2Configured() {
  return hasR2;
}

function sha256Hex(data: string | crypto.BinaryLike | Uint8Array): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key: crypto.BinaryLike | Uint8Array, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

/** RFC3986 percent-encode per S3 SigV4 rules (encode reserved chars incl. ~). */
function uriEncode(input: string): string {
  return encodeURIComponent(input).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Encode a key: encode each path segment but keep "/". */
function encodeKey(key: string): string {
  return key.split("/").map(uriEncode).join("/");
}

function r2Settings() {
  if (!hasR2) throw new Error("R2 chưa được cấu hình.");
  const accountId = process.env.R2_ACCOUNT_ID!;
  const bucket = process.env.R2_BUCKET!;
  return {
    accountId,
    accessKey: process.env.R2_ACCESS_KEY_ID!,
    secretKey: process.env.R2_SECRET_ACCESS_KEY!,
    bucket,
    host: `${bucket}.${accountId}.r2.cloudflarestorage.com`,
    publicUrl: (process.env.R2_PUBLIC_URL || `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/$/, ""),
  };
}

function signingParts(secretKey: string, dateStamp: string) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, "auto");
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function amzNow() {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * Configure CORS once so browsers can PUT a video directly to R2. This avoids
 * Cloudflare's request-size ceiling as well as buffering multi-GB files on the app server.
 */
export async function ensureR2BrowserCors(): Promise<void> {
  if (!hasR2) return;
  if (corsSetup) return corsSetup;

  corsSetup = (async () => {
    const { accessKey, secretKey, host } = r2Settings();
    const { amzDate, dateStamp } = amzNow();
    const payload = `<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration><CORSRule><AllowedOrigin>${CODECLASS_WEB_ORIGIN}</AllowedOrigin><AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule></CORSConfiguration>`;
    const payloadHash = sha256Hex(payload);
    const headers: Record<string, string> = {
      host,
      "content-type": "application/xml",
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    const signedHeaders = Object.keys(headers).sort().join(";");
    const canonicalHeaders = Object.keys(headers).sort().map((header) => `${header}:${headers[header]}\n`).join("");
    const canonicalRequest = ["PUT", "/", "cors=", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${crypto.createHmac("sha256", signingParts(secretKey, dateStamp)).update(stringToSign).digest("hex")}`;

    const response = await fetch(`https://${host}/?cors`, { method: "PUT", headers, body: payload, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`Không thể cấu hình R2 CORS (${response.status}): ${detail}`);
    }
  })().catch((error) => {
    corsSetup = null;
    throw error;
  });

  return corsSetup;
}

/** Create a short-lived browser PUT URL. The browser sends only Content-Type and the file directly to R2. */
export function createR2PresignedPutUrl(key: string, contentType: string, expiresInSeconds = 1_800) {
  const { accessKey, secretKey, host, publicUrl } = r2Settings();
  const { amzDate, dateStamp } = amzNow();
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const params = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKey}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresInSeconds)],
    ["X-Amz-SignedHeaders", "content-type;host"],
  ].map(([name, value]) => [uriEncode(name), uriEncode(value)] as const).sort(([a], [b]) => a.localeCompare(b));
  const canonicalQuery = params.map(([name, value]) => `${name}=${value}`).join("&");
  const canonicalUri = `/${encodeKey(key)}`;
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const canonicalRequest = ["PUT", canonicalUri, canonicalQuery, canonicalHeaders, "content-type;host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = crypto.createHmac("sha256", signingParts(secretKey, dateStamp)).update(stringToSign).digest("hex");
  return {
    uploadUrl: `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    publicUrl: `${publicUrl}/${encodeKey(key)}`,
  };
}

/** Recover an object key for legacy rows that stored only the public URL. */
export function storageKeyFromUrl(storageUrl: string): string | null {
  if (storageUrl.startsWith("/uploads/")) return storageUrl.slice("/uploads/".length) || null;

  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) return null;
  try {
    const base = new URL(publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`);
    const objectUrl = new URL(storageUrl);
    if (base.origin !== objectUrl.origin || !objectUrl.pathname.startsWith(base.pathname)) return null;
    const encodedKey = objectUrl.pathname.slice(base.pathname.length).replace(/^\/+/, "");
    return encodedKey ? encodedKey.split("/").map(decodeURIComponent).join("/") : null;
  } catch {
    return null;
  }
}

/**
 * PUT an object to the R2 bucket using AWS SigV4 (region "auto", service "s3").
 * Streams from `filePath`; uses UNSIGNED-PAYLOAD so large videos aren't buffered in memory.
 * Returns the public URL.
 */
export async function uploadToR2(
  filePath: string,
  key: string,
  contentType: string,
  metadata: { originalName?: string; size?: number } = {}
): Promise<string> {
  if (!hasR2) {
    return saveToDisk(filePath, key, contentType);
  }

  const accountId = process.env.R2_ACCOUNT_ID!;
  const accessKey = process.env.R2_ACCESS_KEY_ID!;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY!;
  const bucket = process.env.R2_BUCKET!;
  const publicUrl = process.env.R2_PUBLIC_URL || `https://${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";

  const host = `${bucket}.${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeKey(key)}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = "UNSIGNED-PAYLOAD";

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    "content-type": contentType,
  };
  if (metadata.originalName) headers["x-amz-meta-originalname"] = Buffer.from(metadata.originalName, "utf8").toString("base64");
  if (metadata.size) headers["x-amz-meta-size"] = String(metadata.size);

  const signedHeaders = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort()
    .join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((h) => `${h.toLowerCase()}:${headers[h].trim()}\n`)
    .join("");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "", // query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const size = metadata.size ?? fs.statSync(filePath).size;
  const body = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;

  const res = await fetch(`https://${host}${canonicalUri}`, {
    method: "PUT",
    headers: { ...headers, "content-length": String(size) },
    body,
    duplex: "half", // required by Node's undici fetch when body is a stream
    signal: AbortSignal.timeout(600_000), // 10 min for large files
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 upload failed (${res.status}): ${text.slice(0, 300)}`);
  }

  return `${publicUrl.replace(/\/$/, "")}/${encodeKey(key)}`;
}

/** Delete an object after its optimized replacement has been safely stored. */
export async function deleteFromR2(key: string): Promise<void> {
  if (!hasR2) {
    const uploadsDir = path.join(__dirname, "../../uploads");
    const safeName = key.replace(/[^a-zA-Z0-9._-]/g, "_");
    fs.unlink(path.join(uploadsDir, safeName), () => {});
    return;
  }

  const accountId = process.env.R2_ACCOUNT_ID!;
  const accessKey = process.env.R2_ACCESS_KEY_ID!;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY!;
  const bucket = process.env.R2_BUCKET!;
  const host = `${bucket}.${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeKey(key)}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = { host, "x-amz-content-sha256": "UNSIGNED-PAYLOAD", "x-amz-date": amzDate };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map((header) => `${header}:${headers[header]}\n`).join("");
  const canonicalRequest = ["DELETE", canonicalUri, "", canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, "auto");
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex")}`;
  const response = await fetch(`https://${host}${canonicalUri}`, { method: "DELETE", headers, signal: AbortSignal.timeout(120_000) });
  if (!response.ok && response.status !== 404) throw new Error(`R2 delete failed (${response.status})`);
}

/** Fallback when R2 is not configured: save under /uploads and serve statically. */
function saveToDisk(filePath: string, key: string, contentType: string): string {
  const uploadsDir = path.join(__dirname, "../../uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  // Preserve the object path in the local name. Keeping only `video.mp4`
  // would make every session video overwrite the previous one in dev.
  const safeName = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dest = path.join(uploadsDir, safeName);
  fs.copyFileSync(filePath, dest);
  return `/uploads/${safeName}`;
}
