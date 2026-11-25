import { useState, useEffect, useCallback, useRef } from "react";
import { subscribe } from "../lib/activityMonitor";
import { playMinecraftHurtSound } from "../lib/soundEffects";

interface UseAntiCheatOptions {
  maxHearts?: number;
  onZeroHearts?: () => void;
  enabled: boolean;
}

interface UseAntiCheatReturn {
  hearts: number;
  maxHearts: number;
  fullscreenActive: boolean;
  fullscreenDenied: boolean;
  requestFullscreen: () => void;
  resetHearts: () => void;
  lastViolation: string | null;
  awayCountdown: number | null; // null if focused, or 15..0 countdown seconds
}

const AWAY_INTERVAL_SECONDS = 15;
/**
 * Khoảng gộp các violation liền nhau thành MẤT 1 TIM:
 * thoát fullscreen + chuyển tab thường bắn 2 event cách nhau >1s
 * (animation fullscreen chậm) — phải nằm trong 1 cửa sổ này mới không bị trừ đôi.
 */
const VIOLATION_MERGE_MS = 2600;

export function useAntiCheat({
  maxHearts = 3,
  onZeroHearts,
  enabled,
}: UseAntiCheatOptions): UseAntiCheatReturn {
  const [hearts, setHearts] = useState(maxHearts);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [fullscreenDenied, setFullscreenDenied] = useState(false);
  const [lastViolation, setLastViolation] = useState<string | null>(null);
  const [awayCountdown, setAwayCountdown] = useState<number | null>(null);

  const heartsRef = useRef(hearts);
  const violationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLossTime = useRef(0);
  const zeroHeartsCalled = useRef(false);
  const blurGraceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<number | null>(null);
  // Dialog hệ thống (chọn file upload, in ấn…) làm window blur nhưng KHÔNG phải gian lận.
  // Component phát sự kiện "cc-native-dialog" để được miễn trừ tim trong vài giây.
  const suppressUntil = useRef(0);
  const lastFullscreenExitAt = useRef(0);

  useEffect(() => { heartsRef.current = hearts; }, [hearts]);
  useEffect(() => { if (enabled) zeroHeartsCalled.current = false; }, [enabled]);

  const isSuppressed = () => Date.now() < suppressUntil.current;

  const clearAllTimers = () => {
    if (blurGraceTimer.current) {
      clearTimeout(blurGraceTimer.current);
      blurGraceTimer.current = null;
    }
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }
    countdownRef.current = null;
    setAwayCountdown(null);
  };

  const resetHearts = useCallback(() => {
    setHearts(maxHearts);
    setLastViolation(null);
    lastLossTime.current = 0;
    zeroHeartsCalled.current = false;
    clearAllTimers();
  }, [maxHearts]);

  const requestFullscreen = useCallback(() => {
    try {
      document.documentElement.requestFullscreen().then(() => {
        setFullscreenActive(true);
        setFullscreenDenied(false);
      }).catch(() => {
        setFullscreenActive(false);
        setFullscreenDenied(true);
      });
    } catch {
      setFullscreenActive(false);
      setFullscreenDenied(true);
    }
  }, []);

  function loseHeart(reason: string) {
    // Play classic Minecraft hurt sound
    playMinecraftHurtSound();

    setHearts((prev) => {
      const next = Math.max(0, prev - 1);
      if (next === 0 && !zeroHeartsCalled.current) {
        zeroHeartsCalled.current = true;
        setTimeout(() => onZeroHearts?.(), 600);
      }
      return next;
    });
    setLastViolation(reason);
    if (violationTimer.current) clearTimeout(violationTimer.current);
    violationTimer.current = setTimeout(() => setLastViolation(null), 3000);
  }

  useEffect(() => {
    if (!enabled) {
      clearAllTimers();
      return;
    }

    const tryLoseHeart = (reason: string) => {
      if (heartsRef.current <= 0) return;
      if (isSuppressed()) return; // dialog hệ thống → bỏ qua
      const now = Date.now();
      // Gộp cụm violation liền nhau (thoát fullscreen + đổi tab là MỘT hành động)
      if (now - lastLossTime.current < VIOLATION_MERGE_MS) return;
      lastLossTime.current = now;
      loseHeart(reason);
    };

    const start15sCountdown = () => {
      if (isSuppressed()) return;
      if (countdownInterval.current) return;
      countdownRef.current = AWAY_INTERVAL_SECONDS;
      setAwayCountdown(AWAY_INTERVAL_SECONDS);

      countdownInterval.current = setInterval(() => {
        if (isSuppressed()) {
          clearAllTimers();
          return;
        }
        if (!document.hasFocus() || document.hidden) {
          if (countdownRef.current !== null && countdownRef.current > 1) {
            countdownRef.current -= 1;
            setAwayCountdown(countdownRef.current);
          } else {
            // Hit 0 -> deduct 1 heart and reset back to 15s cycle
            tryLoseHeart("Rời màn hình quá 15 giây");
            countdownRef.current = AWAY_INTERVAL_SECONDS;
            setAwayCountdown(AWAY_INTERVAL_SECONDS);
          }
        } else {
          clearAllTimers();
        }
      }, 1000);
    };

    const onNativeDialog = () => {
      // Miễn trừ 8s cho thao tác mở dialog gốc (file picker…) — không trừ tim, không đếm 15s
      suppressUntil.current = Date.now() + 8000;
      clearAllTimers();
    };
    window.addEventListener("cc-native-dialog", onNativeDialog);

    // Detect split-screen / snap — dùng outerWidth để KHÔNG dính zoom (Ctrl +/-),
    // và bỏ qua cơn resize ngay sau lúc thoát fullscreen (transition gây nhiễu).
    const onResize = () => {
      if (document.fullscreenElement) return;
      if (Date.now() - lastFullscreenExitAt.current < 2000) return;
      const screenW = window.screen.availWidth || window.screen.width;
      if (screenW > 600 && window.outerWidth < screenW * 0.82) {
        tryLoseHeart("Chia đôi màn hình / thu nhỏ cửa sổ");
      }
    };
    window.addEventListener("resize", onResize);

    const unsub = subscribe((e) => {
      switch (e.type) {
        case "tabHidden":
          if (blurGraceTimer.current) {
            clearTimeout(blurGraceTimer.current);
            blurGraceTimer.current = null;
          }
          if (isSuppressed()) return;
          tryLoseHeart("Chuyển tab");
          start15sCountdown();
          break;
        case "windowBlur":
          if (blurGraceTimer.current) return;
          if (isSuppressed()) return;
          blurGraceTimer.current = setTimeout(() => {
            blurGraceTimer.current = null;
            tryLoseHeart("Chuyển sang cửa sổ khác");
            start15sCountdown();
          }, 1000);
          break;
        case "windowFocus":
        case "tabVisible":
        case "inputActivity":
          clearAllTimers();
          break;
        case "fullscreenExit":
          lastFullscreenExitAt.current = Date.now();
          setFullscreenActive(false);
          // Nếu ngay sau đó rời tab/blur thì tính là MỘT lần — tryLoseHeart tự gộp,
          // nhưng chỉ phạt thoát fullscreen khi người dùng vẫn ở lại màn hình.
          setTimeout(() => {
            if (!document.fullscreenElement && !document.hidden && !isSuppressed()) {
              tryLoseHeart("Thoát full màn hình");
            }
          }, 350);
          break;
        default:
          break;
      }
    });

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("cc-native-dialog", onNativeDialog);
      clearAllTimers();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fullscreenDenied]);

  return {
    hearts,
    maxHearts,
    fullscreenActive,
    fullscreenDenied,
    requestFullscreen,
    resetHearts,
    lastViolation,
    awayCountdown,
  };
}
