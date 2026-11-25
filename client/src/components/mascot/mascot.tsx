import { useEffect, useState, useRef } from "react"

import { cn } from "../../lib/utils"
import {
  MASCOT_STATES,
  MASCOT_STATE_LIST,
  mascotSrc,
  type MascotState,
} from "./mascot-config"
import { useMascot } from "./mascot-provider"

// Mascot: ưu tiên GIF (qua <img>, có nền trong suốt, autoplay + loop native).
// Nếu không tìm thấy .gif → fallback sang <video> (.webm rồi .mp4).
// - state không truyền → theo state chung trong MascotProvider (dùng cho demo).
// - state truyền vào → ghim.
//
// Chuyển trạng thái "xong rồi sang next" do provider điều khiển bằng timer
// (vì <img> không có onEnded; <video> cũng nhất quán theo timer).
//
// Preload tất cả GIF vào cache ngay khi mount → chuyển state mượt, không chớp placeholder.
export function Mascot({
  state: stateProp,
  size = 240,
  className,
}: {
  state?: MascotState
  size?: number
  className?: string
}) {
  const { state: ctxState, nonce } = useMascot()
  const state = stateProp ?? ctxState
  const def = MASCOT_STATES[state]
  const [mode, setMode] = useState<"gif" | "video">("gif")
  const [loaded, setLoaded] = useState(false)
  const preloadedRef = useRef(false)

  // Preload tất cả GIF 1 lần khi mount → cache sẵn.
  useEffect(() => {
    if (preloadedRef.current) return
    preloadedRef.current = true
    MASCOT_STATE_LIST.forEach((s) => {
      const img = new Image()
      img.src = mascotSrc(s.id)
    })
  }, [])

  // Chỉ reset mode khi đổi state (không reset loaded → giữ placeholder ẩn nếu GIF đã cache).
  useEffect(() => {
    setMode("gif")
  }, [state, nonce])

  return (
    <div
      className={cn("relative select-none", className)}
      style={{ width: size, height: size }}
    >
      {/* Placeholder emoji (nền trắng) — thấy khi media chưa load, mờ khi load xong */}
      <div
        className={cn(
          "bg-background absolute inset-0 flex flex-col items-center justify-center rounded-full transition-opacity duration-300",
          loaded ? "opacity-0" : "opacity-100",
        )}
      >
        <span style={{ fontSize: size * 0.42, lineHeight: 1 }}>{def.emoji}</span>
      </div>

      {mode === "gif" ? (
        <img
          key={`${state}-${nonce}`}
          src={mascotSrc(state)}
          alt={def.label}
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setMode("video")}
        />
      ) : (
        <video
          key={`${state}-${nonce}`}
          className="absolute inset-0 h-full w-full object-contain"
          autoPlay
          loop={def.loop}
          muted
          playsInline
          onLoadedData={() => setLoaded(true)}
        >
          <source src={`/mascot/${state}.webm`} type="video/webm" />
          <source src={`/mascot/${state}.mp4`} type="video/mp4" />
        </video>
      )}
    </div>
  )
}
