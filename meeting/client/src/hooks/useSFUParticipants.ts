/**
 * useSFUParticipants — thay thế useParticipants của LiveKit trong chế độ SFU.
 *
 * Trả về mảng "participants" dạng tương thích tối thiểu mà các component cũ dùng:
 *   - p.identity: string  (socketId của peer)
 *   - p.isLocal: boolean
 *   - p.isMicrophoneEnabled: boolean
 *   - p.name: string
 *
 * Nguồn dữ liệu: store peers (signaling socket) + chính mình.
 * Là hook nên component vẫn re-render khi peers đổi.
 */
import { useMemo } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { socket } from '../services/socket';

export interface SFUParticipant {
  identity: string;
  isLocal: boolean;
  isMicrophoneEnabled: boolean;
  name: string;
  sid: string;
}

export const useSFUParticipants = (): SFUParticipant[] => {
  const peers = useMeetingStore((s) => s.peers);
  const userName = useMeetingStore((s) => s.userName);
  const isMicEnabled = useMeetingStore((s) => s.isMicEnabled);
  const mySocketId = useMeetingStore((s) => s.mySocketId) || socket.id;

  return useMemo(() => {
    const me: SFUParticipant = {
      identity: mySocketId || 'me',
      isLocal: true,
      isMicrophoneEnabled: isMicEnabled,
      name: userName || 'Bạn',
      sid: mySocketId || 'me',
    };
    const others: SFUParticipant[] = peers.map((p) => ({
      identity: p.socketId,
      isLocal: false,
      isMicrophoneEnabled: !p.isMuted,
      name: p.name,
      sid: p.socketId,
    }));
    return [me, ...others];
  }, [peers, userName, isMicEnabled, mySocketId]);
};
