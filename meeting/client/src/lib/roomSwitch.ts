/**
 * switchRoom — chuyển phòng (lớp chính ⇄ phòng nhóm breakout) KHÔNG rời cuộc họp.
 */
import { socket } from '../services/socket';
import { sfuService } from '../services/sfu';
import { useMeetingStore } from '../store/useMeetingStore';
import { applyRoomJoinState, getHostSecret, getSessionToken } from './roomState';
import { toast } from '../store/useUiStore';

export const switchRoom = (target: string, name?: string, onDone?: (res: any) => void): void => {
  const st = useMeetingStore.getState();
  const cur = st.roomId;
  if (!target || target === cur) return;

  try { (window as any).__meetKeepStream = st.localStream || null; } catch { /* noop */ }
  try { if (cur) socket.emit('room:leave', { roomId: cur }); } catch { /* noop */ }
  try { sfuService.disconnect(); } catch { /* noop */ }

  const secret = getHostSecret(target) || getHostSecret(st.parentId || cur || '');

  socket.emit(
    'room:join',
    {
      roomId: target,
      name: st.userName,
      password: localStorage.getItem('meet:lastPass') || '',
      token: localStorage.getItem('token') || '',
      sessionToken: getSessionToken(),
      hostSecret: secret,
    },
    (res: any) => {
      if (res && res.ok) {
        try { st.setViewingPeerCode(null); } catch { /* noop */ }
        applyRoomJoinState(
          res,
          target,
          name || (res.isBreakout ? 'Phòng nhóm' : st.roomName || 'Cuộc họp'),
          st.userName || '',
        );
      } else {
        toast.error((res && res.error) || 'Không chuyển được phòng');
      }
      if (onDone) onDone(res);
    },
  );
};
