import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { MASCOT_STATES, type MascotState } from "./mascot-config"

const HIDDEN_KEY = "mascot:hidden"

// Thời gian giữ một "reaction" dạng loop (celebrate/cheer/sad) trước khi tự về idle (ms).
// Non-loop states (hype/scared) dùng autoReturnMs trong config để advance.
const DEFAULT_HOLD_MS: Partial<Record<MascotState, number>> = {
  celebrate: 6000,
  cheer: 5000,
  sad: 6000,
}

export interface SayOptions {
  /** Ghi đè thời gian giữ reaction trước khi về idle (loop states). */
  holdMs?: number
}

interface MascotContextValue {
  state: MascotState
  /** Tin nhắn đang hiện trong speech bubble (null = ẩn bubble). */
  message: string | null
  /** Mascot có đang hiển thị không (sau khi user dismiss). */
  visible: boolean
  /** Tăng mỗi lần trigger — ép <img> remount (replay GIF) khi bấm lại cùng state. */
  nonce: number
  /** Kích hoạt trạng thái kèm lời nhắn. Loop reaction tự về idle sau holdMs. */
  say: (state: MascotState, message?: string | null, opts?: SayOptions) => void
  /** Kích hoạt trạng thái (emotion only, không đổi message). */
  trigger: (state: MascotState) => void
  /** Trở về idle (mặc định xoá message). */
  toIdle: (opts?: { keepMessage?: boolean }) => void
  /** Ẩn dock (dismiss). */
  hide: () => void
  /** Hiện lại dock. */
  show: () => void
}

const MascotContext = createContext<MascotContextValue | null>(null)

export function MascotProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MascotState>("idle")
  const [message, setMessage] = useState<string | null>(null)
  const [visible, setVisible] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HIDDEN_KEY) !== "1"
    } catch {
      return true
    }
  })
  const [nonce, setNonce] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => () => clear(), [clear])

  // Đặt lịch chuyển sang `dest` sau `ms`, rồi xoá message khi về tới idle.
  const scheduleTo = useCallback((dest: MascotState, ms: number, clearMessageAtIdle: boolean) => {
    timerRef.current = setTimeout(() => {
      setState(dest)
      if (clearMessageAtIdle && dest === "idle") setMessage(null)
    }, ms)
  }, [])

  // Hàng đợi chuỗi cho non-loop (enter → next). Dùng ref để đệ quy mà không bị
  // TS "used before declaration" trong useCallback.
  const advanceRef = useRef<(from: MascotState) => void>(() => {})
  const scheduleAdvance = useCallback((from: MascotState) => {
    const def = MASCOT_STATES[from]
    if (def.loop || !def.autoReturnMs) return
    timerRef.current = setTimeout(() => {
      const dest = (MASCOT_STATES[from]?.next ?? "idle") as MascotState
      setState(dest)
      if (dest === "idle") setMessage(null)
      advanceRef.current(dest)
    }, def.autoReturnMs)
  }, [])
  advanceRef.current = scheduleAdvance

  const say = useCallback(
    (next: MascotState, msg?: string | null, opts?: SayOptions) => {
      clear()
      setNonce((n) => n + 1)
      setMessage(msg ?? null)
      const first = (MASCOT_STATES[next].enter ?? next) as MascotState
      setState(first)

      const def = MASCOT_STATES[first]
      if (!def.loop) {
        // non-loop: để scheduleAdvance lo chuỗi → idle.
        scheduleAdvance(first)
      } else if (first !== "idle") {
        // loop reaction: giữ holdMs rồi về idle (xoá message).
        const hold = opts?.holdMs ?? DEFAULT_HOLD_MS[first] ?? 6000
        scheduleTo("idle", hold, true)
      }
      // first === "idle": giữ nguyên (greeting) cho tới khi có say() khác.
    },
    [clear, scheduleAdvance, scheduleTo],
  )

  const trigger = useCallback(
    (next: MascotState) => {
      clear()
      setNonce((n) => n + 1)
      const first = (MASCOT_STATES[next].enter ?? next) as MascotState
      setState(first)
      scheduleAdvance(first)
    },
    [clear, scheduleAdvance],
  )

  const toIdle = useCallback(
    (opts?: { keepMessage?: boolean }) => {
      clear()
      setNonce((n) => n + 1)
      setState("idle")
      if (!opts?.keepMessage) setMessage(null)
    },
    [clear],
  )

  const hide = useCallback(() => {
    try {
      localStorage.setItem(HIDDEN_KEY, "1")
    } catch {
      // ignore
    }
    setVisible(false)
  }, [])

  const show = useCallback(() => {
    try {
      localStorage.removeItem(HIDDEN_KEY)
    } catch {
      // ignore
    }
    setVisible(true)
  }, [])

  return (
    <MascotContext.Provider
      value={{ state, message, visible, nonce, say, trigger, toIdle, hide, show }}
    >
      {children}
    </MascotContext.Provider>
  )
}

export function useMascot() {
  const ctx = useContext(MascotContext)
  if (!ctx) {
    throw new Error("useMascot must be used within a MascotProvider")
  }
  return ctx
}
