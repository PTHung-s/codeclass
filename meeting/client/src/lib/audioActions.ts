/**
 * Helpers điều khiển định tuyến âm thanh cho Host:
 *  - Cả lớp (`mode: 'all'`)
 *  - Nói riêng 1-1 (`toggleSoloPeer`)
 *  - Gom nhóm âm thanh (`togglePeerInGroup`, `setSelectedAllowed`, `saveAudioGroups`)
 *  - Tắt mic học sinh / cả lớp (`mutePeer`, `muteAllPeers`)
 */
import { socket } from '../services/socket';
import { useMeetingStore } from '../store/useMeetingStore';
import type { AudioGroup } from '../types';
import { showActionHud, toast } from '../store/useUiStore';
import { playSoundCue } from './soundCue';

export function emitAudioRouting(
  roomId: string | null,
  payload: { mode: 'all' | 'selected'; allowed?: string[]; hostFocus?: boolean },
): void {
  if (!roomId) return;
  const st = useMeetingStore.getState();
  const nextFocus = payload.hostFocus !== undefined ? payload.hostFocus : st.hostFocus;
  const nextAllowed = payload.allowed !== undefined ? payload.allowed : st.hearHost;
  st.setAudioState({
    mode: payload.mode,
    allowed: nextAllowed,
    hostFocus: nextFocus,
  });
  socket.emit(
    'audio:setAllowed',
    {
      roomId,
      mode: payload.mode,
      allowed: nextAllowed,
      hostFocus: nextFocus,
    },
    (res: any) => {
      if (res && res.error) toast.error(res.error);
    },
  );
}

export function setAudioAll(roomId: string | null): void {
  emitAudioRouting(roomId, { mode: 'all', hostFocus: false });
  playSoundCue('solo');
  showActionHud('🔊 Đã mở âm thanh cho cả lớp', 'ok');
}

export function isSoloPeer(socketId: string): boolean {
  const { audioMode, hearHost } = useMeetingStore.getState();
  return audioMode === 'selected' && hearHost.length === 1 && hearHost[0] === socketId;
}

export function toggleSoloPeer(roomId: string | null, socketId: string, peerName?: string): void {
  if (!roomId || !socketId) return;
  if (isSoloPeer(socketId)) {
    setAudioAll(roomId);
  } else {
    emitAudioRouting(roomId, { mode: 'selected', allowed: [socketId] });
    playSoundCue('solo');
    showActionHud(`🎧 Đang nói riêng 1-1 với ${peerName || 'học viên'}`, 'accent');
  }
}

export function togglePeerInGroup(roomId: string | null, socketId: string): void {
  if (!roomId || !socketId) return;
  const st = useMeetingStore.getState();
  const base = st.audioMode === 'all'
    ? st.peers.filter((p) => p.socketId !== st.hostId).map((p) => p.socketId)
    : st.hearHost;
  const next = base.includes(socketId)
    ? base.filter((id) => id !== socketId)
    : [...base, socketId];
  emitAudioRouting(roomId, { mode: 'selected', allowed: next });
}

export function saveAudioGroups(roomId: string | null, groups: AudioGroup[]): void {
  if (!roomId) return;
  useMeetingStore.getState().setAudioState({ groups });
  socket.emit('audio:saveGroups', { roomId, groups }, (res: any) => {
    if (res && res.error) toast.error(res.error);
  });
}

export function mutePeer(roomId: string | null, targetSocketId: string, name?: string): void {
  if (!roomId || !targetSocketId) return;
  socket.emit('audio:mutePeer', { roomId, targetSocketId }, (res: any) => {
    if (res && res.error) toast.error(res.error);
    else toast.info(`Đã tắt mic của ${name || 'học viên'}`);
  });
}

export function muteAllPeers(roomId: string | null): void {
  if (!roomId) return;
  socket.emit('audio:muteAll', { roomId }, (res: any) => {
    if (res && res.error) toast.error(res.error);
    else toast.info(`Đã tắt mic ${res?.count || 0} học viên`);
  });
}
