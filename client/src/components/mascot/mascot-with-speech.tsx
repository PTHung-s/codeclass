import { cn } from "../../lib/utils"
import { Mascot } from "./mascot"
import { MascotSpeechBubble } from "./mascot-speech-bubble"
import type { MascotState } from "./mascot-config"

export function MascotWithSpeech({
  state,
  speech,
  size = 240,
  className,
}: {
  state?: MascotState
  speech?: string
  size?: number
  className?: string
}) {
  // fontSize scaling: 240px → 12px, 120px → 9px, 320px → 14px
  const fontSize = Math.max(9, Math.round(size * 0.05))

  return (
    <div className={cn("flex flex-col items-center", className)} style={{ width: size }}>
      {speech && (
        <MascotSpeechBubble
          text={speech}
          className="mb-1.5"
          style={{
            fontSize: `${fontSize}px`,
            maxWidth: `${size * 1.2}px`,
          }}
        />
      )}
      <Mascot state={state} size={size} />
    </div>
  )
}
