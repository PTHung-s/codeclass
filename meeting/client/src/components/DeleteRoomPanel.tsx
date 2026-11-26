/**
 * DeleteRoomPanel — bảng "Xóa phòng" cho host (trong tab Thông tin).
 * Nhập đúng mật khẩu phòng (nếu phòng có mật khẩu) → xác nhận xóa.
 * Server kiểm tra: đúng host + đúng mật khẩu → xóa + broadcast room:deleted.
 */
import React, { useState } from 'react';
import { Trash2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useMeetingStore } from '../store/useMeetingStore';
import { socket } from '../services/socket';
import { getHostSecret, removeHostSecret } from '../lib/roomState';

export const DeleteRoomPanel: React.FC = () => {
  const roomId = useMeetingStore((s) => s.roomId);
  const isHost = useMeetingStore((s) => s.isHost);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!isHost) {
    return (
      <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-xs text-gray-500 flex items-center gap-2">
        <ShieldCheck size={14} />
        Chỉ host mới có thể xóa phòng.
      </div>
    );
  }

  const handleDelete = () => {
    if (!roomId) return;
    setDeleting(true);
    setError('');
    socket.emit('room:delete', {
      roomId,
      password,
      token: localStorage.getItem('token') || '',
      hostSecret: getHostSecret(roomId),
    }, (res: { ok?: boolean; error?: string }) => {
      setDeleting(false);
      if (!res?.ok) {
        setError(res?.error || 'Không thể xóa phòng');
        return;
      }
      removeHostSecret(roomId);
      // server broadcast room:deleted → MeetingPage tự xử lý (reset + về lobby)
      setConfirming(false);
    });
  };

  return (
    <div className="rounded-2xl bg-red-950/20 p-5 border border-red-500/20">
      <h4 className="text-[10px] font-bold text-red-400 uppercase mb-2 tracking-widest flex items-center gap-1.5">
        <AlertTriangle size={12} />
        Vùng nguy hiểm
      </h4>
      <p className="text-xs text-gray-400 mb-3">
        Xóa phòng sẽ **mời tất cả mọi người ra khỏi phòng** và không thể hoàn tác.
      </p>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-sm font-bold transition-all border border-red-500/20"
        >
          <Trash2 size={14} />
          Xóa phòng
        </button>
      ) : (
        <div className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder="Nhập mật khẩu phòng (nếu có)"
            className="w-full bg-[#111] border border-red-500/30 focus:border-red-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none placeholder-gray-600"
            autoFocus
          />
          {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            >
              <Trash2 size={14} />
              {deleting ? 'Đang xóa...' : 'Xác nhận xóa'}
            </button>
            <button
              onClick={() => { setConfirming(false); setError(''); setPassword(''); }}
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-sm transition-all"
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
