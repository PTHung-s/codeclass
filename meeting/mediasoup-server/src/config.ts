/**
 * mediasoup-server — cấu hình tập trung, đọc từ biến môi trường (.env)
 */
import dotenv from 'dotenv';
import os from 'os';
import type { WorkerLogTag, RtpCodecCapability } from 'mediasoup/types';
dotenv.config();

const listenIp = process.env.LISTEN_IP || '0.0.0.0';

const cpuCount = os.cpus()?.length || 1;

export const config = {
  /** Cổng HTTP (REST API + Socket.IO signaling) */
  http: {
    listenIp,
    listenPort: Number(process.env.PORT || 4443),
  },

  /**
   * mediasoup worker.
   * Mỗi worker = 1 tiến trình C++ ghim 1 core CPU.
   * numWorkers mặc định = min(4, số core).
   */
  worker: {
    numWorkers: Number(process.env.MEDIASOUP_WORKERS || Math.min(4, cpuCount)),
    rtcMinPort: Number(process.env.RTC_MIN_PORT || 40000),
    rtcMaxPort: Number(process.env.RTC_MAX_PORT || 40100),
    logLevel: 'warn' as const,
    logTags: [
      'info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp',
    ] as WorkerLogTag[],
  },

  /** Router = "phòng" về mặt media. Codec được router hỗ trợ. */
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters: {
          'profile-id': 2,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/h264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
        },
      },
    ] as RtpCodecCapability[],
  },

  /**
   * WebRTC transport.
   * - listenIp: IP mà server bind socket (0.0.0.0 = mọi card mạng).
   * - announcedIp: IP PUBLIC mà client sẽ kết nối tới (quan trọng nhất khi
   *   deploy lên cloud!). Để trống khi chạy local.
   */
  webRtcTransport: {
    listenIps: [
      {
        ip: listenIp,
        announcedIp: process.env.ANNOUNCED_IP || undefined,
      },
    ],
    initialAvailableOutgoingBitrate: 1_000_000,
  },
};

export type Config = typeof config;
