/**
 * SFUVideoGrid — lưới video chế độ SFU.
 *
 * 3 chế độ hiển thị (ưu tiên từ trên xuống):
 *  1. Có người đang chia sẻ màn hình → screen chiếm spotlight, camera dồn filmstrip.
 *  2. Có peer được ghim (pinnedPeerId) → camera đó spotlight, còn lại filmstrip.
 *  3. Còn lại → lưới tự tính số cột theo số người.
 *
 * Stream đọc từ store maps (remoteCamStreams / remoteScreenStreams) keyed by
 * signaling socket.id — không phụ thuộc thứ tự peer:joined vs stream đến.
 */
import React, { useMemo } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { socket } from '../services/socket';
import VideoTile from './VideoTile';
import { togglePeerInGroup, toggleSoloPeer } from '../lib/audioActions';

interface Cam {
  id: string;
  name: string;
  stream: MediaStream | null;
  isLocal: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  isSpeaking: boolean;
  isSharing: boolean;
  isHandRaised: boolean;
}

const hasVideo = (s: MediaStream | null) => !!s && s.getVideoTracks().length > 0;

export const SFUVideoGrid: React.FC<{ onShowHistory?: (socketId: string) => void }> = () => {
  const localStream = useMeetingStore((s) => s.localStream);
  const userName = useMeetingStore((s) => s.userName);
  const peers = useMeetingStore((s) => s.peers);
  const remoteCam = useMeetingStore((s) => s.remoteCamStreams);
  const remoteScreen = useMeetingStore((s) => s.remoteScreenStreams);
  const screenSharePeerId = useMeetingStore((s) => s.screenSharePeerId);
  const localScreenStream = useMeetingStore((s) => s.localScreenStream);
  const speaking = useMeetingStore((s) => s.speaking);
  const isMicEnabled = useMeetingStore((s) => s.isMicEnabled);
  const isCameraEnabled = useMeetingStore((s) => s.isCameraEnabled);
  const isHandRaised = useMeetingStore((s) => s.isHandRaised);
  const pinnedPeerId = useMeetingStore((s) => s.pinnedPeerId);
  const setPinnedPeerId = useMeetingStore((s) => s.setPinnedPeerId);
  // Màn hình host ghim cho cả lớp (giám sát thi) — ưu tiên hơn spotlight thường
  const examPinnedScreenId = useMeetingStore((s) => s.examPinnedScreenId);
  const examMonitoring = useMeetingStore((s) => s.examMonitoring);
  const hostId = useMeetingStore((s) => s.hostId);
  // Ô tick "nghe host": chỉ host thấy, tick ai thì người đó nghe được host nói
  const isHost = useMeetingStore((s) => s.isHost);
  const audioMode = useMeetingStore((s) => s.audioMode);
  const hearHost = useMeetingStore((s) => s.hearHost);
  const roomId = useMeetingStore((s) => s.roomId);
  const mySocketId = useMeetingStore((s) => s.mySocketId);

  /** Props tick cho 1 card theo socket.id (không áp cho card của chính host) */
  const hearProps = (id: string) => {
    if (!isHost || id === 'self' || id === socket.id) return {};
    const targetName = peers.find((p) => p.socketId === id)?.name;
    const isSolo = audioMode === 'selected' && hearHost.length === 1 && hearHost[0] === id;
    return {
      canHearHost: audioMode === 'all' || hearHost.includes(id),
      isSoloHearHost: isSolo,
      onToggleHearHost: () => togglePeerInGroup(roomId, id),
      onSoloHearHost: () => toggleSoloPeer(roomId, id, targetName),
    };
  };

  const cameras = useMemo<Cam[]>(() => {
    const self: Cam = {
      id: 'self',
      name: userName || 'Bạn',
      stream: localStream,
      isLocal: true,
      isMuted: !isMicEnabled,
      isCameraOff: !isCameraEnabled,
      isSpeaking: !!speaking['self'],
      isSharing: Boolean(localScreenStream),
      isHandRaised,
    };
    const others: Cam[] = peers
      .filter((p) => p.socketId !== socket.id) // loại chính mình (phòng hờ duplicate)
      .map((p) => ({
        id: p.socketId,
        name: p.name,
        stream: remoteCam[p.socketId] || null,
        isLocal: false,
        isMuted: !!p.isMuted,
        isCameraOff: !!p.isCameraOff,
        isSpeaking: !!speaking[p.socketId],
        isSharing: Boolean(remoteScreen[p.socketId]),
        isHandRaised: !!p.isHandRaised,
      }));
    return [self, ...others];
  }, [localStream, localScreenStream, userName, peers, remoteCam, remoteScreen, speaking, isMicEnabled, isCameraEnabled, isHandRaised]);

  // ── spotlight screen? ──
  // Ưu tiên cao nhất: màn hình host GHIM CHO CẢ LỚP (giám sát thi). Học sinh
  // phải thấy đúng màn hình đó dù các em khác cũng đang chia sẻ.
  let screenStream: MediaStream | null = null;
  let screenName = '';
  let activeScreenOwnerId = '';
  if (examPinnedScreenId) {
    activeScreenOwnerId = examPinnedScreenId;
    if (examPinnedScreenId === 'self' || examPinnedScreenId === mySocketId || examPinnedScreenId === socket.id) {
      screenStream = localScreenStream;
      screenName = userName || 'Bạn';
    } else {
      screenStream = remoteScreen[examPinnedScreenId] || null;
      screenName = peers.find((p) => p.socketId === examPinnedScreenId)?.name || 'Học sinh';
    }
  }
  // Không có ghim của host → người đang chia sẻ chiếm spotlight
  // (khi đang giám sát thi, học sinh KHÔNG bao giờ xem màn hình của bạn khác — chỉ xem màn hình Host hoặc chính mình nếu muốn)
  const canShowPeerInSpotlight = (peerId: string) => {
    if (!examMonitoring || isHost) return true;
    return Boolean(hostId && peerId === hostId);
  };
  if (!screenStream && screenSharePeerId === 'self' && (!examMonitoring || isHost)) {
    activeScreenOwnerId = 'self';
    screenStream = localScreenStream;
    screenName = userName || 'Bạn';
  } else if (!screenStream && screenSharePeerId && canShowPeerInSpotlight(screenSharePeerId)) {
    activeScreenOwnerId = screenSharePeerId;
    screenStream = remoteScreen[screenSharePeerId] || null;
    screenName = peers.find((p) => p.socketId === screenSharePeerId)?.name || 'Người dùng';
  }
  const showingScreen = hasVideo(screenStream);

  // ── spotlight pinned camera? ──
  const pinnedCam = !showingScreen && pinnedPeerId
    ? cameras.find((c) => c.id === pinnedPeerId) || null
    : null;

  const togglePin = (id: string) => setPinnedPeerId(pinnedPeerId === id ? null : id);

  // GHI CHÚ: đã bỏ khối "chọn tầng simulcast theo kích thước ô" ở đây.
  // Lý do: nó gọi sfuService.setPeerVideoQuality() → event 'mediasoup:setPreferredLayers'
  // KHÔNG tồn tại trên SFU (đã kiểm chứng: timeout im lặng), và SFU gộp simulcast
  // về 1 luồng khi consume. Nên nó chưa bao giờ có tác dụng.
  // Chất lượng giờ do PHÍA NGƯỜI CHIA SẺ ép lúc encode (sfu.setScreenQuality).

  const renderFilmstrip = (items: Cam[]) => (
    <div className="flex-none flex gap-2 overflow-x-auto custom-scrollbar pb-1">
      {items.map((c) => (
        <div key={c.id} className="w-40 shrink-0">
          <VideoTile
            stream={c.stream} name={c.name} isLocal={c.isLocal}
            isMuted={c.isMuted} isCameraOff={c.isCameraOff} isSpeaking={c.isSpeaking}
            isSharing={c.isSharing} isHandRaised={c.isHandRaised} variant="filmstrip"
            onTogglePin={() => togglePin(c.id)} isPinned={pinnedPeerId === c.id}
            {...hearProps(c.id)}
          />
        </div>
      ))}
    </div>
  );

  // ── Chế độ spotlight (screen hoặc pinned) ──
  if (showingScreen || pinnedCam) {
    return (
      <div className="flex h-full w-full flex-col gap-3 bg-base p-3">
        <div className="relative min-h-0 flex-1 animate-fade-in">
          {showingScreen ? (
            <VideoTile
              stream={screenStream} name={screenName} isSharing
              fit="contain" variant="spotlight"
              {...hearProps(activeScreenOwnerId)}
            />
          ) : pinnedCam ? (
            <VideoTile
              stream={pinnedCam.stream} name={pinnedCam.name} isLocal={pinnedCam.isLocal}
              isMuted={pinnedCam.isMuted} isCameraOff={pinnedCam.isCameraOff}
              isSpeaking={pinnedCam.isSpeaking} isHandRaised={pinnedCam.isHandRaised} variant="spotlight"
              onTogglePin={() => togglePin(pinnedCam.id)} isPinned
              {...hearProps(pinnedCam.id)}
            />
          ) : null}
          {showingScreen && (
            <div className="absolute top-3 right-3 rounded-full bg-black/60 backdrop-blur px-3 py-1 text-xs font-medium text-white/90">
              Màn hình của {screenName}
            </div>
          )}
        </div>
        {renderFilmstrip(cameras)}
      </div>
    );
  }

  // ── Chế độ lưới tự tính — lấp đầy chiều cao pane để ô video to nhất có thể ──
  const n = cameras.length;
  const cols = n <= 1 ? 1 : n <= 6 ? 2 : n <= 12 ? 3 : 4;
  return (
    <div className="h-full w-full bg-base p-3">
      <div
        className="grid h-full gap-3"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridAutoRows: 'minmax(0, 1fr)',
        }}
      >
        {cameras.map((c) => (
          <VideoTile
            key={c.id}
            stream={c.stream} name={c.name} isLocal={c.isLocal}
            isMuted={c.isMuted} isCameraOff={c.isCameraOff} isSpeaking={c.isSpeaking}
            isSharing={c.isSharing} isHandRaised={c.isHandRaised} variant="grid"
            onTogglePin={() => togglePin(c.id)} isPinned={pinnedPeerId === c.id}
            {...hearProps(c.id)}
          />
        ))}
      </div>
    </div>
  );
};
