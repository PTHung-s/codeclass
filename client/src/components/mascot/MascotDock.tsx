import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { X, GripHorizontal } from "lucide-react"

import { useMascot } from "./mascot-provider"
import { MascotWithSpeech } from "./mascot-with-speech"
import { msgTip } from "./mascot-messages"
import { useAuthContext } from "../../contexts/AuthContext"

const POS_KEY = "mascot:pos"
const DRAG_THRESHOLD = 5 // px — dưới ngưỡng này tính là click, không phải drag

interface Pos {
  x: number
  y: number
}

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p.x === "number" && typeof p.y === "number") return p
  } catch {
    // ignore
  }
  return null
}

function savePos(p: Pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p))
  } catch {
    // ignore
  }
}

/**
 * Hook drag trả về: vị trí hiện tại (null = default), các handler gắn vào handle,
 * và flag đang kéo.
 */
function useDraggable() {
  const [pos, setPos] = useState<Pos | null>(() => loadPos())
  const [dragging, setDragging] = useState(false)
  const startRef = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null)

  // Clamp vị trí trong viewport
  const clamp = (x: number, y: number, el: HTMLElement): Pos => {
    const w = el.offsetWidth
    const h = el.offsetHeight
    return {
      x: Math.max(8, Math.min(window.innerWidth - w - 8, x)),
      y: Math.max(8, Math.min(window.innerHeight - h - 8, y)),
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    // Bỏ qua nếu bấm vào nút (X) — để onClick của nút hoạt động
    const target = e.target as HTMLElement
    if (target.closest("[data-no-drag]")) return

    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    const current = pos ?? { x: rect.left, y: rect.top }

    startRef.current = {
      px: e.clientX,
      py: e.clientY,
      ox: current.x,
      oy: current.y,
      moved: false,
    }
    setDragging(true)
    el.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const start = startRef.current
    if (!start) return
    const dx = e.clientX - start.px
    const dy = e.clientY - start.py
    if (!start.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    start.moved = true
    const el = e.currentTarget as HTMLElement
    const next = clamp(start.ox + dx, start.oy + dy, el)
    setPos(next)
  }

  const endDrag = (e: React.PointerEvent, persist: boolean): boolean => {
    const start = startRef.current
    startRef.current = null
    setDragging(false)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    const moved = start?.moved === true
    if (persist && moved) {
      // Lưu vị trí cuối — dùng boundingRect để chắc chắn khớp DOM thực
      const el = e.currentTarget as HTMLElement
      const rect = el.getBoundingClientRect()
      savePos({ x: rect.left, y: rect.top })
    }
    return moved
  }

  return { pos, dragging, onPointerDown, onPointerMove, endDrag }
}

/**
 * Dock mascot toàn cục — có thể kéo thả mọi nơi trong màn hình.
 * Mặc định góc dưới-phải; khi user kéo → vị trí lưu vào localStorage.
 */
export default function MascotDock() {
  const { user } = useAuthContext()
  const { state, message, visible, say, show } = useMascot()

  const isStudent = user?.role === "student"
  const { pos, dragging, onPointerDown, onPointerMove, endDrag } = useDraggable()

  // Idle tip định kỳ
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!isStudent || !visible) return
    if (state !== "idle") return
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current)
    tipTimerRef.current = setTimeout(() => {
      say("idle", msgTip(), { holdMs: 7000 })
    }, 100_000)
    return () => {
      if (tipTimerRef.current) {
        clearTimeout(tipTimerRef.current)
        tipTimerRef.current = null
      }
    }
  }, [isStudent, visible, state, say])

  if (!isStudent) return null

  // Style vị trí: default = bottom-right; khi có pos = top/left tuyệt đối
  const wrapperStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, bottom: "auto", right: "auto" }
    : {}

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-2"
      style={wrapperStyle}
    >
      <AnimatePresence mode="wait">
        {visible ? (
          <motion.div
            key="dock"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endDrag(e, true)}
            onPointerCancel={(e) => endDrag(e, false)}
            className={`pointer-events-auto relative flex cursor-grab flex-col items-center select-none ${dragging ? "cursor-grabbing" : ""}`}
            style={{ touchAction: "none" }}
          >
            <MascotWithSpeech
              state={state}
              speech={message ?? undefined}
              size={140}
            />
            <DismissButton />
            {/* Grip handle — gợi ý có thể kéo */}
            <div className="mt-0.5 flex items-center gap-0.5 text-muted-foreground/40" aria-hidden>
              <GripHorizontal className="size-3.5" />
              <span className="text-[9px]">kéo để di chuyển</span>
            </div>
          </motion.div>
        ) : (
          <ReopenButton key="reopen" pos={pos} dragHandlers={{ onPointerDown, onPointerMove, endDrag }} />
        )}
      </AnimatePresence>
    </div>
  )
}

/* Nút đóng (X) góc trên-phải mascot — data-no-drag để không bị drag chặn click */
function DismissButton() {
  const { hide } = useMascot()
  return (
    <button
      data-no-drag
      onClick={hide}
      aria-label="Ẩn mascot"
      title="Ẩn mascot"
      className="absolute -right-1 -top-1 z-10 flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground"
    >
      <X className="size-3.5" />
    </button>
  )
}

/* Nút mở lại — cũng có thể kéo */
function ReopenButton({
  pos,
  dragHandlers,
}: {
  pos: Pos | null
  dragHandlers: { onPointerDown: (e: React.PointerEvent) => void; onPointerMove: (e: React.PointerEvent) => void; endDrag: (e: React.PointerEvent, persist: boolean) => boolean }
}) {
  const { show } = useMascot()
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      onPointerDown={dragHandlers.onPointerDown}
      onPointerMove={dragHandlers.onPointerMove}
      onPointerUp={(e) => {
        const moved = dragHandlers.endDrag(e, true)
        if (!moved) show() // chỉ reopen nếu KHÔNG kéo
      }}
      onPointerCancel={(e) => dragHandlers.endDrag(e, false)}
      aria-label="Hiện mascot"
      title="Hiện lại mascot (kéo để di chuyển)"
      className="pointer-events-auto flex size-14 cursor-grab items-center justify-center rounded-full border border-border bg-card shadow-lg ring-1 ring-black/5 active:scale-95"
      style={{ touchAction: "none" }}
    >
      <span className="text-2xl select-none">👋</span>
    </motion.button>
  )
}
