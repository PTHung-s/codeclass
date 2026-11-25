import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Code2,
  FileText,
  HelpCircle,
  Loader2,
  Maximize,
  Pause,
  PictureInPicture2,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";

function formatDuration(value: number) {
  if (!Number.isFinite(value) || value < 0) return "00:00";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

function decodeName(value?: string | null) {
  if (!value) return null;
  try {
    return decodeURIComponent(escape(atob(value)));
  } catch {
    return value;
  }
}

function LearningVideoPlayer({
  src,
  storageKey,
  title,
}: {
  src: string;
  storageKey: string;
  title: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const lastSavedRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (video.paused) await video.play();
      else video.pause();
    } catch {
      setError("Không thể phát video. Hãy kiểm tra kết nối rồi thử lại.");
    }
  };
  const seek = (offset: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + offset));
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await playerRef.current?.requestFullscreen();
    } catch {
      setError("Trình duyệt không thể mở toàn màn hình.");
    }
  };
  const togglePictureInPicture = async () => {
    const video = videoRef.current as HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<PictureInPictureWindow>;
    };
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (video?.requestPictureInPicture) await video.requestPictureInPicture();
      else setError("Trình duyệt này chưa hỗ trợ Picture-in-Picture.");
    } catch {
      setError("Không thể bật Picture-in-Picture.");
    }
  };

  useEffect(
    () => () => {
      const time = videoRef.current?.currentTime;
      if (time && Number.isFinite(time)) localStorage.setItem(storageKey, String(Math.floor(time)));
    },
    [storageKey],
  );

  return (
    <div ref={playerRef} className="group relative overflow-hidden rounded-xl border border-border bg-black shadow-sm">
      <video
        ref={videoRef}
        className="aspect-video w-full bg-black object-contain"
        src={src}
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(video.duration || 0);
          const saved = Number(localStorage.getItem(storageKey));
          if (Number.isFinite(saved) && saved > 5 && saved < video.duration - 5) {
            video.currentTime = saved;
            setCurrentTime(saved);
          }
          setReady(true);
        }}
        onTimeUpdate={(event) => {
          const time = event.currentTarget.currentTime;
          setCurrentTime(time);
          if (time - lastSavedRef.current >= 5) {
            lastSavedRef.current = time;
            localStorage.setItem(storageKey, String(Math.floor(time)));
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          localStorage.removeItem(storageKey);
          setPlaying(false);
        }}
        onError={() => setError("Video không tải được. Hãy thử lại hoặc báo cho giáo viên.")}
      />
      {!ready && !error ? (
        <div className="absolute inset-0 grid place-items-center bg-black/70 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="h-5 w-5 animate-spin" /> Đang chuẩn bị video…
          </div>
        </div>
      ) : null}
      {!playing && ready && !error ? (
        <button
          onClick={togglePlay}
          className="absolute inset-0 grid place-items-center bg-black/20"
          aria-label={`Phát ${title}`}
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-card text-foreground shadow-lg transition group-hover:scale-105">
            <Play className="ml-1 h-6 w-6 fill-current" />
          </span>
        </button>
      ) : null}
      {error ? (
        <div className="absolute inset-0 grid place-items-center bg-black/90 p-6 text-center text-white">
          <div>
            <p className="font-bold">Không thể phát video</p>
            <p className="mt-1 text-sm text-white/80">{error}</p>
            <button
              onClick={() => {
                setError(null);
                videoRef.current?.load();
              }}
              className="mt-4 rounded-lg bg-card px-4 py-2 text-sm font-semibold text-foreground"
            >
              Thử lại
            </button>
          </div>
        </div>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-3 pb-3 pt-12 text-white opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <input
          aria-label="Tiến độ video"
          type="range"
          min={0}
          max={duration || 0}
          step="0.1"
          value={currentTime}
          onChange={(event) => {
            const time = Number(event.target.value);
            if (videoRef.current) videoRef.current.currentTime = time;
            setCurrentTime(time);
          }}
          className="mb-3 h-1.5 w-full cursor-pointer accent-primary"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={togglePlay}
              className="rounded-md p-2 hover:bg-white/15"
              aria-label={playing ? "Tạm dừng" : "Phát"}
            >
              {playing ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 fill-current" />
              )}
            </button>
            <button onClick={() => seek(-10)} className="rounded-md p-2 hover:bg-white/15" aria-label="Lùi 10 giây">
              <SkipBack className="h-5 w-5" />
            </button>
            <button onClick={() => seek(10)} className="rounded-md p-2 hover:bg-white/15" aria-label="Tới 10 giây">
              <SkipForward className="h-5 w-5" />
            </button>
            <span className="hidden font-mono text-xs text-white/90 sm:inline">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() =>
                setVolume((value) => {
                  const next = value > 0 ? 0 : 1;
                  if (videoRef.current) videoRef.current.volume = next;
                  return next;
                })
              }
              className="rounded-md p-2 hover:bg-white/15"
              aria-label={volume ? "Tắt tiếng" : "Bật tiếng"}
            >
              {volume ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </button>
            <input
              aria-label="Âm lượng"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(event) => {
                const next = Number(event.target.value);
                setVolume(next);
                if (videoRef.current) videoRef.current.volume = next;
              }}
              className="hidden w-16 accent-primary sm:block"
            />
            <select
              data-slot="video-speed-select"
              aria-label="Tốc độ phát"
              value={speed}
              onChange={(event) => {
                const next = Number(event.target.value);
                setSpeed(next);
                if (videoRef.current) videoRef.current.playbackRate = next;
              }}
              className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white outline-none hover:bg-white/15"
            >
              {[0.75, 1, 1.25, 1.5, 2].map((item) => (
                <option key={item} value={item} className="bg-card text-foreground">
                  {item}×
                </option>
              ))}
            </select>
            <button
              onClick={togglePictureInPicture}
              className="hidden rounded-md p-2 hover:bg-white/15 sm:block"
              aria-label="Picture in Picture"
            >
              <PictureInPicture2 className="h-5 w-5" />
            </button>
            <button onClick={toggleFullscreen} className="rounded-md p-2 hover:bg-white/15" aria-label="Toàn màn hình">
              <Maximize className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SessionVideoPage() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["session-lesson", lessonId],
    queryFn: () => api.get(`/session-course/lesson/${lessonId}`).then((response) => response.data),
    enabled: !!lessonId,
  });
  if (isLoading || isError || !data) {
    return (
      <div className="grid min-h-[40vh] place-items-center px-5 text-sm text-muted-foreground">
        {isLoading ? "Đang tải buổi học…" : "Không tải được buổi học."}
      </div>
    );
  }

  const { lesson } = data;
  const go = (suffix = "") => navigate(`/course/${courseId}/lesson/${lessonId}${suffix}`);
  const resources = [
    ...(lesson.readingContent
      ? [
          {
            title: "Bài đọc",
            detail: "Tóm tắt kiến thức",
            icon: <BookOpen className="h-5 w-5" />,
            onClick: () => go("/reading"),
          },
        ]
      : []),
    ...(data.codeFiles.length
      ? [
          {
            title: "Code buổi học",
            detail: `${data.codeFiles.length} file`,
            icon: <Code2 className="h-5 w-5" />,
            onClick: () => go("/code"),
          },
        ]
      : []),
    ...(data.materials.length
      ? [
          {
            title: "Tài liệu",
            detail: `${data.materials.length} tệp đính kèm`,
            icon: <FileText className="h-5 w-5" />,
            onClick: () => go("/reading#materials"),
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={() => go("")}
      >
        <ArrowLeft className="h-4 w-4" /> Quay lại buổi học
      </Button>

      <Card>
        <CardContent className="p-4 md:p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Video bài giảng · Buổi {String(lesson.orderIndex).padStart(2, "0")}
          </p>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {lesson.title}
          </h1>
        </CardContent>
      </Card>

      {lesson.video ? (
        <Card>
          <CardContent className="grid gap-5 p-4 md:p-5 xl:grid-cols-[minmax(0,1fr)_270px]">
            <div>
              <LearningVideoPlayer
                src={lesson.video.url}
                storageKey={`session-video-position:${lessonId}`}
                title={lesson.title}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span className="text-foreground">
                  {decodeName(lesson.video.originalName) || "Video bài giảng"}
                </span>
                <span>Vị trí xem được lưu trên thiết bị này.</span>
              </div>
            </div>
            <aside className="rounded-xl border border-border bg-muted/40 p-5">
              <h2 className="font-semibold text-foreground">Nội dung trong buổi</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Tham khảo tài liệu và hoàn thành bài kiểm tra để tiếp tục.
              </p>
              <div className="mt-4 space-y-2">
                {resources.map((resource) => (
                  <button
                    key={resource.title}
                    onClick={resource.onClick}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left text-foreground transition hover:bg-muted/50"
                  >
                    <span className="text-muted-foreground">{resource.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{resource.title}</span>
                      <span className="block text-xs text-muted-foreground">{resource.detail}</span>
                    </span>
                    <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
              {data.quiz ? (
                <Button onClick={() => go("/quiz")} className="mt-5 w-full justify-between">
                  <span className="text-left">
                    <span className="block font-semibold">Làm bài kiểm tra</span>
                    <span className="block text-xs opacity-90">Hoàn thành để mở buổi sau</span>
                  </span>
                  <HelpCircle className="h-5 w-5" />
                </Button>
              ) : null}
            </aside>
          </CardContent>
        </Card>
      ) : (
        <div className="grid min-h-[360px] place-items-center rounded-xl border border-dashed border-border bg-card text-muted-foreground">
          Giáo viên chưa đăng video cho buổi này.
        </div>
      )}
    </div>
  );
}
