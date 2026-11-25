// Cấu hình các trạng thái (hoạt động) của mascot.
// Thả video vào public/mascot/{state}.webm (ưu tiên, nền trong suốt) hoặc {state}.mp4.
//
// Một số trạng thái là "enter transition" (chơi 1 lần rồi chuyển sang trạng thái loop).
// VD: trigger("sad") sẽ chơi "sad_enter" 1 lần → tự chuyển "sad" (loop gục đất liên tục).

export type MascotState =
  | "idle"
  | "sad_enter"
  | "sad"
  | "hype"
  | "scared"
  | "celebrate"
  | "cheer"

export interface MascotStateDef {
  id: MascotState
  label: string
  emoji: string
  /** true = lặp liên tục; false = chơi 1 lần rồi chuyển sang `next`. */
  loop: boolean
  /** Trạng thái "enter transition" chơi trước khi vào trạng thái này (vd sad cần sad_enter). */
  enter?: MascotState
  /** Trạng thái kế tiếp khi clip (non-loop) CHẠY HẾT. Mặc định: "idle". */
  next?: MascotState
  /** Fallback (ms): nếu video không load được, vẫn advance sau thời gian này. */
  autoReturnMs?: number
  useCase: string
}

export const MASCOT_STATES: Record<MascotState, MascotStateDef> = {
  idle: {
    id: "idle",
    label: "Rảnh (bình thường)",
    emoji: "🙂",
    loop: true,
    useCase: "Trạng thái hoạt động rảnh — lặp liên tục khi không có gì xảy ra.",
  },
  sad_enter: {
    id: "sad_enter",
    label: "Buồn gục xuống (chuyển)",
    emoji: "😧",
    loop: false,
    next: "sad",
    autoReturnMs: 10000,
    useCase:
      "Transition: từ bình thường buồn khuỵa xuống đất. Chiếu hết clip rồi tự nối sang “sad”.",
  },
  sad: {
    id: "sad",
    label: "Buồn gục đất (liên tục)",
    emoji: "😭",
    loop: true,
    enter: "sad_enter",
    useCase:
      "Buồn liên tục dạng khuỵa gục đất (phải kết hợp sad_enter ở trước).",
  },
  hype: {
    id: "hype",
    label: "Vui cực cháy lửa",
    emoji: "🔥",
    loop: false,
    next: "idle",
    autoReturnMs: 10000,
    useCase: "Vui tột độ, cháy lửa — chiếu hết clip rồi tự về idle.",
  },
  scared: {
    id: "scared",
    label: "Bất ngờ → sợ co rúm",
    emoji: "😱",
    loop: false,
    next: "idle",
    autoReturnMs: 10000,
    useCase: "Bất ngờ thành sợ, co rúm người — chiếu hết clip rồi tự về idle.",
  },
  celebrate: {
    id: "celebrate",
    label: "Chúc mừng hân hoan",
    emoji: "🎉",
    loop: true,
    useCase: "Vui chúc mừng bình thường, hân hoan — lặp liên tục.",
  },
  cheer: {
    id: "cheer",
    label: "Woa woa (đúng 1 câu)",
    emoji: "🤩",
    loop: true,
    useCase: "Woa woa vui vui — lặp liên tục, áp dụng mỗi khi làm đúng câu trắc nghiệm.",
  },
}

export const MASCOT_STATE_LIST: MascotStateDef[] = Object.values(MASCOT_STATES)

// GIF (có nền trong suốt, autoplay + loop native qua <img>). Đặt file {state}.gif vào public/mascot/.
export function mascotSrc(state: MascotState) {
  return `/mascot/${state}.gif`
}
