/**
 * SFUUserList — danh sách thành viên chế độ SFU.
 * Nguồn: store peers (signaling) + chính mình. Đã bỏ emoji, dùng lucide + token.
 * Host có: Xem code (ghim code học viên) + ▶ Playback (xem lại quá trình code).
 */
import React, { useState } from 'react';
import { Trophy, BarChart3, Code2, MicOff, ShieldCheck, ShieldAlert, Volume2, VolumeX, Play, Hand, Headphones } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { useMeetingStore } from '../store/useMeetingStore';
import { socket } from '../services/socket';
import { StudentAvatar } from './StudentAvatar';
import { emitAudioRouting, muteAllPeers, mutePeer, setAudioAll, togglePeerInGroup, toggleSoloPeer } from '../lib/audioActions';

const ActivityChart = ({ stats, userName, onClose }: { stats: any[]; userName: string; onClose: () => void }) => {
  const data = stats.slice(-20).map((s) => ({
    time: new Date(s.timestamp || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    added: Number(s.added || 0),
    deleted: Number(s.deleted || 0),
  }));
  return (
    <div className="fixed inset-0 z-[150] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-panel border border-line bg-overlay p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-white">Hoạt động code — {userName}</h3>
          <button onClick={onClose} className="text-muted hover:text-white">✕</button>
        </div>
        <div className="mb-3 text-xs text-muted">{stats.length} mốc được ghi nhận (20 mốc gần nhất)</div>
        {data.length > 0 ? (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <XAxis dataKey="time" stroke="#888" fontSize={10} />
                <YAxis stroke="#888" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2024', border: '1px solid #333', fontSize: 11 }} />
                <Bar dataKey="added" name="Ký tự thêm" fill="#34d399" radius={[3, 3, 0, 0]} />
                <Bar dataKey="deleted" name="Ký tự xóa" fill="#f87171" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-muted">Chưa có dữ liệu gõ code</div>
        )}
      </div>
    </div>
  );
};

export const SFUUserList: React.FC<{ onShowHistory: (socketId: string) => void }> = ({ onShowHistory }) => {
  const peers = useMeetingStore((s) => s.peers);
  const userName = useMeetingStore((s) => s.userName);
  const hostId = useMeetingStore((s) => s.hostId);
  const amHost = useMeetingStore((s) => s.isHost);
  const audioMode = useMeetingStore((s) => s.audioMode);
  const hearHost = useMeetingStore((s) => s.hearHost);
  const roomId = useMeetingStore((s) => s.roomId);
  const myPoints = useMeetingStore((s) => s.myPoints);
  const isHandRaised = useMeetingStore((s) => s.isHandRaised);

  const [selectedActivityPeer, setSelectedActivityPeer] = useState<{ stats: any[]; name: string } | null>(null);
  const [selectedViolationPeerId, setSelectedViolationPeerId] = useState<string | null>(null);
  const selectedViolationPeer = selectedViolationPeerId
    ? peers.find((p) => p.socketId === selectedViolationPeerId) || null
    : null;

  /** Host bấm "Xem code": xin code học viên + ghim theo dõi + tự mở tab code */
  const viewCode = (socketId: string) => {
    const st = useMeetingStore.getState();
    if (!st.peerCodes.has(socketId)) {
      socket.emit('code:request', { roomId: st.roomId, targetSocketId: socketId });
    }
    st.setViewingPeerCode(socketId);
    window.dispatchEvent(new CustomEvent('meet:selectTab', { detail: { tab: 'code' } }));
    onShowHistory(socketId);
  };

  /** Host bấm "▶ Playback": tải journal code rồi mở overlay phát lại */
  const playHistory = (p: { socketId: string; name: string }) => {
    socket.emit(
      'code:history',
      { roomId: useMeetingStore.getState().roomId, targetSocketId: p.socketId },
      (h: any) => {
        window.dispatchEvent(new CustomEvent('meet:playback', { detail: Object.assign({ name: p.name }, h || {}) }));
      },
    );
  };

  const sortedPeers = [...peers].sort((a, b) => (b.points || 0) - (a.points || 0));
  const rankOf = (socketId: string) => {
    const peer = peers.find((p) => p.socketId === socketId);
    if (!peer || (peer.points || 0) <= 0) return null;
    const idx = sortedPeers.findIndex((p) => p.socketId === socketId);
    return idx < 3 ? idx : null;
  };
  const rankStyle = ['text-accent', 'text-white/70', 'text-orange-400'];

  const orderedPeers = [...peers].sort((a, b) => Number(!!b.isHandRaised) - Number(!!a.isHandRaised));

  return (
    <div className="h-full flex-1 space-y-1.5 overflow-y-auto bg-raised p-3 custom-scrollbar">
      {selectedActivityPeer && (
        <ActivityChart stats={selectedActivityPeer.stats} userName={selectedActivityPeer.name} onClose={() => setSelectedActivityPeer(null)} />
      )}
      {selectedViolationPeer && (
        <div className="fixed inset-0 z-[150] grid place-items-center bg-black/70 p-4" onClick={() => setSelectedViolationPeerId(null)}>
          <div className="w-full max-w-md rounded-panel border border-line-strong bg-overlay p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-bold text-white text-sm truncate">
                <ShieldAlert size={15} className="text-danger shrink-0" />
                Nhật ký vi phạm — {selectedViolationPeer.name}
              </h3>
              <button onClick={() => setSelectedViolationPeerId(null)} className="text-muted hover:text-white">✕</button>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-danger">
                Rời tab/cửa sổ: {selectedViolationPeer.violations || 0}
              </span>
              <span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-warn">
                Dán code ngoài: {selectedViolationPeer.pasteCount || 0}
              </span>
            </div>
            <div className="max-h-64 space-y-1.5 overflow-y-auto custom-scrollbar pr-1">
              {(selectedViolationPeer.violationHistory || []).length === 0 ? (
                <p className="py-5 text-center text-xs text-muted">Chưa có mốc chi tiết.</p>
              ) : (
                [...(selectedViolationPeer.violationHistory || [])].reverse().map((v, idx) => (
                  <div key={idx} className="rounded-lg border border-line bg-raised px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-bold ${v.type === 'external-paste' ? 'text-warn' : 'text-danger'}`}>
                        {v.type === 'external-paste' ? 'Dán code ngoài' : v.type === 'tab-switch' ? 'Chuyển tab' : 'Rời cửa sổ'}
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        {new Date(v.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    {v.reason && <p className="mt-0.5 text-[11px] text-gray-300 break-words">{v.reason}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      <div className="mb-2 border-b border-line pb-2 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Đang trực tuyến ({peers.length + 1})
        </div>
        {amHost && peers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setAudioAll(roomId)}
              className={`rounded-ctl border px-2 py-1 text-[10px] font-semibold transition-colors ${
                audioMode === 'all' ? 'border-ok/40 bg-ok/15 text-ok' : 'border-line bg-overlay text-muted hover:text-white'
              }`}
            >
              Cả lớp nghe
            </button>
            <button
              onClick={() => emitAudioRouting(roomId, { mode: 'selected', allowed: [] })}
              className={`rounded-ctl border px-2 py-1 text-[10px] font-semibold transition-colors ${
                audioMode === 'selected' && hearHost.length === 0 ? 'border-danger/40 bg-danger/15 text-danger' : 'border-line bg-overlay text-muted hover:text-white'
              }`}
            >
              Tắt tiếng lớp
            </button>
            <button
              onClick={() => muteAllPeers(roomId)}
              className="rounded-ctl border border-line bg-overlay px-2 py-1 text-[10px] font-semibold text-danger hover:bg-danger/15 transition-colors"
              title="Tắt mic toàn bộ học sinh"
            >
              Tắt mic lớp
            </button>
          </div>
        )}
      </div>

      {/* Chính mình */}
      <div className="flex items-center gap-3 rounded-card bg-accent/10 p-2 border border-accent/20">
        <StudentAvatar name={userName || 'B'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="truncate text-sm font-semibold text-white">{userName || 'Bạn'}</span>
            <span className="rounded bg-accent/20 px-1 text-[9px] font-bold uppercase text-accent">Bạn</span>
            {isHandRaised && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold text-accent-ink">
                <Hand size={10} /> Giơ tay
              </span>
            )}
            {myPoints !== 0 && (
              <span className={`text-[10px] font-bold ${myPoints > 0 ? 'text-ok' : 'text-danger'}`}>
                {myPoints > 0 ? `+${myPoints}` : myPoints} LP
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Peers khác */}
      {orderedPeers.map((peer) => {
        const rank = rankOf(peer.socketId);
        const isHost = hostId === peer.socketId;
        const hears = audioMode === 'all' || hearHost.includes(peer.socketId);
        const isSolo = audioMode === 'selected' && hearHost.length === 1 && hearHost[0] === peer.socketId;
        return (
          <div key={peer.socketId} className={`group flex items-center gap-3 rounded-card p-2 transition-colors hover:bg-line ${isSolo ? 'border border-ok/40 bg-ok/5' : peer.isHandRaised ? 'border border-accent/40 bg-accent/5' : ''}`}>
            <div className="relative">
              <StudentAvatar name={peer.name || '?'} />
              {rank !== null && (
                <Trophy size={12} className={`absolute -bottom-1 -right-1 rounded-full bg-raised p-[1px] ${rankStyle[rank]}`} />
              )}
              {((peer.violations || 0) > 0 || (peer.pasteCount || 0) > 0) && (
                <button
                  type="button"
                  onClick={() => amHost && setSelectedViolationPeerId(peer.socketId)}
                  className="absolute -right-1 -top-1 grid h-4 min-w-4 px-0.5 place-items-center rounded-full bg-danger text-[9px] font-bold text-white ring-2 ring-raised hover:brightness-110"
                  title={amHost ? `Vi phạm: ${peer.violations || 0}, Paste: ${peer.pasteCount || 0} (bấm xem chi tiết)` : `Vi phạm: ${peer.violations || 0}`}
                >
                  {(peer.violations || 0) + (peer.pasteCount || 0)}
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="truncate text-sm font-semibold text-white">{peer.name}</span>
                {isHost && <ShieldCheck size={12} className="shrink-0 text-accent" />}
                {peer.isHandRaised && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold text-accent-ink" title="Đang giơ tay">
                    <Hand size={10} /> Giơ tay
                  </span>
                )}
                {peer.points !== undefined && peer.points !== 0 && (
                  <span className={`text-[10px] font-bold ${peer.points > 0 ? 'text-ok' : 'text-danger'}`}>
                    {peer.points > 0 ? `+${peer.points}` : peer.points} LP
                  </span>
                )}
              </div>
              {Boolean(peer.isMuted) && (
                <span className="flex items-center gap-1 text-[10px] text-muted"><MicOff size={10} /> Đã tắt mic</span>
              )}
              {isHost ? (
                <span className="text-[10px] text-muted">Người chủ phòng</span>
              ) : amHost ? (
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${isSolo ? 'text-ok' : hears ? 'text-accent' : 'text-muted'}`}>
                  {isSolo ? <Headphones size={11} /> : hears ? <Volume2 size={11} /> : <VolumeX size={11} />}
                  {isSolo ? 'Đang nói riêng 1-1' : audioMode === 'all' ? 'Nghe cả lớp' : hears ? 'Trong nhóm nghe' : 'Không nghe được bạn'}
                </span>
              ) : audioMode === 'selected' && hears ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent">
                  <Volume2 size={11} /> Đang bật mic nghe host
                </span>
              ) : null}
            </div>
            <div className={`flex items-center gap-0.5 transition-opacity ${isSolo ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
              {amHost && !isHost && (
                <>
                  <button
                    onClick={() => toggleSoloPeer(roomId, peer.socketId, peer.name)}
                    className={`grid h-7 w-7 place-items-center rounded-ctl transition-colors ${isSolo ? 'bg-ok text-black' : 'text-muted hover:bg-line hover:text-accent'}`}
                    title={isSolo ? 'Trả về cả lớp' : `Nói riêng 1-1 với ${peer.name}`}
                  >
                    <Headphones size={14} />
                  </button>
                  <button
                    onClick={() => togglePeerInGroup(roomId, peer.socketId)}
                    className={`grid h-7 w-7 place-items-center rounded-ctl transition-colors ${hears ? 'text-accent hover:bg-line' : 'text-muted hover:bg-line hover:text-white'}`}
                    title={hears ? 'Bỏ khỏi nhóm nghe' : 'Thêm vào nhóm nghe'}
                  >
                    {hears ? <Volume2 size={14} /> : <VolumeX size={14} />}
                  </button>
                  {!peer.isMuted && (
                    <button
                      onClick={() => mutePeer(roomId, peer.socketId, peer.name)}
                      className="grid h-7 w-7 place-items-center rounded-ctl text-muted hover:bg-danger/20 hover:text-danger"
                      title={`Tắt mic ${peer.name}`}
                    >
                      <MicOff size={14} />
                    </button>
                  )}
                </>
              )}
              {Boolean(peer.activityStats?.length) && (
                <button onClick={() => setSelectedActivityPeer({ stats: peer.activityStats!, name: peer.name })} className="grid h-7 w-7 place-items-center rounded-ctl text-muted hover:bg-line hover:text-white" title="Xem hoạt động">
                  <BarChart3 size={15} />
                </button>
              )}
              {amHost && (
                <>
                  <button onClick={() => viewCode(peer.socketId)} className="grid h-7 w-7 place-items-center rounded-ctl text-muted hover:bg-line hover:text-white" title="Xem code (ghim theo dõi)">
                    <Code2 size={15} />
                  </button>
                  <button onClick={() => playHistory({ socketId: peer.socketId, name: peer.name })} className="grid h-7 w-7 place-items-center rounded-ctl text-muted hover:bg-line hover:text-white" title="Playback quá trình code">
                    <Play size={15} />
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
