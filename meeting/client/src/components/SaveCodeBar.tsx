/**
 * Nút "Lưu bài" + "Bài của tôi" cho HỌC SINH.
 *
 * Mục đích: học sinh cất bài lại theo tên, hôm sau (hoặc sau khi F5) mở lại
 * đúng bài cũ để xem/sửa/chạy tiếp. Giáo viên dùng dữ liệu này để chấm điểm
 * (xem nút xuất ZIP trong ExamMonitorPanel).
 *
 * LƯU 2 NƠI:
 *  - localStorage: mở lại được ngay cả khi mất mạng / server quên
 *  - server: để giáo viên xuất file chấm điểm (nguồn chính thống)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Save, FolderOpen, Trash2, X, Clock, FileCode2, Play, Check } from 'lucide-react';
import { socket } from '../services/socket';
import { useMeetingStore } from '../store/useMeetingStore';
import { uiConfirm } from '../store/useUiStore';

interface SavedItem {
  id: string;
  title: string;
  savedAt: number;
  lastOpenedAt?: number | null;
  runCount?: number;
  lines?: number;
}

/** Khoá localStorage tách theo phòng + TÊN người dùng (2 học sinh chung máy không đè nhau). */
const LS_USER = () => (localStorage.getItem('userName') || 'me').slice(0, 40);
const LS_KEY = (roomId: string) => `meet:savedCode:${roomId}:${LS_USER()}`;
const LS_CUR_KEY = (roomId: string) => `meet:currentSaved:${roomId}:${LS_USER()}`;

const fmt = (t: number) =>
  new Date(t).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

export const SaveCodeBar: React.FC = () => {
  const roomId = useMeetingStore((s) => s.roomId);
  const code = useMeetingStore((s) => s.code);
  const selectedLanguage = useMeetingStore((s) => s.selectedLanguage);
  const setCode = useMeetingStore((s) => s.setCode);
  const setSelectedLanguage = useMeetingStore((s) => s.setSelectedLanguage);
  const setCurrentSavedId = useMeetingStore((s) => s.setCurrentSavedId);
  const viewingPeerCode = useMeetingStore((s) => s.viewingPeerCode);

  const [items, setItems] = useState<SavedItem[]>([]);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState('');
  const [toast, setToast] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  /** id bài đang mở (để "Lưu" ghi đè thay vì tạo bài mới) */
  const [currentId, setCurrentId] = useState<string | null>(null);
  const lastNapRef = useRef<string>('');

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 2600);
  };

  // ── Nạp danh sách: ưu tiên server, không có mạng thì dùng localStorage ──
  const refresh = useCallback(() => {
    if (!roomId) return;
    socket.emit('code:mySaved', { roomId }, (res: any) => {
      if (res && res.ok && Array.isArray(res.items)) {
        setItems(res.items);
        try { localStorage.setItem(LS_KEY(roomId), JSON.stringify(res.items)); } catch { /* ignore */ }
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY(roomId));
          if (raw) setItems(JSON.parse(raw));
        } catch { /* ignore */ }
      }
    });
  }, [roomId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Nhớ tên bài đang mở để lần sau vào lại biết đang làm bài nào
  useEffect(() => {
    if (!roomId || lastNapRef.current === roomId) return;
    lastNapRef.current = roomId;
    try {
      const id = localStorage.getItem(LS_CUR_KEY(roomId));
      if (id) {
        setCurrentId(id);
        setCurrentSavedId(id);
      }
    } catch { /* ignore */ }
  }, [roomId, setCurrentSavedId]);

  const rememberCurrent = (id: string | null) => {
    setCurrentId(id);
    setCurrentSavedId(id);
    if (!roomId) return;
    try {
      if (id) localStorage.setItem(LS_CUR_KEY(roomId), id);
      else localStorage.removeItem(LS_CUR_KEY(roomId));
    } catch { /* ignore */ }
  };

  // ── LƯU: có currentId thì ghi đè, chưa có thì hỏi tên ──
  const doSave = (t: string, id: string | null) => {
    if (!roomId) return;
    socket.emit('code:save', {
      roomId, title: t, code, language: selectedLanguage, id: id || undefined,
    }, (res: any) => {
      if (res && res.ok) {
        rememberCurrent(res.id);
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 1600);
        flash(id ? `Đã cập nhật "${t}"` : `Đã lưu "${t}"`);
        refresh();
      } else {
        flash(res?.error || 'Không lưu được bài');
      }
    });
  };

  const onSaveClick = () => {
    if (!code.trim()) { flash('Chưa có code để lưu'); return; }
    if (currentId) {
      const cur = items.find((i) => i.id === currentId);
      doSave(cur?.title || 'Bài của tôi', currentId);
    } else {
      setTitle(`Bài ${items.length + 1} - ${new Date().toLocaleDateString('vi-VN')}`);
      setNaming(true);
    }
  };
  const onSaveClickRef = useRef(onSaveClick);
  onSaveClickRef.current = onSaveClick;

  useEffect(() => {
    const onShortcutSave = () => onSaveClickRef.current();
    window.addEventListener('meet:saveCode', onShortcutSave);
    return () => window.removeEventListener('meet:saveCode', onShortcutSave);
  }, []);

  const onSaveAsNew = () => {
    if (!code.trim()) { flash('Chưa có code để lưu'); return; }
    setTitle(`Bài ${items.length + 1} - ${new Date().toLocaleDateString('vi-VN')}`);
    setNaming(true);
  };

  const onOpenItem = (it: SavedItem) => {
    if (!roomId) return;
    socket.emit('code:open', { roomId, id: it.id }, (res: any) => {
      if (res && res.ok && res.item) {
        setCode(res.item.code || '');
        if (res.item.language) setSelectedLanguage(res.item.language);
        rememberCurrent(it.id);
        setOpen(false);
        flash(`Đã mở "${res.item.title}"`);
        socket.emit('code:sync', {
          roomId,
          code: res.item.code || '',
          language: res.item.language || selectedLanguage,
        });
      } else {
        flash(res?.error || 'Không mở được bài');
      }
    });
  };

  const onDelete = async (it: SavedItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!roomId) return;
    if (!(await uiConfirm(`Xoá bài "${it.title}"? Không lấy lại được.`, { title: 'Xoá bài đã lưu', danger: true }))) return;
    socket.emit('code:deleteSaved', { roomId, id: it.id }, (res: any) => {
      if (res && res.ok) {
        if (currentId === it.id) rememberCurrent(null);
        flash('Đã xoá bài');
        refresh();
      } else flash(res?.error || 'Không xoá được');
    });
  };

  // Giáo viên đang xem code học sinh thì ẩn đi (tránh lưu nhầm bài người khác)
  if (viewingPeerCode) return null;

  const current = items.find((i) => i.id === currentId);

  return (
    <div className="relative flex items-center gap-1.5 shrink-0">
      <button
        onClick={onSaveClick}
        className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded border px-2.5 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
          justSaved
            ? 'border-ok/60 bg-ok/25 text-ok'
            : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
        }`}
        title={current ? `Lưu đè lên bài "${current.title}" (Ctrl+S)` : 'Lưu bài này lại để hôm sau mở tiếp (Ctrl+S)'}
      >
        {justSaved ? <Check size={13} /> : <Save size={13} />}
        {justSaved ? 'Đã lưu' : 'Lưu'}
      </button>

      {current && (
        <button
          onClick={onSaveAsNew}
          className="shrink-0 whitespace-nowrap rounded border border-line-strong bg-elevated px-2 py-1.5 text-xs font-semibold text-white/80 transition-all hover:bg-white/10"
          title="Lưu thành một bài mới (không ghi đè bài hiện tại)"
        >
          Lưu mới
        </button>
      )}

      <button
        onClick={() => { setOpen((v) => !v); if (!open) refresh(); }}
        className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-line-strong bg-elevated px-2.5 py-1.5 text-xs font-semibold text-white/90 transition-all hover:bg-white/10"
        title="Danh sách bài đã lưu — mở lại để xem/sửa/chạy tiếp"
      >
        <FolderOpen size={13} />
        Bài lưu
        {items.length > 0 && (
          <span className="rounded-full bg-accent/25 px-1.5 text-[10px] text-accent">{items.length}</span>
        )}
      </button>

      {current && (
        <span className="hidden max-w-[9rem] truncate text-[10px] text-emerald-300/80 lg:inline" title={current.title}>
          đang làm: {current.title}
        </span>
      )}

      {/* Ô đặt tên khi lưu bài mới */}
      {naming && (
        <div className="anim-popover absolute right-0 top-full z-50 mt-2 w-72 rounded-ctl border border-line-strong bg-raised p-3 shadow-modal">
          <div className="mb-2 text-xs font-semibold text-white/90">Đặt tên cho bài</div>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setNaming(false); doSave(title, null); }
              if (e.key === 'Escape') setNaming(false);
            }}
            placeholder="VD: Bài 1 - Tính tổng"
            className="w-full rounded border border-line-strong bg-base px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setNaming(false)} className="rounded px-2.5 py-1 text-xs text-white/60 hover:text-white">Huỷ</button>
            <button
              onClick={() => { setNaming(false); doSave(title, null); }}
              className="rounded bg-accent px-3 py-1 text-xs font-semibold text-accent-ink hover:brightness-110"
            >
              Lưu
            </button>
          </div>
        </div>
      )}

      {/* Danh sách bài đã lưu */}
      {open && (
        <div className="anim-popover absolute right-0 top-full z-50 mt-2 max-h-80 w-80 overflow-y-auto rounded-ctl border border-line-strong bg-raised p-2 shadow-modal">
          <div className="flex items-center justify-between px-1.5 pb-2">
            <span className="text-xs font-semibold text-white/90">Bài đã lưu ({items.length})</span>
            <button onClick={() => setOpen(false)} className="text-white/50 hover:text-white"><X size={14} /></button>
          </div>

          {items.length === 0 && (
            <div className="px-2 py-6 text-center text-xs text-white/50">
              Chưa có bài nào.<br />Bấm <b className="text-emerald-300">Lưu bài</b> để cất bài đầu tiên.
            </div>
          )}

          {items.map((it) => (
            <div
              key={it.id}
              onClick={() => onOpenItem(it)}
              className={`group mb-1 cursor-pointer rounded border px-2.5 py-2 transition-all ${
                currentId === it.id
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : 'border-transparent hover:border-line-strong hover:bg-white/5'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <FileCode2 size={13} className="shrink-0 text-accent" />
                    <span className="truncate text-xs font-medium text-white">{it.title}</span>
                    {currentId === it.id && <span className="shrink-0 text-[9px] text-emerald-300">đang mở</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2.5 text-[10px] text-white/45">
                    <span className="flex items-center gap-1"><Clock size={10} />{fmt(it.savedAt)}</span>
                    {typeof it.lines === 'number' && <span>{it.lines} dòng</span>}
                    {!!it.runCount && <span className="flex items-center gap-1"><Play size={9} />{it.runCount} lần chạy</span>}
                  </div>
                </div>
                <button
                  onClick={(e) => onDelete(it, e)}
                  className="shrink-0 rounded p-1 text-white/35 opacity-0 transition-all hover:bg-danger/20 hover:text-danger group-hover:opacity-100"
                  title="Xoá bài này"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="absolute right-0 top-full z-50 mt-2 whitespace-nowrap rounded-ctl border border-emerald-500/40 bg-emerald-950/95 px-3 py-1.5 text-xs text-emerald-200 shadow-modal">
          {toast}
        </div>
      )}
    </div>
  );
};

export default SaveCodeBar;
