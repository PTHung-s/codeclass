import { cn } from "../../lib/utils"
import { CSSProperties } from "react"

const MAX_CHARS = 120

export function MascotSpeechBubble({
  text,
  className,
  style,
}: {
  text?: string
  className?: string
  style?: CSSProperties
}) {
  if (!text) return null

  const displayText = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "..." : text

  return (
    <div
      className={cn(
        "relative inline-block max-w-full rounded-2xl border bg-white px-4 py-3 shadow-sm",
        className,
      )}
      style={style}
    >
      <p className="leading-relaxed break-words whitespace-pre-wrap">{displayText}</p>
      {/* Mũi tên xuống dưới */}
      <div className="absolute left-1/2 top-full -translate-x-1/2">
        <div className="border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white" />
        <div className="absolute left-1/2 top-0 -z-10 -translate-x-1/2 translate-y-px border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-border" />
      </div>
    </div>
  )
}
