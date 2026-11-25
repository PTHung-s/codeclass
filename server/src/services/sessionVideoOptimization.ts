import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import ffmpegPath from "ffmpeg-static";
import prisma from "../utils/prisma";
import { deleteFromR2, uploadToR2 } from "../utils/r2";

const tempDir = path.join(__dirname, "../../uploads/session-tmp");
const uploadsDir = path.join(__dirname, "../../uploads");
const maxBitrateKbps = 6000;
// Re-encoding a tiny or already-efficient video can increase its size. Keep
// the source unless the replacement saves at least 5% after MP4 overhead.
const minimumSavingsRatio = 0.05;
let optimizationQueue: Promise<void> = Promise.resolve();

export type SessionVideoOptimizationJob = {
  lessonId: string;
  token: string;
  sourceKey: string;
  sourceUrl: string;
  originalName: string;
  originalSize: number;
  sourcePath?: string;
};

/** Notify staff without coupling the CPU-heavy worker to the transport at boot. */
export function notifySessionVideoCompression(lessonId: string, status: "processing" | "ready" | "skipped" | "failed") {
  import("./gameWebSocket")
    .then(({ broadcastToStaff }) => broadcastToStaff({ type: "session_video_compression", payload: { lessonId, status } }))
    .catch(() => {});
}

function safelyUnlink(filePath?: string) {
  if (filePath) fs.unlink(filePath, () => {});
}

function localUploadPath(sourceUrl: string): string | null {
  if (!sourceUrl.startsWith("/uploads/")) return null;
  const fileName = sourceUrl.slice("/uploads/".length);
  const resolved = path.resolve(uploadsDir, fileName);
  return resolved.startsWith(path.resolve(uploadsDir) + path.sep) ? resolved : null;
}

async function materializeSource(job: SessionVideoOptimizationJob): Promise<{ filePath: string; isTemporary: boolean }> {
  if (job.sourcePath && fs.existsSync(job.sourcePath)) return { filePath: job.sourcePath, isTemporary: false };
  const localPath = localUploadPath(job.sourceUrl);
  if (localPath && fs.existsSync(localPath)) return { filePath: localPath, isTemporary: false };

  fs.mkdirSync(tempDir, { recursive: true });
  const extension = path.extname(job.originalName) || ".mp4";
  const target = path.join(tempDir, `retry-${job.token}${extension}`);
  const response = await fetch(job.sourceUrl, { signal: AbortSignal.timeout(600_000) });
  if (!response.ok || !response.body) throw new Error(`Không tải được video gốc (${response.status}).`);
  await pipeline(Readable.fromWeb(response.body as import("stream/web").ReadableStream), fs.createWriteStream(target));
  return { filePath: target, isTemporary: true };
}

function encode1080p(inputPath: string, outputPath: string): Promise<void> {
  const executable = ffmpegPath;
  if (!executable) return Promise.reject(new Error("Không tìm thấy FFmpeg trong server."));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [
      "-y", "-i", inputPath,
      "-map", "0:v:0", "-map", "0:a?",
      "-vf", "scale=-2:1080:force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-c:v", "libx264", "-preset", "medium", "-crf", "22",
      "-maxrate", `${maxBitrateKbps}k`, "-bufsize", `${maxBitrateKbps * 2}k`,
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart", outputPath,
    ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.once("error", reject);
    child.once("close", (code: number | null) => code === 0 ? resolve() : reject(new Error(`FFmpeg dừng với mã ${code}: ${stderr.slice(-700)}`)));
  });
}

/** Runs out-of-band after the source upload succeeds, keeping playback available throughout. */
export async function optimizeSessionVideo(job: SessionVideoOptimizationJob): Promise<void> {
  let inputPath: string | undefined;
  let downloadedInput = false;
  let outputPath: string | undefined;
  let optimizedKey: string | undefined;
  try {
    const source = await materializeSource(job);
    inputPath = source.filePath;
    downloadedInput = source.isTemporary;
    outputPath = path.join(tempDir, `optimized-${job.token}.mp4`);
    await encode1080p(inputPath, outputPath);

    const optimizedSize = fs.statSync(outputPath).size;
    const savingsRatio = 1 - optimizedSize / job.originalSize;
    if (savingsRatio < minimumSavingsRatio) {
      const updated = await prisma.sessionLesson.updateMany({
        where: { id: job.lessonId, videoProcessingToken: job.token },
        data: {
          // The uploaded source remains the active playback object. Keeping the
          // source key also permits a future retry with different settings.
          videoUrl: job.sourceUrl,
          videoStorageKey: job.sourceKey,
          videoSize: job.originalSize,
          videoOriginalSize: job.originalSize,
          // Keep the measured trial size for an honest staff-facing message,
          // even though the trial file itself is discarded.
          videoOptimizedSize: optimizedSize,
          videoCompressionStatus: "skipped",
          videoCompressionError: null,
          videoSourceUrl: job.sourceUrl,
          videoSourceKey: job.sourceKey,
          videoProcessingToken: null,
        },
      });
      if (updated.count) notifySessionVideoCompression(job.lessonId, "skipped");
      return;
    }

    optimizedKey = `session-course/${job.lessonId}/video-1080p-${job.token}.mp4`;
    const optimizedUrl = await uploadToR2(outputPath, optimizedKey, "video/mp4", {
      originalName: job.originalName,
      size: optimizedSize,
    });

    const updated = await prisma.sessionLesson.updateMany({
      where: { id: job.lessonId, videoProcessingToken: job.token },
      data: {
        videoUrl: optimizedUrl,
        videoStorageKey: optimizedKey,
        videoSize: optimizedSize,
        videoOriginalSize: job.originalSize,
        videoOptimizedSize: optimizedSize,
        videoCompressionStatus: "ready",
        videoCompressionError: null,
        videoSourceUrl: null,
        videoSourceKey: null,
        videoProcessingToken: null,
      },
    });

    if (updated.count) {
      notifySessionVideoCompression(job.lessonId, "ready");
      await deleteFromR2(job.sourceKey);
    }
    else if (optimizedKey) await deleteFromR2(optimizedKey);
  } catch (error: any) {
    const message = error instanceof Error ? error.message.slice(0, 800) : "Không thể nén video.";
    console.error(`session video optimization failed for ${job.lessonId}:`, error);
    const updated = await prisma.sessionLesson.updateMany({
      where: { id: job.lessonId, videoProcessingToken: job.token },
      data: { videoCompressionStatus: "failed", videoCompressionError: message, videoProcessingToken: null },
    }).catch((dbError) => console.error("Could not record video optimization failure:", dbError));
    if (updated?.count) notifySessionVideoCompression(job.lessonId, "failed");
  } finally {
    if (downloadedInput) safelyUnlink(inputPath);
    safelyUnlink(outputPath);
    // The upload request's temporary file is owned by this job. Local R2 fallback
    // stores an independent copy under /uploads, so this never removes the source.
    if (job.sourcePath) safelyUnlink(job.sourcePath);
  }
}

/** Serialize CPU-heavy encodes so a burst of teacher uploads cannot starve the API. */
export function queueSessionVideoOptimization(job: SessionVideoOptimizationJob): Promise<void> {
  optimizationQueue = optimizationQueue.catch(() => {}).then(() => optimizeSessionVideo(job));
  return optimizationQueue;
}

export function createVideoProcessingToken() {
  return crypto.randomUUID();
}

/** A deployment or server restart must not leave a lesson stuck at "processing" forever. */
export async function resumePendingSessionVideoOptimizations(): Promise<void> {
  const lessons = await prisma.sessionLesson.findMany({
    where: { videoCompressionStatus: "processing" },
    select: {
      id: true,
      videoProcessingToken: true,
      videoSourceKey: true,
      videoSourceUrl: true,
      videoOriginalName: true,
      videoOriginalSize: true,
    },
  });

  for (const lesson of lessons) {
    if (!lesson.videoProcessingToken || !lesson.videoSourceKey || !lesson.videoSourceUrl || !lesson.videoOriginalName || !lesson.videoOriginalSize) {
      await prisma.sessionLesson.update({
        where: { id: lesson.id },
        data: { videoCompressionStatus: "failed", videoCompressionError: "Thiếu dữ liệu video gốc sau khi khởi động lại server.", videoProcessingToken: null },
      });
      notifySessionVideoCompression(lesson.id, "failed");
      continue;
    }
    const originalName = Buffer.from(lesson.videoOriginalName, "base64").toString("utf8");
    // One at a time: encoding several multi-GB recordings concurrently would
    // make the API and students' playback compete for CPU and disk I/O.
    await queueSessionVideoOptimization({
      lessonId: lesson.id,
      token: lesson.videoProcessingToken,
      sourceKey: lesson.videoSourceKey,
      sourceUrl: lesson.videoSourceUrl,
      originalName,
      originalSize: lesson.videoOriginalSize,
    });
  }
}
