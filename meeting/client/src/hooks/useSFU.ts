/**
 * useSFU — hook gắn vòng đời SFU vào MeetingPage khi bật VITE_MEDIA_MODE=sfu.
 *
 * Thứ tự quan trọng:
 *  1. Lấy local media TRƯỚC → user luôn thấy mình kể cả khi SFU lỗi.
 *  2. Chờ sfuToken (LobbyPage set bất đồng bộ trong callback room:join) rồi mới connect SFU.
 *     Nếu connect sớm hơn token → SFU trả Unauthorized.
 *
 * clientPeerId = socket.id của signaling socket → SFU map stream về đúng peer.
 */
import { useEffect } from 'react';
import { sfuService } from '../services/sfu';
import { socket } from '../services/socket';
import { useMeetingStore } from '../store/useMeetingStore';

/** Chờ tới khi store có sfuToken (tối đa ~6s), trả về token hoặc null. */
function waitForSfuToken(timeoutMs = 6000): Promise<string | null> {
  return new Promise((resolve) => {
    const cur = useMeetingStore.getState().sfuToken;
    if (cur) return resolve(cur);
    const t0 = Date.now();
    const iv = setInterval(() => {
      const tk = useMeetingStore.getState().sfuToken;
      if (tk) { clearInterval(iv); resolve(tk); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); resolve(null); }
    }, 100);
  });
}

export const useSFU = (enabled: boolean, roomId: string | null, sfuEpoch: number = 0) => {
  useEffect(() => {
    if (!enabled || !roomId) return;
    let cancelled = false;

    (async () => {
      const { isMicEnabled, isCameraEnabled, userName, selectedMicId, selectedCamId } = useMeetingStore.getState();
      const w = window as any;
      const videoConstraint: MediaTrackConstraints = selectedCamId
        ? { width: 1280, height: 720, frameRate: 24, deviceId: { ideal: selectedCamId } }
        : { width: 1280, height: 720, frameRate: 24 };
      const audioConstraint: MediaTrackConstraints = selectedMicId
        ? { echoCancellation: true, noiseSuppression: true, deviceId: { ideal: selectedMicId } }
        : { echoCancellation: true, noiseSuppression: true };

      // 1. Local media trước — luôn có preview.
      //    Tái dùng stream giữ sẵn khi chuyển phòng nhóm (không chớp camera,
      //    không xin lại quyền). Chỉ xin mới khi chưa có hoặc thiết bị tắt cả hai.
      let stream: MediaStream | null = null;
      const kept: MediaStream | null = w.__meetKeepStream || null;
      const keptAlive = !!kept && kept.getTracks().some((t) => t.readyState === 'live');
      w.__meetKeepStream = null; // tiêu thụ ngay để không rò rỉ reference cũ
      if (keptAlive) {
        stream = kept;
      } else if (isMicEnabled || isCameraEnabled) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: isCameraEnabled ? videoConstraint : false,
            audio: isMicEnabled ? audioConstraint : false,
          });
        } catch (e) {
          console.warn('[SFU] getUserMedia failed:', e);
          // Fallback: xin từng loại một (cam lỗi thì thử mic, và ngược lại)
          if (isCameraEnabled) {
            try {
              stream = await navigator.mediaDevices.getUserMedia({ audio: isMicEnabled ? audioConstraint : false });
            } catch { /* bỏ qua */ }
          }
          if (!stream && isMicEnabled) {
            try {
              stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraint });
            } catch { /* bỏ qua */ }
          }
        }
      } else {
        console.log('[SFU] cả mic và cam tắt → chế độ receive-only');
      }
      if (cancelled) { if (!keptAlive) stream?.getTracks().forEach((t) => t.stop()); return; }
      if (stream) useMeetingStore.getState().setLocalStream(stream);

      // 2. Chờ token rồi connect SFU
      const keptScreen: MediaStream | null = w.__meetKeepScreenStream || null;
      const keptScreenAlive = !!keptScreen && keptScreen.getVideoTracks().some((t) => t.readyState === 'live');
      const keptScreenForExam = Boolean(w.__meetKeepScreenForExam);
      const keptScreenQuality = w.__meetKeepScreenQuality || 'medium';
      w.__meetKeepScreenStream = null;
      w.__meetKeepScreenForExam = false;
      w.__meetKeepScreenQuality = null;

      try {
        if (!socket.connected) socket.connect();
        if (!socket.id) await new Promise<void>((res) => socket.once('connect', () => res()));

        const token = await waitForSfuToken();
        if (cancelled) return;
        if (!token) { console.error('[SFU] không có sfuToken — media bị vô hiệu (thử tải lại)'); return; }

        await sfuService.connect(roomId, socket.id ?? null, userName || '', token);
        if (cancelled) return;
        if (stream) {
          await sfuService.publishCamera(stream);
          console.log('[SFU] published camera as', userName);
        }
        // Tự phát lại màn hình đang chia sẻ trước đó (giữ nguyên khi mạng chập chờn / reconnect)
        if (keptScreenAlive && keptScreen) {
          await sfuService.publishScreenStream(keptScreen, keptScreenQuality, keptScreenForExam).catch((e) => {
            console.warn('[SFU] republish screen failed:', e);
            keptScreen.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
            useMeetingStore.getState().setLocalScreenStream(null);
          });
        }
      } catch (err) {
        console.error('[SFU] connect/publish failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      const keepScreen = Boolean((window as any).__meetKeepScreenStream);
      sfuService.disconnect({ keepScreenTrack: keepScreen });
    };
  }, [enabled, roomId, sfuEpoch]);
};
