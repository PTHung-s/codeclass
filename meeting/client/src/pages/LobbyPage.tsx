import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../services/socket';
import { apiUrl } from '../services/apiBase';
import { useMeetingStore } from '../store/useMeetingStore';
import { applyRoomJoinState, getHostSecret, getSessionToken, isDefaultCodeSnippet, removeHostSecret, saveHostSecret } from '../lib/roomState';
import { Camera, Mic, MicOff, VideoOff, Users, Lock, ShieldCheck, Loader2 } from 'lucide-react';
import { toast, uiConfirm, uiPrompt } from '../store/useUiStore';

const LobbyPage: React.FC = () => {
  const [roomName, setRoomName] = useState('');
  const [userName, setUserName] = useState(() => {
    try { return localStorage.getItem('userName') || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const {
    setMicEnabled,
    setCameraEnabled,
    setCc,
    cc,
    selectedMicId,
    selectedCamId,
    setSelectedMicId,
    setSelectedCamId,
  } = useMeetingStore();

  const [rooms, setRooms] = useState<Array<{ id: string; name: string; hostName: string; locked: boolean; size: number }>>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastMediaError = useRef<string | null>(null);
  const userNameRef = useRef(userName);
  userNameRef.current = userName;
  const joinRoomRef = useRef<((id: string, name: string, forcedPassword?: string) => void) | null>(null);

  // Auto-fill room ID from URL if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomIdParam = params.get('room');
    if (roomIdParam) {
      setRoomName(roomIdParam);
    }
  }, []);

  // ─── SSO CodeClass: nhận diện người dùng + tự vào lại phòng lần trước ───
  useEffect(() => {
    (async () => {
      // TỰ VÀO LẠI PHÒNG khi F5 — phải chạy cho MỌI học sinh, kể cả ẩn danh.
      // Trước đây khối này nằm sau `if (!tk) return;` nên học sinh không có tài
      // khoản CodeClass bị đẩy về sảnh sau khi tải lại trang, mất luôn yêu cầu
      // chia sẻ màn hình (đang thi mà F5 là mất giám sát).
      const tk = localStorage.getItem('token');
      const rp = new URLSearchParams(window.location.search).get('room')
        || localStorage.getItem('meet:lastRoom');
      const autoRejoin = () => {
        if (!rp) return;
        const savedPass = localStorage.getItem('meet:lastPass') || '';
        setTimeout(() => {
          try { joinRoomRef.current?.(rp, 'Cuộc họp', savedPass); } catch { /* noop */ }
        }, 250);
      };

      if (!tk) { autoRejoin(); return; }   // ẩn danh: vẫn tự vào lại
      try {
        const pr = await (await fetch(apiUrl('/api/profile'), { headers: { Authorization: 'Bearer ' + tk } })).json();
        if (pr && pr.user) {
          setUserName((u: string) => {
            const next = u || pr.user.name || '';
            userNameRef.current = next;
            return next;
          });
          setCc(pr.user);
        }
      } catch { /* không có SSO → dùng luồng ẩn danh cũ */ }
      // Có hồ sơ hay không thì vẫn phải vào lại phòng đang học
      autoRejoin();
    })();
  }, []);

  // Fetch room list on mount and listen for updates
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetch(apiUrl("/api/rooms"));
        const data = await res.json();
        setRooms(data.rooms || []);
      } catch (e) {
        console.error('Failed to fetch rooms:', e);
      } finally {
        setRoomsLoading(false);
      }
    };
    fetchRooms();

    if (!socket.connected) socket.connect();
    socket.on('room:list', (roomList) => {
      setRooms(roomList || []);
      setRoomsLoading(false);
    });
    return () => { socket.off('room:list'); };
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let active = true;
    const refreshDevices = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const devs = await navigator.mediaDevices.enumerateDevices();
        if (!active) return;
        setMics(devs.filter((d) => d.kind === 'audioinput'));
        setCams(devs.filter((d) => d.kind === 'videoinput'));
      } catch { /* noop */ }
    };

    const startPreview = async () => {
      const tryGetMedia = async (constraints: MediaStreamConstraints) => {
        try {
          return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e: any) {
          // Ghi nhận nguyên nhân thật (NotFoundError = không có thiết bị, NotAllowedError = chặn quyền…)
          lastMediaError.current = e?.name || e?.message || String(e);
          return null;
        }
      };

      const videoConstraint: boolean | MediaTrackConstraints = !isVideoOff
        ? selectedCamId
          ? { width: 1280, height: 720, deviceId: { ideal: selectedCamId } }
          : { width: 1280, height: 720 }
        : false;
      const audioConstraint: boolean | MediaTrackConstraints = !isMuted
        ? selectedMicId
          ? { echoCancellation: true, noiseSuppression: true, deviceId: { ideal: selectedMicId } }
          : true
        : false;

      try {
        // 1. Gửi cấu hình đầy đủ
        stream = await tryGetMedia({
          video: videoConstraint,
          audio: audioConstraint,
        });

        // 2. Fallback sang chỉ Audio (nếu Video lỗi)
        if (!stream && !isVideoOff) {
          stream = await tryGetMedia({ video: false, audio: audioConstraint });
        }

        // 3. Fallback sang chỉ Video (nếu Audio lỗi)
        if (!stream && !isMuted) {
          stream = await tryGetMedia({ video: videoConstraint, audio: false });
        }

        if (!active) {
          stream?.getTracks().forEach((t) => t.stop());
          return;
        }
        if (stream) {
          setPreviewStream(stream);
          setMediaError(null);
        } else {
          setPreviewStream(null);
          const reason = lastMediaError.current || 'unknown';
          setMediaError(reason);
        }
        await refreshDevices();
      } catch (err) {
        console.error('Critical error in startPreview:', err);
      }
    };
    void startPreview();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [isVideoOff, isMuted, selectedMicId, selectedCamId]);

  useEffect(() => {
    if (videoRef.current && previewStream) {
      videoRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  // Mic RMS level meter cho Lobby preview
  useEffect(() => {
    if (!previewStream || isMuted || previewStream.getAudioTracks().length === 0) {
      setMicLevel(0);
      return;
    }
    let audioCtx: AudioContext | null = null;
    let iv: ReturnType<typeof setInterval> | null = null;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      const source = audioCtx.createMediaStreamSource(new MediaStream(previewStream.getAudioTracks()));
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      iv = setInterval(() => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        setMicLevel(Math.min(100, Math.round((rms / 70) * 100)));
      }, 120);
    } catch {
      setMicLevel(0);
    }
    return () => {
      if (iv) clearInterval(iv);
      audioCtx?.close().catch(() => {});
      setMicLevel(0);
    };
  }, [previewStream, isMuted]);

  const handleCreateRoom = async () => {
    if (busy) return;
    if (!roomName.trim() || !userName.trim()) {
      toast.warning('Vui lòng nhập tên phòng và tên của bạn');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(apiUrl('/api/rooms'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName.trim(), password, hostName: userName.trim() }),
      });

      if (!res.ok) {
        const text = await res.text();
        toast.error(`Lỗi Server (${res.status}): ${text}`);
        setBusy(false);
        return;
      }

      const data = await res.json();
      if (data.id) {
        if (data.hostSecret) saveHostSecret(data.id, data.hostSecret);
        await joinRoom(data.id, roomName.trim());
      } else {
        setBusy(false);
      }
    } catch {
      toast.error('Không kết nối được server để tạo phòng');
      setBusy(false);
    }
  };

  const handleJoinByInput = () => {
    if (busy) return;
    if (!userName.trim()) { toast.warning('Vui lòng nhập tên của bạn'); return; }
    if (!roomName.trim()) { toast.warning('Vui lòng nhập mã phòng'); return; }
    
    // Tự động tách ID nếu người dùng dán cả link
    let finalRoomId = roomName.trim();
    try {
      if (roomName.includes('?room=')) {
        const url = new URL(roomName.startsWith('http') ? roomName : `http://${roomName}`);
        const idFromUrl = url.searchParams.get('room');
        if (idFromUrl) finalRoomId = idFromUrl;
      } else if (roomName.includes('/')) {
        // Trường hợp dán link dạng path (nếu có)
        const parts = roomName.split('/');
        finalRoomId = parts[parts.length - 1] || roomName;
      }
    } catch (e) {
      console.error('Lỗi phân tách Room ID:', e);
    }

    void joinRoom(finalRoomId.trim(), 'Cuộc họp');
  };

  const joinRoom = async (id: string, name: string, forcedPassword?: string) => {
    setBusy(true);
    try {
      if (!socket.connected || !socket.id) {
        socket.connect();
        await new Promise((resolve) => {
          if (socket.id) resolve(true);
          else socket.once('connect', () => resolve(true));
        });
      }

      const effectiveName = (userNameRef.current || localStorage.getItem('userName') || '').trim() || 'Ẩn danh';
      try { localStorage.setItem('userName', effectiveName); } catch { /* noop */ }

      // Lưu trạng thái Mic/Camera vào Store trước khi mount MeetingPage
      setMicEnabled(!isMuted);
      setCameraEnabled(!isVideoOff);

      const pw = forcedPassword !== undefined ? forcedPassword : password;
      const fallbackParent = localStorage.getItem('meet:lastParentRoom');
      socket.emit('room:join', {
        roomId: id,
        name: effectiveName,
        password: pw,
        token: localStorage.getItem('token') || '',
        sessionToken: getSessionToken(),
        hostSecret: getHostSecret(id) || getHostSecret(fallbackParent),
      }, async (res: any) => {
        if (res && res.ok) {
          try { localStorage.setItem('meet:lastPass', pw || ''); } catch { /* noop */ }
          applyRoomJoinState(res, id, name, effectiveName);
          // Sync ngay code local nếu đã có sẵn bài đang gõ khác mặc định
          setTimeout(() => {
            const cur = useMeetingStore.getState();
            if (cur.roomId === id && !isDefaultCodeSnippet(cur.code)) {
              socket.emit('code:sync', {
                roomId: id,
                code: cur.code,
                language: cur.selectedLanguage,
              });
            }
          }, 800);
        } else if (res && /mật khẩu/i.test(res.error || '')) {
          setBusy(false);
          const pw2 = await uiPrompt('Phòng này có mật khẩu. Nhập mật khẩu phòng:', {
            title: 'Mật khẩu phòng',
            inputType: 'password',
            placeholder: 'Nhập mật khẩu…',
            confirmLabel: 'Tham gia',
          });
          if (pw2) void joinRoom(id, name, pw2);
        } else {
          setBusy(false);
          try {
            if (localStorage.getItem('meet:lastRoom') === id) {
              localStorage.removeItem('meet:lastRoom');
            }
          } catch { /* noop */ }
          toast.error(res?.error || 'Lỗi tham gia phòng');
        }
      });

    } catch (err) {
      setBusy(false);
      console.error('Error joining room:', err);
      toast.error('Không thể tham gia phòng. Vui lòng thử lại.');
    }
  };
  joinRoomRef.current = joinRoom;

  const handleJoinRoom = (roomId: string, roomDisplayName: string) => {
    if (busy) return;
    if (!userName.trim()) { toast.warning('Vui lòng nhập tên của bạn'); return; }
    void joinRoom(roomId, roomDisplayName);
  };

  return (
    <div className="min-h-screen w-full bg-base text-white">
      {/* nền gradient tinh tế */}
      <div className="pointer-events-none fixed inset-0 opacity-60" style={{ background: 'radial-gradient(60% 50% at 15% 0%, rgba(245,165,36,0.10), transparent), radial-gradient(50% 50% at 100% 100%, rgba(52,211,153,0.06), transparent)' }} />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-5 py-8">
        {/* Brand + SSO badge */}
        <div className="mb-7 flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-ctl bg-accent text-lg font-extrabold text-accent-ink">C</div>
            <span className="text-lg font-bold tracking-tight">CodeClass <span className="text-accent">Meet</span></span>
          </div>
          {cc ? (
            <div className="flex items-center gap-2 rounded-full border border-ok/30 bg-ok/10 px-3 py-1 text-xs font-semibold text-ok">
              <ShieldCheck size={14} />
              <span>{cc.name}</span>
              <span className="rounded bg-ok/20 px-1.5 py-0.5 text-[10px] uppercase">{cc.role}</span>
            </div>
          ) : (
            <span className="rounded-full border border-line bg-raised px-3 py-1 text-xs text-muted">
              Chế độ khách
            </span>
          )}
        </div>

        <div className="grid w-full grid-cols-1 items-center gap-10 md:grid-cols-2">
          {/* Cột trái: giới thiệu + form */}
          <div className="anim-stagger-1">
            <h1 className="mb-2 text-3xl font-extrabold leading-tight tracking-tight">
              Lớp học trực tuyến<br />dành cho lập trình
            </h1>
            <p className="mb-8 text-muted">
              Hội nghị video qua SFU, trình code, trắc nghiệm và trợ lý AI trong cùng một phòng.
            </p>

            <div className="space-y-3">
              <Field label="Tên của bạn">
                <input
                  type="text" placeholder="Ví dụ: Nguyễn Văn A"
                  className="lobby-input"
                  value={userName} onChange={(e) => setUserName(e.target.value)}
                />
              </Field>
              <Field label="Mã phòng hoặc tên phòng mới">
                <input
                  type="text" placeholder="Nhập mã để tham gia, hoặc tên để tạo phòng"
                  className="lobby-input"
                  value={roomName} onChange={(e) => setRoomName(e.target.value)}
                />
              </Field>
              <Field label="Mật khẩu phòng (tùy chọn, khi tạo)">
                <input
                  type="password" placeholder="Để trống nếu phòng công khai"
                  className="lobby-input"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                />
              </Field>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleCreateRoom}
                  disabled={busy}
                  className="lobby-primary flex flex-1 items-center justify-center gap-2 disabled:opacity-60"
                >
                  {busy && <Loader2 size={15} className="animate-spin" />}
                  Tạo phòng mới
                </button>
                <button
                  onClick={handleJoinByInput}
                  disabled={busy}
                  className="lobby-ghost flex-1 disabled:opacity-60"
                >
                  Tham gia bằng mã
                </button>
              </div>
            </div>

            {/* Danh sách phòng */}
            {roomsLoading ? (
              <div className="mt-8 space-y-2">
                <div className="h-3 w-36 rounded skeleton-shimmer" />
                <div className="h-16 w-full rounded-card border border-line skeleton-shimmer" />
                <div className="h-16 w-full rounded-card border border-line skeleton-shimmer" />
              </div>
            ) : rooms.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Phòng đang hoạt động ({rooms.length})
                </h2>
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {rooms.map((room) => (
                    <div key={room.id} className="flex items-center justify-between rounded-card border border-line bg-raised p-3 transition-all duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{room.name}</span>
                          {room.locked && <Lock size={13} className="shrink-0 text-accent" />}
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted">
                          <span className="truncate">Host: {room.hostName || '—'}</span>
                          <span className="flex items-center gap-1"><Users size={12} /> {room.size}</span>
                        </div>
                      </div>
                      <div className="ml-3 flex shrink-0 items-center gap-1.5">
                        {(cc?.role === 'teacher' || cc?.role === 'admin' || !!getHostSecret(room.id)) && (
                          <button
                            onClick={async () => {
                              const ok = await uiConfirm(`Xóa phòng "${room.name}"? Tin nhắn, code và quiz trong phòng sẽ mất vĩnh viễn.`, {
                                title: 'Xóa phòng',
                                confirmLabel: 'Xóa phòng',
                                danger: true,
                              });
                              if (!ok) return;
                              let pw = '';
                              if (room.locked) {
                                const entered = await uiPrompt('Nhập mật khẩu phòng để xóa:', {
                                  title: 'Xác nhận mật khẩu',
                                  inputType: 'password',
                                  placeholder: 'Mật khẩu phòng…',
                                });
                                if (entered === null) return;
                                pw = entered;
                              }
                              socket.emit(
                                'room:delete',
                                {
                                  roomId: room.id,
                                  password: pw,
                                  token: localStorage.getItem('token') || '',
                                  hostSecret: getHostSecret(room.id),
                                },
                                (r: any) => {
                                  if (r && r.error) toast.error(r.error);
                                  else {
                                    removeHostSecret(room.id);
                                    toast.success(`Đã xóa phòng "${room.name}"`);
                                  }
                                },
                              );
                            }}
                            className="rounded-ctl border border-line px-2.5 py-1.5 text-xs font-semibold text-muted transition-all hover:border-danger hover:text-danger"
                            title="Xóa phòng"
                          >
                            Xóa
                          </button>
                        )}
                        <button
                          onClick={() => handleJoinRoom(room.id, room.name)}
                          disabled={busy}
                          className="rounded-ctl bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink transition-all hover:brightness-110 active:scale-95 disabled:opacity-60"
                        >
                          Vào
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Cột phải: preview camera + chọn thiết bị */}
          <div className="anim-stagger-2 space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-panel border border-line bg-raised shadow-2xl">
              {previewStream && !isVideoOff ? (
                <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover mirror" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-muted">
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-elevated">
                    {isVideoOff ? <VideoOff size={36} /> : <Camera size={36} />}
                  </div>
                  <span className="text-sm text-center px-4">
                    {isVideoOff
                      ? 'Camera đang tắt'
                      : mediaError
                        ? mediaError === 'NotFoundError'
                          ? 'Không tìm thấy camera/mic trên máy này'
                          : mediaError === 'NotAllowedError'
                            ? 'Bạn đã chặn quyền camera/mic — hãy mở lại trong trình duyệt'
                            : `Không mở được thiết bị (${mediaError})`
                        : 'Đang chuẩn bị camera…'}
                  </span>
                </div>
              )}

              {/* tên overlay */}
              <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-sm font-medium backdrop-blur">
                <span>{userName || 'Bạn'}</span>
                {!isMuted && (
                  <div className="h-1.5 w-10 overflow-hidden rounded-full bg-white/15" title="Mức âm lượng mic">
                    <div
                      className="h-full bg-ok transition-all duration-100"
                      style={{ width: `${micLevel}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-3">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`grid h-11 w-11 place-items-center rounded-full transition-all active:scale-90 ${isMuted ? 'bg-danger text-white' : 'bg-elevated text-white hover:bg-line-strong'}`}
                  title={isMuted ? 'Bật mic' : 'Tắt mic'}
                >
                  {isMuted ? <MicOff size={19} /> : <Mic size={19} />}
                </button>
                <button
                  onClick={() => setIsVideoOff(!isVideoOff)}
                  className={`grid h-11 w-11 place-items-center rounded-full transition-all active:scale-90 ${isVideoOff ? 'bg-danger text-white' : 'bg-elevated text-white hover:bg-line-strong'}`}
                  title={isVideoOff ? 'Bật camera' : 'Tắt camera'}
                >
                  {isVideoOff ? <VideoOff size={19} /> : <Camera size={19} />}
                </button>
              </div>
            </div>

            {(mics.length > 0 || cams.length > 0) && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {mics.length > 0 && (
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-muted">Microphone</span>
                    <select
                      value={selectedMicId}
                      onChange={(e) => setSelectedMicId(e.target.value)}
                      className="w-full rounded-ctl border border-line bg-raised px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
                    >
                      <option value="">Mặc định hệ thống</option>
                      {mics.map((m, idx) => (
                        <option key={m.deviceId || idx} value={m.deviceId}>
                          {m.label || `Microphone ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {cams.length > 0 && (
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-muted">Camera</span>
                    <select
                      value={selectedCamId}
                      onChange={(e) => setSelectedCamId(e.target.value)}
                      className="w-full rounded-ctl border border-line bg-raised px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
                    >
                      <option value="">Mặc định hệ thống</option>
                      {cams.map((c, idx) => (
                        <option key={c.deviceId || idx} value={c.deviceId}>
                          {c.label || `Camera ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
    {children}
  </label>
);

export default LobbyPage;
