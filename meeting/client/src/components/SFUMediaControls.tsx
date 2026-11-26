/**
 * SFUMediaControls — thanh điều khiển media (mic / cam / share / giơ tay / biểu cảm / thiết bị / rời).
 * Hoạt động trực tiếp trên localStream + SFU producers, không phụ thuộc LiveKit.
 * Trạng thái share đọc từ store (screenSharePeerId==='self') để luôn đồng bộ,
 * kể cả khi người dùng bấm "Dừng chia sẻ" ở thanh trình duyệt.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  PhoneOff,
  Hand,
  SlidersHorizontal,
  Smile,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useMeetingStore } from '../store/useMeetingStore';
import { SCREEN_QUALITY, sfuService, type ScreenQualityPreset } from '../services/sfu';
import { socket } from '../services/socket';
import { showActionHud, toast } from '../store/useUiStore';
import { isSoundEnabled, playSoundCue, setSoundEnabled } from '../lib/soundCue';

const QUICK_REACTIONS = ['👏', '👍', '❤️', '🎉', '😂', '💡'];

const Btn: React.FC<{
  onClick: () => void;
  active?: boolean;
  highlight?: boolean;
  danger?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, active, highlight, danger, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    className={[
      'grid place-items-center h-9 w-9 rounded-full transition-all duration-150 active:scale-90',
      danger
        ? 'bg-danger text-white hover:brightness-110'
        : highlight
          ? 'bg-accent text-accent-ink shadow-[0_0_16px_-2px_var(--color-accent)] hover:brightness-110'
          : active
            ? 'bg-danger/90 text-white hover:bg-danger'
            : 'bg-elevated text-white/85 hover:bg-line-strong hover:text-white',
    ].join(' ')}
  >
    {children}
  </button>
);

export const SFUMediaControls: React.FC<{ onLeave: () => void }> = ({ onLeave }) => {
  const isMicEnabled = useMeetingStore((s) => s.isMicEnabled);
  const isCameraEnabled = useMeetingStore((s) => s.isCameraEnabled);
  const isHandRaised = useMeetingStore((s) => s.isHandRaised);
  const selectedMicId = useMeetingStore((s) => s.selectedMicId);
  const selectedCamId = useMeetingStore((s) => s.selectedCamId);
  const roomId = useMeetingStore((s) => s.roomId);
  const isSharing = useMeetingStore((s) => !!s.localScreenStream);
  const isSelfSpeaking = useMeetingStore((s) => !!s.speaking['self']);
  const { setMicEnabled, setCameraEnabled, setHandRaised } = useMeetingStore.getState();

  const [devOpen, setDevOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [switching, setSwitching] = useState(false);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [screenQuality, setScreenQualityState] = useState<ScreenQualityPreset>(() => sfuService.currentScreenQuality);
  const popoverRef = useRef<HTMLDivElement>(null);

  const toggleMicRef = useRef<() => void>(() => {});
  const toggleCamRef = useRef<() => void>(() => {});
  const toggleHandRef = useRef<() => void>(() => {});

  const loadDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const list = await navigator.mediaDevices.enumerateDevices();
      setMics(list.filter((d) => d.kind === 'audioinput'));
      setCams(list.filter((d) => d.kind === 'videoinput'));
    } catch { /* noop */ }
  };

  useEffect(() => {
    if (!devOpen && !reactOpen) return;
    if (devOpen) void loadDevices();
    const onOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setDevOpen(false);
        setReactOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDevOpen(false);
        setReactOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('keydown', onEsc);
    };
  }, [devOpen, reactOpen]);

  /**
   * Bật/tắt mic — ngữ nghĩa đã kiểm chứng trên prod:
   *  TẮT: track.enabled=false + producer.pause() (sync void — KHÔNG .catch)
   *  BẬT: track.enabled=true → resume() TRƯỚC → replaceTrack(track.clone())
   *       chưa có track/producer → addDeviceTrack (xin thiết bị + produce mới).
   */
  const toggleMic = async () => {
    const next = !isMicEnabled;
    const st = useMeetingStore.getState().localStream;
    try {
      const tr = st && st.getAudioTracks()[0];
      if (!next) {
        if (tr) tr.enabled = false;
        try { sfuService.localProducers.audio?.pause(); } catch { /* noop */ }
      } else {
        if (!tr) {
          await sfuService.addDeviceTrack('audio');
        } else {
          tr.enabled = true;
          const pr = sfuService.localProducers.audio;
          if (pr) {
            try { pr.resume(); } catch { /* noop */ }
            try {
              const prevTrack = pr.track;
              const nt = tr.clone();
              nt.enabled = true;
              await pr.replaceTrack({ track: nt });
              if (prevTrack && prevTrack !== tr && prevTrack !== nt) {
                try { prevTrack.stop(); } catch { /* noop */ }
              }
            } catch { /* resume đã đủ để tiếng chảy lại */ }
          } else {
            await sfuService.addDeviceTrack('audio');
          }
        }
      }
    } catch (er: any) {
      console.warn('[SFU] toggle mic failed:', er);
      toast.error('Không bật được mic: ' + ((er && (er.name || er.message)) || er));
      return;
    }
    setMicEnabled(next);
    showActionHud(next ? '🎙️ Đã bật mic' : '🔇 Đã tắt mic', next ? 'ok' : 'danger');
    if (roomId) socket.emit('peer:update-state', { roomId, state: { isMuted: !next } });
  };

  const toggleCamera = async () => {
    const next = !isCameraEnabled;
    const st = useMeetingStore.getState().localStream;
    try {
      const tr = st && st.getVideoTracks()[0];
      if (!next) {
        if (tr) tr.enabled = false;
        try { sfuService.localProducers.video?.pause(); } catch { /* noop */ }
      } else {
        if (!tr) {
          await sfuService.addDeviceTrack('video');
        } else {
          tr.enabled = true;
          const pr = sfuService.localProducers.video;
          if (pr) {
            try { pr.resume(); } catch { /* noop */ }
            try {
              const prevTrack = pr.track;
              const nt = tr.clone();
              nt.enabled = true;
              await pr.replaceTrack({ track: nt });
              if (prevTrack && prevTrack !== tr && prevTrack !== nt) {
                try { prevTrack.stop(); } catch { /* noop */ }
              }
            } catch { /* noop */ }
          } else {
            await sfuService.addDeviceTrack('video');
          }
        }
      }
    } catch (er: any) {
      console.warn('[SFU] toggle camera failed:', er);
      toast.error('Không bật được camera: ' + ((er && (er.name || er.message)) || er));
      return;
    }
    setCameraEnabled(next);
    showActionHud(next ? '📹 Đã bật camera' : '📷 Đã tắt camera', next ? 'ok' : 'neutral');
    if (roomId) socket.emit('peer:update-state', { roomId, state: { isCameraOff: !next } });
  };

  const toggleShare = async () => {
    if (isSharing) {
      sfuService.stopScreenShare();
      showActionHud('🖥️ Đã dừng chia sẻ màn hình', 'neutral');
      return;
    }
    try {
      await sfuService.startScreenShare(screenQuality);
      showActionHud('🖥️ Đang chia sẻ màn hình', 'ok');
    } catch (e: any) {
      console.warn('[SFU] screen share cancelled/failed:', e);
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'AbortError') return;
      toast.error(e?.message || 'Không thể chia sẻ màn hình. Vui lòng thử lại.');
    }
  };

  const handleScreenQualityChange = async (preset: ScreenQualityPreset) => {
    setScreenQualityState(preset);
    try {
      await sfuService.setScreenQuality(preset);
      toast.info(`Chất lượng chia sẻ màn hình: ${SCREEN_QUALITY[preset].label} (${SCREEN_QUALITY[preset].height}p)`);
    } catch { /* noop */ }
  };

  const toggleHand = () => {
    const next = !isHandRaised;
    setHandRaised(next);
    if (next) playSoundCue('hand');
    showActionHud(next ? '✋ Đã giơ tay phát biểu' : '👇 Đã hạ tay xuống', next ? 'accent' : 'neutral');
    if (roomId) socket.emit('peer:update-state', { roomId, state: { isHandRaised: next } });
  };

  toggleMicRef.current = () => { void toggleMic(); };
  toggleCamRef.current = () => { void toggleCamera(); };
  toggleHandRef.current = toggleHand;

  // Nhận phím tắt toàn cục từ MeetingPage (Alt+M / Alt+V / Alt+H)
  useEffect(() => {
    const onMic = () => toggleMicRef.current();
    const onCam = () => toggleCamRef.current();
    const onHand = () => toggleHandRef.current();
    window.addEventListener('meet:toggleMic', onMic);
    window.addEventListener('meet:toggleCam', onCam);
    window.addEventListener('meet:toggleHand', onHand);
    return () => {
      window.removeEventListener('meet:toggleMic', onMic);
      window.removeEventListener('meet:toggleCam', onCam);
      window.removeEventListener('meet:toggleHand', onHand);
    };
  }, []);

  const sendReaction = (emoji: string) => {
    if (!roomId) return;
    setReactOpen(false);
    socket.emit('room:reaction', { roomId, emoji }, (res: any) => {
      if (res?.error) {
        toast.info(res.error);
      }
    });
  };

  const handleSwitchDevice = async (kind: 'audio' | 'video', deviceId: string) => {
    setSwitching(true);
    try {
      await sfuService.switchDevice(kind, deviceId);
      toast.success(kind === 'audio' ? 'Đã đổi microphone' : 'Đã đổi camera');
    } catch (e: any) {
      toast.error('Không đổi được thiết bị: ' + (e?.message || e));
    } finally {
      setSwitching(false);
    }
  };

  const toggleSoundPref = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playSoundCue('solo');
    showActionHud(next ? '🔔 Đã bật âm thanh thông báo' : '🔕 Đã tắt âm thanh thông báo', 'neutral');
  };

  return (
    <div ref={popoverRef} className="relative">
      <div className="flex items-center gap-1.5 rounded-full bg-base/80 backdrop-blur-md border border-line px-2 py-1 shadow-lg">
        <div className={`rounded-full transition-shadow ${isMicEnabled && isSelfSpeaking ? 'ring-2 ring-ok/65' : ''}`}>
          <Btn
            onClick={toggleMic}
            active={!isMicEnabled}
            title={isMicEnabled ? 'Tắt mic (Alt+M)' : 'Bật mic (Alt+M)'}
          >
            {isMicEnabled ? <Mic size={17} /> : <MicOff size={17} />}
          </Btn>
        </div>
        <Btn
          onClick={toggleCamera}
          active={!isCameraEnabled}
          title={isCameraEnabled ? 'Tắt camera (Alt+V)' : 'Bật camera (Alt+V)'}
        >
          {isCameraEnabled ? <Video size={17} /> : <VideoOff size={17} />}
        </Btn>
        <Btn onClick={toggleShare} title={isSharing ? 'Dừng chia sẻ' : 'Chia sẻ màn hình'}>
          <span className={isSharing ? 'text-ok' : ''}><MonitorUp size={17} /></span>
        </Btn>
        <Btn
          onClick={toggleHand}
          highlight={isHandRaised}
          title={isHandRaised ? 'Hạ tay xuống (Alt+H)' : 'Giơ tay phát biểu (Alt+H)'}
        >
          <Hand size={17} className={isHandRaised ? 'anim-hand-wave' : ''} />
        </Btn>
        <Btn
          onClick={() => { setReactOpen((v) => !v); setDevOpen(false); }}
          highlight={reactOpen}
          title="Thả biểu cảm nhanh"
        >
          <Smile size={17} />
        </Btn>
        <Btn
          onClick={() => { setDevOpen((v) => !v); setReactOpen(false); }}
          highlight={devOpen}
          title="Cài đặt mic, camera & âm báo"
        >
          <SlidersHorizontal size={16} />
        </Btn>
        <div className="mx-0.5 h-5 w-px bg-line" />
        <Btn onClick={onLeave} danger title="Rời khỏi cuộc họp">
          <PhoneOff size={17} />
        </Btn>
      </div>

      {/* Popover chọn biểu cảm thả nổi */}
      {reactOpen && (
        <div className="anim-popover absolute left-1/2 top-full z-50 mt-2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line-strong bg-overlay/95 px-2.5 py-1.5 shadow-modal backdrop-blur-md">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => sendReaction(emoji)}
              className="grid h-9 w-9 place-items-center rounded-full text-xl transition-transform duration-150 hover:scale-125 hover:bg-elevated active:scale-95"
              title={`Thả biểu cảm ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Popover thiết bị + tùy chọn âm báo */}
      {devOpen && (
        <div className="anim-popover absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-card border border-line-strong bg-overlay p-3 shadow-modal space-y-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Cài đặt thiết bị</div>
          <label className="block space-y-1">
            <span className="text-[11px] text-white/80">Microphone</span>
            <select
              disabled={switching}
              value={selectedMicId}
              onChange={(e) => void handleSwitchDevice('audio', e.target.value)}
              className="w-full rounded-ctl border border-line-strong bg-base px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
            >
              <option value="">Mặc định hệ thống</option>
              {mics.map((m, idx) => (
                <option key={m.deviceId || idx} value={m.deviceId}>
                  {m.label || `Microphone ${idx + 1}`}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-white/80">Camera</span>
            <select
              disabled={switching}
              value={selectedCamId}
              onChange={(e) => void handleSwitchDevice('video', e.target.value)}
              className="w-full rounded-ctl border border-line-strong bg-base px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
            >
              <option value="">Mặc định hệ thống</option>
              {cams.map((c, idx) => (
                <option key={c.deviceId || idx} value={c.deviceId}>
                  {c.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-1.5 border-t border-line pt-2">
            <span className="text-[11px] text-white/80">Chất lượng chia sẻ màn hình</span>
            <div className="grid grid-cols-4 gap-1 rounded-ctl border border-line bg-base p-1">
              {(['low', 'medium', 'high', 'max'] as ScreenQualityPreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => void handleScreenQualityChange(preset)}
                  className={`rounded py-1 text-[10px] font-bold transition-all ${
                    screenQuality === preset
                      ? 'bg-accent text-accent-ink shadow-sm'
                      : 'text-muted hover:text-white'
                  }`}
                  title={`${SCREEN_QUALITY[preset].width}×${SCREEN_QUALITY[preset].height} @ ${SCREEN_QUALITY[preset].frameRate}fps`}
                >
                  {SCREEN_QUALITY[preset].label}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-line pt-2">
            <button
              type="button"
              onClick={toggleSoundPref}
              className="flex w-full items-center justify-between rounded-ctl border border-line bg-raised px-2.5 py-1.5 text-xs text-white/90 transition-colors hover:bg-elevated active:scale-[0.98]"
            >
              <span className="flex items-center gap-1.5">
                {soundOn ? <Volume2 size={13} className="text-accent" /> : <VolumeX size={13} className="text-muted" />}
                Âm thanh thông báo
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${soundOn ? 'bg-ok/20 text-ok' : 'bg-line text-muted'}`}>
                {soundOn ? 'Bật' : 'Tắt'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
