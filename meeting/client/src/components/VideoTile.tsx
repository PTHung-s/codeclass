import React, { useEffect, useRef, useState } from 'react';
import { MicOff, Pin, MonitorUp, VideoOff, Volume2, VolumeX, Hand, Headphones } from 'lucide-react';
import { animalAvatarUrl, avatarBgColor } from '../lib/avatar';

interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  isLocal?: boolean;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isSpeaking?: boolean;
  isSharing?: boolean;
  isHandRaised?: boolean;
  isPinned?: boolean;
  onTogglePin?: () => void;
  /** Người xem (host) có đang cho peer này nghe mình nói hay không */
  canHearHost?: boolean;
  /** Có callback = người xem là host → hiện ô tick trên card */
  onToggleHearHost?: () => void;
  /** Host đang nói riêng 1-1 với peer này */
  isSoloHearHost?: boolean;
  onSoloHearHost?: () => void;
  /** cover = camera lấp khung; contain = screen share giữ nguyên tỉ lệ, không cắt */
  fit?: 'cover' | 'contain';
  variant?: 'grid' | 'filmstrip' | 'spotlight';
}

/** Avatar 3 lớp thống nhất với CodeClass: nền màu → chữ cái đầu → ảnh con vật */
const StudentAvatar: React.FC<{ name: string; sizeClass: string; speaking?: boolean }> = ({ name, sizeClass, speaking }) => {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div
      className={`${sizeClass} relative rounded-full flex items-center justify-center font-bold text-white/95 ring-2 ring-white/10 overflow-hidden transition-shadow ${
        speaking ? 'anim-avatar-speak' : ''
      }`}
      style={{ backgroundColor: avatarBgColor(name) }}
    >
      <span className="absolute inset-0 z-0 flex items-center justify-center">
        {(name || '?').charAt(0).toUpperCase()}
      </span>
      {imgOk && (
        <img
          src={animalAvatarUrl(name)}
          alt=""
          className="absolute inset-0 z-10 h-full w-full object-cover"
          onError={() => setImgOk(false)}
        />
      )}
    </div>
  );
};

const VideoTile: React.FC<VideoTileProps> = ({
  stream, name, isLocal, isMuted, isCameraOff, isSpeaking,
  isSharing, isHandRaised, isPinned, onTogglePin, canHearHost, onToggleHearHost,
  isSoloHearHost, onSoloHearHost, fit = 'cover', variant = 'grid',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [res, setRes] = useState<{ w: number; h: number } | null>(null);

  // Độ phân giải THẬT của luồng đang xem (đọc từ <video>, tự cập nhật khi đổi)
  const updateRes = () => {
    const el = videoRef.current;
    if (el && el.videoWidth > 0) setRes({ w: el.videoWidth, h: el.videoHeight });
    else setRes(null);
  };

  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  const hasVideo = !!stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled;
  const showAvatar = !hasVideo || isCameraOff;
  const mirror = isLocal && fit === 'cover';

  const size = variant === 'filmstrip'
    ? { avatar: 'w-8 h-8 text-sm', name: 'text-[10px] px-1.5 py-0.5' }
    : variant === 'spotlight'
      ? { avatar: 'w-24 h-24 text-4xl', name: 'text-sm px-3 py-1.5' }
      : { avatar: 'w-16 h-16 text-2xl', name: 'text-xs px-2.5 py-1' };

  return (
    <div
      onClick={onTogglePin}
      className={[
        'group relative overflow-hidden rounded-card bg-raised select-none',
        'border transition-all duration-200',
        isSpeaking
          ? 'border-accent shadow-[0_0_0_2px_var(--color-accent),0_8px_30px_-8px_var(--color-accent)]'
          : isSoloHearHost
            ? 'border-ok/80 ring-2 ring-ok/35'
            : 'border-line',
        onTogglePin ? 'cursor-pointer hover:border-line-strong' : '',
        variant === 'filmstrip' ? 'aspect-video' : 'h-full w-full',
      ].join(' ')}
    >
      {!showAvatar && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          onLoadedMetadata={updateRes}
          onResize={updateRes}
          className={[
            'h-full w-full',
            fit === 'cover' ? 'object-cover' : 'object-contain',
            mirror ? 'mirror' : 'no-mirror',
          ].join(' ')}
        />
      )}

      {showAvatar && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <StudentAvatar name={name || '?'} sizeClass={size.avatar} speaking={!!isSpeaking && !isMuted} />
          {isCameraOff && variant !== 'filmstrip' && (
            <span className="flex items-center gap-1 text-[11px] text-muted">
              <VideoOff size={12} /> Camera tắt
            </span>
          )}
        </div>
      )}

      {/* Nameplate */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur px-2.5 py-1 max-w-[calc(100%-1rem)]">
        {isMuted ? (
          <MicOff size={13} className="text-danger shrink-0" />
        ) : isSpeaking ? (
          <span className="inline-flex h-3 items-end gap-[2px] shrink-0" aria-label="Đang nói">
            <span className="eq-bar" />
            <span className="eq-bar" />
            <span className="eq-bar" />
          </span>
        ) : null}
        <span className={`${size.name} font-medium text-white truncate`}>
          {name}{isLocal ? ' (Bạn)' : ''}
        </span>
      </div>

      {/* Badge đang chia sẻ màn hình — dịch sang phải nếu có nút tick "nghe host" ở góc trái */}
      {isSharing && (
        <div
          className={`absolute top-2 flex items-center gap-1 rounded-full bg-ok/90 text-[10px] font-semibold text-black px-2 py-0.5 ${
            onToggleHearHost ? (onSoloHearHost ? 'left-24' : 'left-16') : 'left-2'
          }`}
        >
          <MonitorUp size={11} /> Đang chia sẻ
        </div>
      )}

      {/* Badge giơ tay phát biểu */}
      {isHandRaised && (
        <div
          className={`anim-badge-pop absolute top-2 ${onTogglePin ? 'right-10' : 'right-2'} flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-ink shadow-md`}
          title="Đang giơ tay"
        >
          <Hand size={11} className="anim-hand-wave" />
          {variant !== 'filmstrip' && <span>Giơ tay</span>}
        </div>
      )}

      {/* Độ phân giải thật của luồng đang xem — góc phải dưới, chỉ trên ô chia sẻ màn hình */}
      {isSharing && variant === 'spotlight' && res && (
        <div className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] leading-none text-white/90 backdrop-blur">
          {res.w}×{res.h}
        </div>
      )}

      {/* Nút pin hiện khi hover */}
      {onTogglePin && (
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          className={[
            'absolute top-2 right-2 p-1.5 rounded-ctl backdrop-blur transition-all active:scale-95',
            isPinned
              ? 'bg-accent text-accent-ink opacity-100'
              : 'bg-black/50 text-white/80 opacity-0 translate-y-[-2px] group-hover:opacity-100 group-hover:translate-y-0 hover:bg-black/75',
          ].join(' ')}
          title={isPinned ? 'Bỏ ghim' : 'Ghim'}
        >
          <Pin size={14} fill={isPinned ? 'currentColor' : 'none'} />
        </button>
      )}

      {/* Ô tick "nghe host" + nút nói riêng 1-1 — CHỈ host thấy */}
      {(onToggleHearHost || onSoloHearHost) && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 left-2 flex items-center gap-1"
        >
          {onToggleHearHost && (
            <label
              title={canHearHost
                ? `${name} đang trong nhóm nghe bạn nói (bỏ tick để tách khỏi nhóm)`
                : `${name} KHÔNG nghe được bạn nói — chỉ bạn nghe được họ`}
              className={[
                'flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 backdrop-blur transition-all',
                canHearHost
                  ? 'bg-accent text-accent-ink'
                  : 'bg-black/55 text-white/85 hover:bg-black/75',
                variant === 'filmstrip' ? 'text-[9px]' : 'text-[11px]',
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={!!canHearHost}
                onChange={(e) => { e.stopPropagation(); onToggleHearHost(); }}
                onClick={(e) => e.stopPropagation()}
                className="h-3 w-3 cursor-pointer accent-current"
              />
              <span className="font-semibold leading-none">
                {canHearHost ? <Volume2 size={11} className="inline" /> : <VolumeX size={11} className="inline" />}
              </span>
            </label>
          )}
          {onSoloHearHost && (
            <button
              onClick={(e) => { e.stopPropagation(); onSoloHearHost(); }}
              title={isSoloHearHost ? 'Đang nói riêng 1-1 — bấm để trả về cả lớp' : `Nói riêng 1-1 với ${name}`}
              className={[
                'inline-flex items-center gap-1 rounded-full backdrop-blur transition-all active:scale-95',
                isSoloHearHost
                  ? 'bg-ok text-black px-2 py-1 text-[10px] font-bold shadow-md'
                  : 'p-1 bg-black/55 text-white/85 hover:bg-black/80 hover:text-accent',
              ].join(' ')}
            >
              <Headphones size={12} />
              {isSoloHearHost && variant !== 'filmstrip' && <span>1-1</span>}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoTile;
