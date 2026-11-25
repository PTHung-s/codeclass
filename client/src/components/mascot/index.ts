// Mascot system — entry point cho tất cả mascot components
export { Mascot } from "./mascot"
export { MascotWithSpeech } from "./mascot-with-speech"
export { MascotSpeechBubble } from "./mascot-speech-bubble"
export { MascotProvider, useMascot, type SayOptions } from "./mascot-provider"
export {
  MASCOT_STATES,
  MASCOT_STATE_LIST,
  mascotSrc,
  type MascotState,
  type MascotStateDef,
} from "./mascot-config"
export {
  msgGreet,
  msgCorrect,
  msgWrong,
  msgSolved,
  msgFail,
  msgShocked,
  msgHype,
  msgTip,
  msgStart,
} from "./mascot-messages"
