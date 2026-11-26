import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Headphones, Users, Hand, MicOff, Plus, Trash2, Check, Eye } from 'lucide-react';
import { useMeetingStore } from '../store/useMeetingStore';
import { emitAudioRouting, muteAllPeers, saveAudioGroups, setAudioAll } from '../lib/audioActions';
import { toast } from '../store/useUiStore';

export const AudioRoutingControl: React.FC = () => {
  const isHost = useMeetingStore((s) => s.isHost);
  const hostId = useMeetingStore((s) => s.hostId);
  const mySocketId = useMeetingStore((s) => s.mySocketId);
  const roomId = useMeetingStore((s) => s.roomId);
  const peers = useMeetingStore((s) => s.peers);
  const audioMode = useMeetingStore((s) => s.audioMode);
  const hearHost = useMeetingStore((s) => s.hearHost);
  const hostFocus = useMeetingStore((s) => s.hostFocus);
  const audioGroups = useMeetingStore((s) => s.audioGroups);

  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const students = peers.filter((p) => p.socketId !== hostId);
  const activeSet = new Set(hearHost);

  // ─── Phía HỌC SINH: chỉ hiện badge khi Host đang bật chế độ riêng/nhóm ───
  if (!isHost) {
    if (audioMode === 'all') return null;
    const iAmIncluded = !!mySocketId && activeSet.has(mySocketId);
    if (iAmIncluded && hearHost.length === 1) {
      return (
        <span
          className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/20 border border-accent/40 px-2.5 py-0.5 text-[11px] font-semibold text-accent whitespace-nowrap"
          title="Giáo viên đang trao đổi riêng với bạn"
        >
          <Headphones size={12} /> Nói riêng với Host
        </span>
      );
    }
    if (iAmIncluded) {
      return (
        <span
          className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/15 border border-accent/30 px-2.5 py-0.5 text-[11px] font-semibold text-accent whitespace-nowrap"
          title="Bạn đang trong nhóm âm thanh cùng giáo viên"
        >
          <Users size={12} /> Nhóm ({hearHost.length})
        </span>
      );
    }
    return (
      <span
        className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full bg-elevated border border-line px-2.5 py-0.5 text-[11px] text-muted whitespace-nowrap"
        title="Giáo viên đang trao đổi riêng với học sinh/nhóm khác"
      >
        <VolumeX size={12} /> Host nói riêng
      </span>
    );
  }

  // ─── Phía HOST ───
  const soloPeer = audioMode === 'selected' && hearHost.length === 1
    ? students.find((p) => p.socketId === hearHost[0])
    : null;

  const pillClass =
    audioMode === 'all'
      ? 'bg-ok/15 text-ok border-ok/30 hover:bg-ok/25'
      : hearHost.length === 0
        ? 'bg-danger/15 text-danger border-danger/30 hover:bg-danger/25'
        : 'bg-accent/20 text-accent border-accent/40 hover:bg-accent/30';

  const pillLabel =
    audioMode === 'all'
      ? 'Cả lớp'
      : soloPeer
        ? `Riêng: ${soloPeer.name}`
        : hearHost.length > 0
          ? `Nhóm (${hearHost.length})`
          : 'Đang tắt lớp';

  const handleSelectHands = () => {
    const raised = students.filter((p) => p.isHandRaised).map((p) => p.socketId);
    if (raised.length === 0) {
      toast.info('Hiện chưa có học viên nào giơ tay.');
      return;
    }
    emitAudioRouting(roomId, { mode: 'selected', allowed: raised });
    toast.info(`Đang nói chuyện với ${raised.length} bạn giơ tay`);
  };

  const handleSaveGroup = () => {
    const clean = groupName.trim();
    if (!clean) {
      toast.warning('Nhập tên nhóm trước khi lưu');
      return;
    }
    const members = audioMode === 'all' ? students.map((s) => s.socketId) : hearHost;
    if (members.length === 0) {
      toast.warning('Chọn ít nhất 1 học viên để lưu thành nhóm');
      return;
    }
    const next = [
      ...audioGroups,
      { id: `grp_${Date.now()}`, name: clean.slice(0, 40), memberIds: members },
    ];
    saveAudioGroups(roomId, next);
    setGroupName('');
    toast.success(`Đã lưu nhóm "${clean}" (${members.length} em)`);
  };

  const handleDeleteGroup = (id: string) => {
    saveAudioGroups(roomId, audioGroups.filter((g) => g.id !== id));
  };

  return (
    <div ref={wrapRef} className="relative flex items-center gap-1 shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95 whitespace-nowrap ${pillClass}`}
        title="Điều khiển ai nghe được bạn (Cả lớp / Nói riêng 1-1 / Nhóm âm thanh)"
      >
        {audioMode === 'all' ? <Volume2 size={13} /> : soloPeer ? <Headphones size={13} /> : <Users size={13} />}
        <span className="max-w-[110px] truncate">{pillLabel}</span>
      </button>

      {audioMode === 'selected' && (
        <button
          onClick={() => setAudioAll(roomId)}
          className="hidden sm:inline-flex items-center rounded-full border border-line-strong bg-elevated px-2 py-1 text-[10px] font-bold text-white/85 transition-all hover:border-ok hover:text-ok active:scale-95 whitespace-nowrap"
          title="Trả âm thanh về toàn lớp (Alt+A)"
        >
          Cả lớp
        </button>
      )}

      {open && (
        <div className="anim-popover absolute right-0 top-full z-50 mt-2 w-80 max-w-[92vw] rounded-card border border-line-strong bg-overlay p-3 shadow-modal space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
              Định tuyến âm thanh
            </span>
            <span className="text-[10px] text-muted">
              {audioMode === 'all' ? 'Tất cả cùng nghe' : `${hearHost.length}/${students.length} em`}
            </span>
          </div>

          {/* Tác vụ nhanh */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setAudioAll(roomId)}
              className={`flex items-center justify-center gap-1.5 rounded-ctl border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                audioMode === 'all'
                  ? 'border-ok/40 bg-ok/15 text-ok'
                  : 'border-line bg-raised text-white/85 hover:bg-elevated'
              }`}
            >
              <Volume2 size={13} /> Cả lớp
            </button>
            <button
              onClick={() => emitAudioRouting(roomId, { mode: 'selected', allowed: [] })}
              className={`flex items-center justify-center gap-1.5 rounded-ctl border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                audioMode === 'selected' && hearHost.length === 0
                  ? 'border-danger/40 bg-danger/15 text-danger'
                  : 'border-line bg-raised text-white/85 hover:bg-elevated'
              }`}
            >
              <VolumeX size={13} /> Tắt lớp
            </button>
            <button
              onClick={handleSelectHands}
              className="flex items-center justify-center gap-1.5 rounded-ctl border border-line bg-raised px-2.5 py-1.5 text-xs font-semibold text-accent hover:bg-elevated"
              title="Chỉ nói chuyện với những bạn đang giơ tay"
            >
              <Hand size={13} /> Người giơ tay
            </button>
            <button
              onClick={() => muteAllPeers(roomId)}
              className="flex items-center justify-center gap-1.5 rounded-ctl border border-line bg-raised px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger/15"
              title="Tắt mic toàn bộ học sinh trong phòng"
            >
              <MicOff size={13} /> Tắt mic lớp
            </button>
          </div>

          {/* Chế độ Focus cho Host */}
          {audioMode === 'selected' && (
            <label className="flex cursor-pointer items-center justify-between rounded-ctl border border-line bg-raised px-2.5 py-2 text-xs">
              <span className="flex items-center gap-1.5 text-white/90">
                <Eye size={13} className="text-accent" />
                Chỉ nghe nhóm đang nói (Focus)
              </span>
              <input
                type="checkbox"
                checked={hostFocus}
                onChange={(e) =>
                  emitAudioRouting(roomId, {
                    mode: 'selected',
                    allowed: hearHost,
                    hostFocus: e.target.checked,
                  })
                }
                className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
              />
            </label>
          )}

          {/* Danh sách chọn nhanh từng học viên (Nói riêng 1-1 hoặc tick vào nhóm) */}
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Chọn nhanh học viên ({students.length})
            </div>
            {students.length === 0 ? (
              <div className="rounded-ctl bg-raised px-3 py-2 text-center text-[11px] text-muted">
                Chưa có học viên nào trong phòng
              </div>
            ) : (
              <div className="max-h-36 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                {students.map((s) => {
                  const selected = audioMode === 'all' || activeSet.has(s.socketId);
                  const isSolo = audioMode === 'selected' && hearHost.length === 1 && hearHost[0] === s.socketId;
                  return (
                    <div
                      key={s.socketId}
                      className="flex items-center justify-between rounded-ctl bg-raised px-2 py-1 text-xs"
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            const base = audioMode === 'all' ? students.map((p) => p.socketId) : hearHost;
                            const next = base.includes(s.socketId)
                              ? base.filter((id) => id !== s.socketId)
                              : [...base, s.socketId];
                            emitAudioRouting(roomId, { mode: 'selected', allowed: next });
                          }}
                          className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
                        />
                        <span className="truncate text-white/90">{s.name}</span>
                        {s.isHandRaised && <Hand size={11} className="shrink-0 text-accent" />}
                      </label>
                      <button
                        onClick={() =>
                          isSolo
                            ? setAudioAll(roomId)
                            : emitAudioRouting(roomId, { mode: 'selected', allowed: [s.socketId] })
                        }
                        className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                          isSolo
                            ? 'bg-accent text-accent-ink'
                            : 'bg-elevated text-muted hover:text-white'
                        }`}
                        title={isSolo ? 'Bấm để trả về cả lớp' : `Nói riêng 1-1 với ${s.name}`}
                      >
                        {isSolo ? 'Đang 1-1' : '1-1'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Nhóm âm thanh đã lưu */}
          <div className="space-y-2 border-t border-line pt-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Nhóm âm thanh ({audioGroups.length})
            </div>

            {audioGroups.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {audioGroups.map((g) => {
                  const isActiveGroup =
                    audioMode === 'selected' &&
                    g.memberIds.length > 0 &&
                    g.memberIds.length === hearHost.length &&
                    g.memberIds.every((id) => activeSet.has(id));
                  return (
                    <div
                      key={g.id}
                      className={`inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1 py-0.5 text-[11px] font-semibold ${
                        isActiveGroup
                          ? 'border-accent bg-accent/20 text-accent'
                          : 'border-line-strong bg-raised text-white/85'
                      }`}
                    >
                      <button
                        onClick={() => emitAudioRouting(roomId, { mode: 'selected', allowed: g.memberIds })}
                        className="flex items-center gap-1 hover:text-white"
                        title={`Bật âm thanh cho nhóm "${g.name}" (${g.memberIds.length} em)`}
                      >
                        {isActiveGroup && <Check size={11} />}
                        <span>{g.name}</span>
                        <span className="text-[10px] opacity-70">({g.memberIds.length})</span>
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(g.id)}
                        className="rounded-full p-0.5 text-muted hover:text-danger"
                        title="Xóa nhóm này"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-1.5">
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveGroup(); }}
                placeholder="Lưu danh sách chọn thành nhóm…"
                className="min-w-0 flex-1 rounded-ctl border border-line bg-base px-2.5 py-1 text-[11px] text-white outline-none focus:border-accent"
              />
              <button
                onClick={handleSaveGroup}
                className="flex shrink-0 items-center gap-1 rounded-ctl bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-ink hover:brightness-110"
                title="Lưu các bạn đang chọn thành 1 nhóm âm thanh"
              >
                <Plus size={12} /> Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioRoutingControl;
