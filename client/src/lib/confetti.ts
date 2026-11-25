import confetti from "canvas-confetti";

let lastFireTime = 0;

export function fireACConfetti() {
  // Debounce: prevent double-fire within 2 seconds
  const now = Date.now();
  if (now - lastFireTime < 2000) return;
  lastFireTime = now;

  try {
    // First burst - from left
    confetti({
      particleCount: 100,
      spread: 70,
      angle: 60,
      origin: { x: 0, y: 0.6 },
      colors: ["#10b981", "#34d399", "#fbbf24", "#f59e0b", "#0066cc", "#0066cc"],
      zIndex: 99999,
    });

    // Second burst - from right
    confetti({
      particleCount: 100,
      spread: 70,
      angle: 120,
      origin: { x: 1, y: 0.6 },
      colors: ["#10b981", "#34d399", "#fbbf24", "#f59e0b", "#0066cc", "#0066cc"],
      zIndex: 99999,
    });

    // Center celebration - bigger particles
    setTimeout(() => {
      try {
        confetti({
          particleCount: 80,
          spread: 100,
          origin: { x: 0.5, y: 0.4 },
          colors: ["#fbbf24", "#f59e0b", "#10b981", "#0066cc"],
          scalar: 1.5,
          zIndex: 99999,
        });
      } catch {
        // Silently ignore confetti errors
      }
    }, 200);
  } catch {
    // Silently ignore confetti errors
  }
}
