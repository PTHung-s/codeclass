/**
 * SFU Service — kết nối app tới mediasoup-server (self-hosted).
 *
 * Chỉ chạy khi VITE_MEDIA_MODE=sfu. Media (cam/mic/screenshare) đi qua SFU.
 *
 * Định danh: SFU socket.id KHÁC signaling socket.id. Khi join ta gửi
 * `clientPeerId` (= signaling socket.id) lên server; server gắn nó vào appData
 * của mọi producer và trả về trong newProducer/existingProducers/consume.
 * Nhờ vậy client map stream về ĐÚNG người trong danh sách peers (keyed by signaling id).
 *
 * Producer có `type`: 'camera' | 'screen' → screen share được xử lý riêng
 * (spotlight + stop chỉ đóng screen producer, không đụng cam/mic).
 */
import { Device } from 'mediasoup-client';
import type { Transport, Consumer, Producer } from 'mediasoup-client/types';
import { io, type Socket } from 'socket.io-client';
import { useMeetingStore } from '../store/useMeetingStore';
import { socket as mainSocket } from './socket';

const SFU_URL = import.meta.env.VITE_SFU_URL || 'http://localhost:4443';

/**
 * Hỗ trợ SFU_URL dạng base có path (vd https://codeclass.vnotemate.com/sfu)
 * để đi qua reverse proxy same-origin (tránh mixed content https→ws).
 * socket.io bỏ qua path trong URL → phải tách origin + `path` riêng.
 */
function resolveSfuEndpoint(base: string): { origin: string; path: string } {
  try {
    const u = new URL(base);
    const p = u.pathname.replace(/\/$/, '');
    if (p && p !== '') return { origin: u.origin, path: `${p}/socket.io` };
  } catch { /* không phải URL hợp lệ → dùng nguyên */ }
  return { origin: base, path: '/socket.io' };
}

export const isSFUMode = () => import.meta.env.VITE_MEDIA_MODE !== 'off';

type ProducerType = 'camera' | 'screen';

/**
 * Mức chất lượng khi chia sẻ màn hình. Ép ở phía NGƯỜI GỬI (xem setScreenQuality).
 * Giám sát thi cử không cần 1080p cho từng ô nhỏ → hạ được rất nhiều băng thông.
 */
export type ScreenQualityPreset = 'low' | 'medium' | 'high' | 'max';
export const SCREEN_QUALITY: Record<ScreenQualityPreset, {
  label: string; width: number; height: number; frameRate: number; maxBitrate: number;
}> = {
  low:    { label: 'Thấp',   width: 640,  height: 360,  frameRate: 5,  maxBitrate: 150_000 },
  medium: { label: 'Vừa',    width: 960,  height: 540,  frameRate: 10, maxBitrate: 400_000 },
  high:   { label: 'Cao',    width: 1280, height: 720,  frameRate: 15, maxBitrate: 900_000 },
  max:    { label: 'Tối đa', width: 1920, height: 1080, frameRate: 30, maxBitrate: 2_500_000 },
};

interface ExistingProducer {
  producerId: string;
  peerId?: string;
  clientPeerId?: string;
  peerName?: string;
  kind: string;
  type?: ProducerType;
}

class SFUService {
  private socket: Socket | null = null;
  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;

  private myClientPeerId: string | null = null;
  private roomId: string | null = null;
  private joined = false;

  // Local producers
  private camAudio: Producer | null = null;
  private camVideo: Producer | null = null;
  private screen: Producer | null = null;
  private screenQuality: ScreenQualityPreset = 'medium';
  private localCameraStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private startingScreen = false;
  private pickingScreen = false;
  private screenPickerEndedAt = 0;
  private screenSharedForExam = false;

  // producerId -> consumer mapping (để xử lý producerClosed)
  private producerToConsumer = new Map<string, {
    consumerId: string; clientPeerId: string; kind: string; type?: ProducerType;
  }>();
  // Lưu các screen producer bị tạm hoãn consume do đang bật giám sát thi (để bật lại ngay khi Host ghim)
  private deferredScreenProducers = new Map<string, { producerId: string; clientPeerId: string }>();
  // audio element + analyser theo peer
  private audioByPeer = new Map<string, HTMLAudioElement>();
  // Danh sách audio-producer ĐƯỢC NGHE do SFU gửi (routingChanged). null = chưa nhận.
  private audioRouting: { producerId: string; clientPeerId?: string }[] | null = null;

  // Active speaker detection
  private audioCtx: AudioContext | null = null;
  private analysers = new Map<string, { analyser: AnalyserNode; data: Uint8Array }>();
  private speakingTimer: ReturnType<typeof setInterval> | null = null;

  // Serialize reconcileAudio() calls & keep single bound handler for mainSocket
  private reconcileInFlight: Promise<void> | null = null;
  private reconcileQueued = false;
  private onAudioAllowed = (payload: {
    mode?: 'all' | 'selected';
    allowed?: string[];
    hostFocus?: boolean;
    groups?: any[];
  }) => {
    useMeetingStore.getState().setAudioState({
      mode: payload?.mode,
      allowed: payload?.allowed || [],
      hostFocus: payload?.hostFocus,
      groups: Array.isArray(payload?.groups) ? payload.groups : undefined,
    });
    void this.reconcileAudio();
  };

  /** Tắt mic cục bộ khi bị Host tắt mic từ xa. Trả về true nếu trước đó đang bật. */
  forceMuteLocalAudio(): boolean {
    const st = useMeetingStore.getState().localStream;
    const tr = st?.getAudioTracks()[0];
    const wasEnabled = useMeetingStore.getState().isMicEnabled;
    if (tr) tr.enabled = false;
    try { this.camAudio?.pause(); } catch { /* noop */ }
    return wasEnabled;
  }

  get socketId(): string | null { return this.socket?.id ?? null; }
  get currentLocalStream(): MediaStream | null { return this.localCameraStream; }
  get currentRoomId(): string | null { return this.roomId; }
  get isJoined(): boolean { return this.joined && !!this.device; }
  get isSharingScreen(): boolean { return !!this.screen || !!this.localScreenStream; }
  /** Trả true khi hộp thoại getDisplayMedia() đang mở hoặc vừa đóng < 1.8s — tránh báo vi phạm oan focus-lost */
  get isPickingScreen(): boolean {
    return this.pickingScreen || Date.now() - this.screenPickerEndedAt < 1800;
  }
  get isScreenSharedForExam(): boolean {
    return this.screenSharedForExam && !!this.localScreenStream;
  }
  get currentScreenSurface(): string {
    const tr = this.localScreenStream?.getVideoTracks()[0];
    if (!tr || typeof tr.getSettings !== 'function') return 'unknown';
    const surface = (tr.getSettings() as MediaTrackSettings & { displaySurface?: string }).displaySurface;
    return surface || 'unknown';
  }
  /** Producer cục bộ (cam audio/video + screen) — để điều khiển pause/replace nếu cần. */
  get localProducers() { return { audio: this.camAudio, video: this.camVideo, screen: this.screen }; }

  /** Kết nối SFU + join room + load device. */
  async connect(roomId: string, clientPeerId: string | null, peerName: string, token?: string | null): Promise<void> {
    if (this.joined) return;
    this.roomId = roomId;
    this.myClientPeerId = clientPeerId;
    // clientPeerId chính là signaling socket.id → đồng bộ vào store để
    // canHear() biết "tôi là ai" khi áp luật bất đối xứng.
    if (clientPeerId) useMeetingStore.getState().setMySocketId(clientPeerId);

    const { origin, path } = resolveSfuEndpoint(SFU_URL);
    this.socket = io(origin, { transports: ['websocket'], path, reconnectionAttempts: 5 });

    try {
      await new Promise<void>((resolve, reject) => {
        if (!this.socket) return reject(new Error('socket null'));
        this.socket.on('connect', () => resolve());
        this.socket.on('connect_error', (e) => reject(new Error(`SFU connect: ${e.message}`)));
        setTimeout(() => reject(new Error('SFU connect timeout')), 15000);
      });

      this.registerServerEvents();
      this.socket.io.on('reconnect', () => {
        // SFU socket tự nối lại → peer cũ đã bị xóa trên mediasoup-server, kích hoạt tạo lại transport/producer sạch
        const st = useMeetingStore.getState();
        try {
          (window as any).__meetKeepStream = st.localStream || null;
          if (this.localScreenStream?.getVideoTracks().some((t) => t.readyState === 'live')) {
            (window as any).__meetKeepScreenStream = this.localScreenStream;
            (window as any).__meetKeepScreenForExam = this.screenSharedForExam;
            (window as any).__meetKeepScreenQuality = this.screenQuality;
          }
        } catch { /* noop */ }
        st.bumpSfuEpoch();
      });

      const join = await this.emitWithAck<{
        ok?: boolean; error?: string;
        rtpCapabilities?: unknown;
        existingProducers?: ExistingProducer[];
      }>('mediasoup:join', { roomId, peerName, clientPeerId, token: token || undefined });

      if (join.error || !join.rtpCapabilities) {
        throw new Error(`SFU join: ${join.error || 'no rtpCapabilities'}`);
      }

      this.device = new Device();
      await this.device.load({ routerRtpCapabilities: join.rtpCapabilities as never });
      this.joined = true;
      this.ensureSpeakingLoop();

      // Consume các stream VIDEO đã có trong phòng. ÂM THANH do routingChanged điều khiển.
      for (const p of join.existingProducers || []) {
        if (p.kind === 'audio') continue;
        const target = p.clientPeerId || p.peerId || p.producerId;
        if (p.type === 'screen' && !this.canViewScreen(target)) {
          this.deferredScreenProducers.set(p.producerId, { producerId: p.producerId, clientPeerId: target });
          continue;
        }
        await this.consume(p.producerId, target, p.type);
      }
      // Áp dụng định tuyến âm thanh hiện hành (đã có thể đã nhận routingChanged khi đang load)
      await this.reconcileAudio();
    } catch (err) {
      this.disconnect();
      throw err;
    }
  }

  /** Publish cam/mic. Mỗi track gắn appData.type='camera'. */
  async publishCamera(stream: MediaStream): Promise<void> {
    if (!this.socket || !this.device || !this.joined) throw new Error('SFU not joined');
    this.localCameraStream = stream;
    const peerName = useMeetingStore.getState().userName || '';

    const t = await this.getSendTransport();
    for (const track of stream.getTracks()) {
      const producer = await t.produce({
        track,
        appData: { peerName, type: 'camera' },
        encodings: track.kind === 'video'
          ? [
              { rid: 'r0', maxBitrate: 150_000, scalabilityMode: 'L1T3' },
              { rid: 'r1', maxBitrate: 500_000, scalabilityMode: 'L1T3' },
              { rid: 'r2', maxBitrate: 1_200_000, scalabilityMode: 'L1T3' },
            ]
          : undefined,
        codecOptions: track.kind === 'audio' ? { opusStereo: true, opusDtx: true } : undefined,
      });
      if (track.kind === 'audio') this.camAudio = producer;
      else this.camVideo = producer;
    }

    // đo mức âm thanh mic của chính mình để highlight "đang nói"
    if (stream.getAudioTracks().length) {
      this.registerAnalyser('self', new MediaStream(stream.getAudioTracks()));
    }
  }

  /**
   * Bật thêm thiết bị khi track/producer chưa có (vd: join với mic tắt rồi bật lại).
   * – Track đã có sẵn trong localStream → produce producer từ track đó (không xin lại).
   * – Chưa có track → getUserMedia mới, merge vào stream, setLocalStream, rồi produce.
   * Gán producer vào camAudio/camVideo. Trả về stream đang dùng.
   */
  async addDeviceTrack(kind: 'audio' | 'video'): Promise<MediaStream | null> {
    const st = useMeetingStore.getState();
    let merged = st.localStream;
    let tr = merged?.getTracks().find((t) => t.kind === kind && t.readyState === 'live');
    if (!tr) {
      const constraints: MediaStreamConstraints =
        kind === 'video'
          ? {
              video: st.selectedCamId
                ? { width: 1280, height: 720, frameRate: 24, deviceId: { ideal: st.selectedCamId } }
                : { width: 1280, height: 720, frameRate: 24 },
            }
          : {
              audio: st.selectedMicId
                ? { echoCancellation: true, noiseSuppression: true, deviceId: { ideal: st.selectedMicId } }
                : { echoCancellation: true, noiseSuppression: true },
            };
      const ns = await navigator.mediaDevices.getUserMedia(constraints);
      tr = ns.getTracks()[0];
      if (!tr) throw new Error('device not found');
      merged = new MediaStream(merged ? merged.getTracks() : []);
      merged.addTrack(tr);
      useMeetingStore.getState().setLocalStream(merged);
    }
    const peerName = useMeetingStore.getState().userName || '';
    const producer = await (await this.getSendTransport()).produce({
      track: tr,
      appData: { peerName, type: 'camera' },
      encodings: kind === 'video'
        ? [
            { rid: 'r0', maxBitrate: 150_000, scalabilityMode: 'L1T3' },
            { rid: 'r1', maxBitrate: 500_000, scalabilityMode: 'L1T3' },
            { rid: 'r2', maxBitrate: 1_200_000, scalabilityMode: 'L1T3' },
          ]
        : undefined,
      codecOptions: kind === 'audio' ? { opusStereo: true, opusDtx: true } : undefined,
    });
    if (kind === 'video') {
      this.camVideo = producer;
    } else {
      this.camAudio = producer;
      this.registerAnalyser('self', new MediaStream([tr]));
    }
    return merged;
  }

  /** Đổi mic hoặc camera ngay trong phòng họp mà không rớt kết nối SFU. */
  async switchDevice(kind: 'audio' | 'video', deviceId: string): Promise<void> {
    const store = useMeetingStore.getState();
    const isEnabled = kind === 'audio' ? store.isMicEnabled : store.isCameraEnabled;
    if (kind === 'audio') store.setSelectedMicId(deviceId);
    else store.setSelectedCamId(deviceId);

    const buildConstraints = (exact: boolean): MediaStreamConstraints =>
      kind === 'video'
        ? { video: { width: 1280, height: 720, frameRate: 24, deviceId: deviceId ? (exact ? { exact: deviceId } : { ideal: deviceId }) : undefined } }
        : { audio: { echoCancellation: true, noiseSuppression: true, deviceId: deviceId ? (exact ? { exact: deviceId } : { ideal: deviceId }) : undefined } };

    let ns: MediaStream;
    try {
      ns = await navigator.mediaDevices.getUserMedia(buildConstraints(true));
    } catch {
      ns = await navigator.mediaDevices.getUserMedia(buildConstraints(false));
    }
    const newTrack = ns.getTracks()[0];
    if (!newTrack) throw new Error('Không tìm thấy thiết bị đã chọn');
    newTrack.enabled = isEnabled;

    const prevStream = useMeetingStore.getState().localStream;
    const keptOtherTracks = (prevStream?.getTracks() || []).filter((t) => t.kind !== kind);
    const oldSameTracks = (prevStream?.getTracks() || []).filter((t) => t.kind === kind);

    const producer = kind === 'audio' ? this.camAudio : this.camVideo;
    if (producer) {
      const producerTrack = producer.track;
      await producer.replaceTrack({ track: newTrack.clone() });
      if (producerTrack && producerTrack !== newTrack) {
        try { producerTrack.stop(); } catch { /* noop */ }
      }
      if (!isEnabled) {
        try { producer.pause(); } catch { /* noop */ }
      }
    } else if (isEnabled && this.joined) {
      const peerName = store.userName || '';
      const created = await (await this.getSendTransport()).produce({
        track: newTrack,
        appData: { peerName, type: 'camera' },
        encodings: kind === 'video'
          ? [
              { rid: 'r0', maxBitrate: 150_000, scalabilityMode: 'L1T3' },
              { rid: 'r1', maxBitrate: 500_000, scalabilityMode: 'L1T3' },
              { rid: 'r2', maxBitrate: 1_200_000, scalabilityMode: 'L1T3' },
            ]
          : undefined,
        codecOptions: kind === 'audio' ? { opusStereo: true, opusDtx: true } : undefined,
      });
      if (kind === 'video') this.camVideo = created;
      else this.camAudio = created;
    }

    oldSameTracks.forEach((t) => {
      try { t.stop(); } catch { /* noop */ }
    });
    const nextStream = new MediaStream([...keptOtherTracks, newTrack]);
    this.localCameraStream = nextStream;
    useMeetingStore.getState().setLocalStream(nextStream);
    if (kind === 'audio') {
      this.registerAnalyser('self', new MediaStream([newTrack]));
    }
  }

  /**
   * Ép chất lượng luồng SCREEN đang chia sẻ — chạy trên MÁY NGƯỜI CHIA SẺ.
   *
   * Vì sao phải ở phía người gửi: đã tra spec W3C — `RTCRtpReceiver` KHÔNG có
   * `setParameters` (chỉ `RTCRtpSender` có). Phía SFU cũng không có API chọn tầng.
   * Nên cách duy nhất giảm băng thông THẬT là hạ ngay lúc encode:
   *   - sender.setParameters({encodings:[{maxBitrate}]})  → chuẩn W3C, có trong TS lib
   *   - track.applyConstraints({width,height,frameRate})  → chuẩn, mọi browser hỗ trợ
   *
   * @param preset mức chất lượng mong muốn
   */
  async setScreenQuality(preset: ScreenQualityPreset): Promise<void> {
    const q = SCREEN_QUALITY[preset];
    if (!q) return;

    // 1) Hạ độ phân giải + khung hình ngay trên track nguồn (giảm tải encode)
    const track = this.localScreenStream?.getVideoTracks()[0];
    if (track) {
      try {
        await track.applyConstraints({
          width: { ideal: q.width, max: q.width },
          height: { ideal: q.height, max: q.height },
          frameRate: { ideal: q.frameRate, max: q.frameRate },
        });
      } catch (e) {
        console.warn('[SFU] applyConstraints screen fail:', e);
      }
    }

    // 2) Ép trần bitrate trên sender (đây mới là thứ SFU tôn trọng)
    const sender = this.screen?.rtpSender as RTCRtpSender | undefined;
    if (sender && typeof sender.getParameters === 'function' && typeof sender.setParameters === 'function') {
      try {
        const params = sender.getParameters();
        if (params.encodings && params.encodings.length) {
          params.encodings[0].maxBitrate = q.maxBitrate;
          params.encodings[0].scaleResolutionDownBy = 1;
          await sender.setParameters(params);
        }
      } catch (e) {
        console.warn('[SFU] setParameters screen fail:', e);
      }
    }
    this.screenQuality = preset;
  }

  /** Mức chất lượng screen đang áp (để UI hiện nhãn) */
  get currentScreenQuality(): ScreenQualityPreset { return this.screenQuality; }

  /**
   * Bắt đầu chia sẻ màn hình — producer riêng, type='screen'.
   * Chống bấm đúp khi picker đang mở, dọn track nếu produce() lỗi và báo lỗi rõ nếu SFU chưa sẵn sàng.
   */
  async startScreenShare(
    quality?: ScreenQualityPreset,
    opts?: { forExam?: boolean },
  ): Promise<{ surface: string }> {
    if (this.screen || this.startingScreen) {
      return { surface: this.currentScreenSurface };
    }
    if (!this.device || !this.joined) {
      throw new Error('Máy chủ media (SFU) chưa kết nối — không thể chia sẻ màn hình lúc này.');
    }

    const st = useMeetingStore.getState();
    const effectiveQuality: ScreenQualityPreset =
      quality ||
      (opts?.forExam
        ? st.peers.length >= 15
          ? 'low'
          : 'medium'
        : st.isHost
          ? 'high'
          : 'medium');

    const q = SCREEN_QUALITY[effectiveQuality];
    this.startingScreen = true;
    this.pickingScreen = true;
    let screen: MediaStream | null = null;
    try {
      screen = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: q.frameRate, max: q.frameRate },
          width: { ideal: q.width, max: q.width },
          height: { ideal: q.height, max: q.height },
        },
        audio: false,
      });
    } finally {
      this.pickingScreen = false;
      this.screenPickerEndedAt = Date.now();
      this.startingScreen = false;
    }

    try {
      return await this.publishScreenStream(screen, effectiveQuality, !!opts?.forExam);
    } catch (err) {
      // Dọn track để trình duyệt không kẹt thanh "Đang chia sẻ màn hình" nếu produce() lỗi
      screen.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* noop */ }
      });
      if (this.localScreenStream === screen) this.localScreenStream = null;
      throw err;
    }
  }

  /** Publish lại 1 MediaStream màn hình đang còn sống (dùng khi socket reconnect mà không bắt chọn lại màn hình). */
  async publishScreenStream(
    screen: MediaStream,
    quality: ScreenQualityPreset = 'medium',
    forExam = false,
  ): Promise<{ surface: string }> {
    if (!this.device || !this.joined) {
      throw new Error('SFU chưa sẵn sàng để phát màn hình.');
    }
    const q = SCREEN_QUALITY[quality] || SCREEN_QUALITY.medium;
    const peerName = useMeetingStore.getState().userName || '';
    const track = screen.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') {
      throw new Error('Luồng màn hình không còn hoạt động.');
    }

    this.localScreenStream = screen;
    const t = await this.getSendTransport();
    this.screen = await t.produce({
      track,
      appData: { peerName, type: 'screen' },
      encodings: [{ maxBitrate: q.maxBitrate }],
    });
    this.screenSharedForExam = forExam;
    track.onended = () => this.stopScreenShare();

    const store = useMeetingStore.getState();
    store.setLocalScreenStream(screen);
    // Không chiếm spotlight nếu đang giám sát thi và là học sinh
    if (!store.examMonitoring || store.isHost) {
      store.setScreenSharePeerId('self');
    }
    this.screenQuality = quality;
    await this.setScreenQuality(quality).catch(() => null);
    return { surface: this.currentScreenSurface };
  }

  /** Dừng chia sẻ — CHỈ đóng screen producer, giữ nguyên cam/mic. */
  stopScreenShare(opts?: { keepTrack?: boolean }): void {
    if (this.screen) {
      const id = this.screen.id;
      this.emitWithAck('mediasoup:closeProducer', { producerId: id }).catch(() => null);
      try { this.screen.close(); } catch { /* noop */ }
      this.screen = null;
    }
    if (!opts?.keepTrack) {
      if (this.localScreenStream) {
        this.localScreenStream.getTracks().forEach((t) => {
          try { t.onended = null; t.stop(); } catch { /* noop */ }
        });
      }
      this.localScreenStream = null;
      this.screenSharedForExam = false;
      const store = useMeetingStore.getState();
      store.setLocalScreenStream(null);
      if (store.screenSharePeerId === 'self') store.setScreenSharePeerId(null);
    }
  }

  /** Rời SFU: dọn mọi thứ (có thể giữ nguyên screen track khi đang reconnect). */
  disconnect(opts?: { keepScreenTrack?: boolean }): void {
    mainSocket.off('audio:allowed', this.onAudioAllowed);
    this.stopScreenShare({ keepTrack: opts?.keepScreenTrack });
    this.socket?.disconnect();
    this.socket = null;
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.camAudio = this.camVideo = this.screen = null;
    this.localCameraStream = null;
    this.producerToConsumer.clear();
    this.deferredScreenProducers.clear();

    this.audioByPeer.forEach((el) => { el.pause(); el.srcObject = null; el.remove(); });
    this.audioByPeer.clear();
    this.audioRouting = null;
    this.analysers.clear();
    if (this.speakingTimer) { clearInterval(this.speakingTimer); this.speakingTimer = null; }
    if (this.audioCtx) { this.audioCtx.close().catch(() => {}); this.audioCtx = null; }

    this.roomId = null;
    this.joined = false;
  }

  /** Kiểm tra quyền xem màn hình ở phía client (phòng vệ bổ sung cùng tầng SFU). */
  private canViewScreen(ownerCid: string): boolean {
    const st = useMeetingStore.getState();
    if (!st.examMonitoring || st.isHost) return true;
    if (st.hostId && ownerCid === st.hostId) return true;
    if (st.examPinnedScreenId && ownerCid === st.examPinnedScreenId) return true;
    return false;
  }

  /** Đồng bộ lại các screen consumer ở client mỗi khi examMonitoring / examPinnedScreenId thay đổi. */
  async reconcileExamScreens(): Promise<void> {
    if (!this.joined) return;
    const store = useMeetingStore.getState();

    // 1) Đóng screen consumer của bạn khác nếu không còn quyền xem
    for (const [producerId, info] of [...this.producerToConsumer.entries()]) {
      if (info.type !== 'screen') continue;
      if (!this.canViewScreen(info.clientPeerId)) {
        this.emitWithAck('mediasoup:closeConsumer', { consumerId: info.consumerId }).catch(() => null);
        this.producerToConsumer.delete(producerId);
        this.deferredScreenProducers.set(producerId, { producerId, clientPeerId: info.clientPeerId });
        store.removeRemoteScreenStream(info.clientPeerId);
        if (store.screenSharePeerId === info.clientPeerId) {
          store.setScreenSharePeerId(null);
        }
      }
    }

    // 2) Mở lại screen producer đã tạm hoãn nếu nay đã được phép xem (VD Host vừa ghim hoặc kết thúc giám sát)
    for (const [producerId, item] of [...this.deferredScreenProducers.entries()]) {
      if (!this.canViewScreen(item.clientPeerId)) continue;
      this.deferredScreenProducers.delete(producerId);
      if (this.producerToConsumer.has(producerId)) continue;
      await this.consume(item.producerId, item.clientPeerId, 'screen').catch(() => null);
    }
  }

  // ─── internals ───────────────────────────────────────────────

  private async getSendTransport(): Promise<Transport> {
    if (this.sendTransport) return this.sendTransport;
    const params = await this.emitWithAck<Record<string, unknown> & { error?: string }>(
      'mediasoup:createSendTransport', {},
    );
    if (params.error) throw new Error(`sendTransport: ${params.error}`);
    const transport = this.device!.createSendTransport(params as never);
    this.wireTransport(transport);
    this.sendTransport = transport;
    return transport;
  }

  private async getRecvTransport(): Promise<Transport> {
    if (this.recvTransport) return this.recvTransport;
    const params = await this.emitWithAck<Record<string, unknown> & { error?: string }>(
      'mediasoup:createRecvTransport', {},
    );
    if (params.error) throw new Error(`recvTransport: ${params.error}`);
    const transport = this.device!.createRecvTransport(params as never);
    this.wireTransport(transport);
    this.recvTransport = transport;
    return transport;
  }

  private wireTransport(transport: Transport): void {
    transport.on('connect', ({ dtlsParameters }: { dtlsParameters: unknown }, callback: () => void, errback: (e: Error) => void) => {
      this.emitWithAck<{ error?: string }>('mediasoup:connectTransport', { transportId: transport.id, dtlsParameters })
        .then((r) => (r.error ? errback(new Error(r.error)) : callback()))
        .catch(errback);
    });
    transport.on('produce', (
      { kind, rtpParameters, appData }: { kind: string; rtpParameters: unknown; appData?: Record<string, unknown> },
      callback: (o: { id: string }) => void,
      errback: (e: Error) => void,
    ) => {
      this.emitWithAck<{ producerId?: string; error?: string }>('mediasoup:produce', {
        transportId: transport.id, kind, rtpParameters, appData,
      })
        .then((r) => (r.error || !r.producerId ? errback(new Error(r.error || 'no id')) : callback({ id: r.producerId })))
        .catch(errback);
    });
  }

  /** Consume 1 producer → gắn stream vào store theo clientPeerId + type. */
  private async consume(producerId: string, clientPeerId: string, type?: ProducerType): Promise<void> {
    if (!this.device || !this.socket) return;
    if (clientPeerId === this.myClientPeerId) return; // bỏ qua producer của chính mình

    const recvTransport = await this.getRecvTransport();

    const data = await this.emitWithAck<{
      error?: string; consumerId: string; producerId: string;
      kind: string; rtpParameters: unknown;
      producerPeerId?: string; producerClientPeerId?: string; producerPeerName?: string;
      producerType?: ProducerType;
    }>('mediasoup:consume', {
      transportId: recvTransport.id,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });

    if (data.error) {
      console.warn('[SFU] consume error:', data.error);
      return;
    }

    const consumer = await recvTransport.consume({
      id: data.consumerId,
      producerId: data.producerId,
      kind: data.kind as 'audio' | 'video',
      rtpParameters: data.rtpParameters as never,
    });
    await this.emitWithAck('mediasoup:resumeConsumer', { consumerId: consumer.id }).catch(() => null);

    const target = data.producerClientPeerId || clientPeerId;
    const pType = data.producerType || type;
    this.producerToConsumer.set(producerId, { consumerId: consumer.id, clientPeerId: target, kind: data.kind, type: pType });

    const store = useMeetingStore.getState();
    if (data.kind === 'audio') {
      this.attachAudio(consumer, target);
    } else if (pType === 'screen') {
      store.setRemoteScreenStream(target, new MediaStream([consumer.track]));
      // Chỉ đưa lên spotlight nếu không ở chế độ giám sát thi, hoặc đây là màn hình Host / được Host ghim
      const allowSpotlight =
        !store.examMonitoring ||
        (!!store.hostId && target === store.hostId) ||
        (!!store.examPinnedScreenId && target === store.examPinnedScreenId);
      if (allowSpotlight) {
        store.setScreenSharePeerId(target);
      }
    } else {
      store.setRemoteCamStream(target, new MediaStream([consumer.track]));
    }
  }

  private attachAudio(consumer: Consumer, clientPeerId: string): void {
    const oldEl = this.audioByPeer.get(clientPeerId);
    if (oldEl) {
      oldEl.pause();
      oldEl.srcObject = null;
      oldEl.remove();
      this.audioByPeer.delete(clientPeerId);
    }
    const audioStream = new MediaStream([consumer.track]);
    const el = document.createElement('audio');
    el.autoplay = true;
    el.srcObject = audioStream;
    el.style.display = 'none';
    document.body.appendChild(el);
    this.audioByPeer.set(clientPeerId, el);
    this.registerAnalyser(clientPeerId, audioStream);
  }

  /**
   * Áp luật BẤT ĐỐI XỨNG "ai nghe được ai" (serialize để tránh 2 lần gọi song song tạo consumer trùng):
   *   nghe X ⟺ X là host            (ai cũng nghe host)
   *          ∨ tôi là host          (host nghe TẤT CẢ, kể cả người không tick)
   *          ∨ tôi và X cùng được tick
   */
  private async reconcileAudio(): Promise<void> {
    if (this.reconcileInFlight) {
      this.reconcileQueued = true;
      return this.reconcileInFlight;
    }
    this.reconcileInFlight = (async () => {
      try {
        do {
          this.reconcileQueued = false;
          if (!this.joined) return;
          const store = useMeetingStore.getState();
          const heardPeerIds = new Set<string>();
          for (const a of this.audioRouting || []) {
            const target = a.clientPeerId;
            if (!target || target === this.myClientPeerId) continue;
            if (store.canHear(target)) heardPeerIds.add(target);
          }

          // Đóng audio consumer không còn được phép nghe
          for (const [producerId, info] of [...this.producerToConsumer]) {
            if (info.kind === 'audio' && !heardPeerIds.has(info.clientPeerId)) {
              this.closeAudioConsumer(producerId, info.consumerId, info.clientPeerId);
            }
          }

          // Mở audio consumer cho producer mới được phép
          for (const a of this.audioRouting || []) {
            const target = a.clientPeerId;
            if (!target || target === this.myClientPeerId) continue;
            if (!store.canHear(target)) continue;
            const existing = this.producerToConsumer.get(a.producerId);
            if (existing && existing.kind === 'audio') continue;
            await this.consume(a.producerId, target).catch((e) => console.warn('[SFU] audio consume fail:', e));
          }
        } while (this.reconcileQueued);
      } finally {
        this.reconcileInFlight = null;
      }
    })();
    return this.reconcileInFlight;
  }

  private closeAudioConsumer(producerId: string, consumerId: string, clientPeerId: string): void {
    this.emitWithAck('mediasoup:closeConsumer', { consumerId }).catch(() => null);
    this.producerToConsumer.delete(producerId);
    const el = this.audioByPeer.get(clientPeerId);
    if (el) { el.pause(); el.srcObject = null; el.remove(); this.audioByPeer.delete(clientPeerId); }
    this.analysers.delete(clientPeerId);
    useMeetingStore.getState().clearSpeaking(clientPeerId);
  }

  private registerServerEvents(): void {
    const socket = this.socket!;

    socket.on('mediasoup:newProducer', async ({ producerId, clientPeerId, peerId, kind, type }: {
      producerId: string; clientPeerId?: string; peerId?: string; kind: string; type?: ProducerType;
    }) => {
      const target = clientPeerId || peerId;
      if (!target || target === this.myClientPeerId) return;
      // Audio KHÔNG consume ở đây — routingChanged mới quyết định được nghe ai
      if (kind === 'audio') return;
      if (type === 'screen' && !this.canViewScreen(target)) {
        this.deferredScreenProducers.set(producerId, { producerId, clientPeerId: target });
        return;
      }
      await this.consume(producerId, target, type).catch((e) => console.warn('[SFU] consume fail:', e));
    });

    // SFU báo danh sách audio-producer tôi được nghe → bật/tắt consumer audio tương ứng
    socket.on('mediasoup:routingChanged', ({ audio }: { audio: { producerId: string; clientPeerId?: string }[] }) => {
      this.audioRouting = Array.isArray(audio) ? audio : [];
      if (this.joined) this.reconcileAudio();
    });

    // Host tick/bỏ tick → áp lại luật ngay (gỡ bản cũ trước khi gắn để không nhân bản)
    mainSocket.off('audio:allowed', this.onAudioAllowed);
    mainSocket.on('audio:allowed', this.onAudioAllowed);

    socket.on('mediasoup:producerClosed', ({ producerId }: { producerId: string }) => {
      this.deferredScreenProducers.delete(producerId);
      const mapping = this.producerToConsumer.get(producerId);
      if (!mapping) return;
      this.producerToConsumer.delete(producerId);
      const store = useMeetingStore.getState();

      if (mapping.kind === 'audio') {
        const el = this.audioByPeer.get(mapping.clientPeerId);
        if (el) { el.pause(); el.srcObject = null; el.remove(); this.audioByPeer.delete(mapping.clientPeerId); }
        this.analysers.delete(mapping.clientPeerId);
        store.clearSpeaking(mapping.clientPeerId);
      } else if (mapping.type === 'screen') {
        if (store.screenSharePeerId === mapping.clientPeerId) {
          const remaining: string[] = [];
          this.producerToConsumer.forEach((info) => {
            if (info.type === 'screen' && info.clientPeerId !== mapping.clientPeerId && this.canViewScreen(info.clientPeerId)) {
              remaining.push(info.clientPeerId);
            }
          });
          remaining.sort();
          store.setScreenSharePeerId(remaining[0] || (this.localScreenStream ? 'self' : null));
        }
        store.removeRemoteScreenStream(mapping.clientPeerId);
      } else {
        store.setRemoteCamStream(mapping.clientPeerId, new MediaStream());
      }
    });

    socket.on('mediasoup:peerLeft', ({ clientPeerId, peerId }: { peerId?: string; clientPeerId?: string }) => {
      const target = clientPeerId || peerId;
      if (!target) return;
      // Dọn sạch mọi producerToConsumer & deferredScreenProducers thuộc peer đã rời phòng
      for (const [pid, info] of [...this.producerToConsumer.entries()]) {
        if (info.clientPeerId === target) this.producerToConsumer.delete(pid);
      }
      for (const [pid, item] of [...this.deferredScreenProducers.entries()]) {
        if (item.clientPeerId === target) this.deferredScreenProducers.delete(pid);
      }
      const store = useMeetingStore.getState();
      store.removeRemoteStreams(target);
      store.clearSpeaking(target);
      if (store.screenSharePeerId === target) {
        const remaining: string[] = [];
        this.producerToConsumer.forEach((info) => {
          if (info.type === 'screen' && info.clientPeerId !== target && this.canViewScreen(info.clientPeerId)) {
            remaining.push(info.clientPeerId);
          }
        });
        remaining.sort();
        store.setScreenSharePeerId(remaining[0] || (this.localScreenStream ? 'self' : null));
      }
      // Dọn ghim mồ côi: người bị ghim rời phòng thì bỏ ghim luôn
      if (store.pinnedPeerId === target) store.setPinnedPeerId(null);
      const el = this.audioByPeer.get(target);
      if (el) { el.pause(); el.srcObject = null; el.remove(); this.audioByPeer.delete(target); }
      this.analysers.delete(target);
    });
  }

  // ─── active speaker ──────────────────────────────────────────

  private ensureSpeakingLoop(): void {
    if (this.audioCtx) return;
    try {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.audioCtx.resume().catch(() => {});
    } catch {
      return;
    }
    this.speakingTimer = setInterval(() => this.tickSpeaking(), 150);
  }

  private registerAnalyser(key: string, stream: MediaStream): void {
    if (!this.audioCtx || !stream.getAudioTracks().length) return;
    try {
      const source = this.audioCtx.createMediaStreamSource(stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      this.analysers.set(key, { analyser, data: new Uint8Array(analyser.frequencyBinCount) });
    } catch (e) {
      console.warn('[SFU] analyser fail', e);
    }
  }

  private tickSpeaking(): void {
    const store = useMeetingStore.getState();
    this.analysers.forEach(({ analyser, data }, key) => {
      analyser.getByteFrequencyData(data as any);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      store.setSpeaking(key, rms > 12); // ngưỡng RMS (0-255)
    });
  }

  private emitWithAck<T = Record<string, unknown>>(event: string, data: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('socket null'));
      const timer = setTimeout(() => reject(new Error(`${event} timeout`)), 15000);
      this.socket.emit(event, data, (res: T) => {
        clearTimeout(timer);
        resolve(res ?? ({} as T));
      });
    });
  }
}

export const sfuService = new SFUService();
