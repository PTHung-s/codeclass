import { useEffect, useRef, useCallback } from "react";

export default function DinoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<any>(null);

  const initGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = 700;
    const H = 250;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    // ctx is guaranteed non-null for canvas elements

    const GROUND = 200;
    let gameSpeed = 5;
    let score = 0;
    let gameOver = false;
    let started = false;

    const dino = { x: 60, y: GROUND, w: 30, h: 40, vy: 0, jumping: false };
    const GRAVITY = 0.7;
    const JUMP_FORCE = -12;
    const obstacles: { x: number; h: number }[] = [];
    let frameCount = 0;
    let SPAWN_RATE = 80;

    function reset() {
      dino.y = GROUND;
      dino.vy = 0;
      dino.jumping = false;
      obstacles.length = 0;
      gameSpeed = 5;
      score = 0;
      gameOver = false;
      started = false;
      frameCount = 0;
      SPAWN_RATE = 80;
    }

    function jump() {
      if (gameOver) {
        reset();
        return;
      }
      started = true;
      if (!dino.jumping) {
        dino.vy = JUMP_FORCE;
        dino.jumping = true;
      }
    }

    function drawDino(y: number) {
      const x = dino.x;
      ctx.fillStyle = "#334155";
      ctx.fillRect(x + 8, y - 24, 16, 24);
      ctx.fillRect(x + 18, y - 36, 10, 14);
      ctx.fillStyle = "white";
      ctx.fillRect(x + 22, y - 34, 3, 3);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(x + 23, y - 33, 1.5, 1.5);
      ctx.fillStyle = "#334155";
      if (!dino.jumping || dino.vy < -3) {
        ctx.fillRect(x + 4, y - 8, 6, 8);
        ctx.fillRect(x + 14, y - 8, 6, 8);
      } else {
        ctx.fillRect(x + 4, y - 4, 6, 8);
        ctx.fillRect(x + 18, y - 4, 6, 8);
      }
      ctx.fillRect(x + 2, y - 18, 6, 6);
      ctx.fillRect(x + 12, y - 18, 4, 4);
    }

    function drawCactus(x: number, h: number) {
      const baseY = GROUND - h;
      ctx.fillStyle = "#16a34a";
      ctx.fillRect(x + 6, baseY, 8, h);
      ctx.fillRect(x, baseY + h * 0.2, 8, 6);
      ctx.fillRect(x + 10, baseY + h * 0.35, 8, 6);
      ctx.fillStyle = "#166534";
      ctx.fillRect(x + 7, baseY, 1.5, h);
    }

    function drawGround() {
      ctx.fillStyle = "#d4d4d4";
      ctx.fillRect(0, GROUND + 2, W, 2);
      ctx.fillStyle = "#a3a3a3";
      const offset = (frameCount * gameSpeed) % 20;
      for (let i = -20 + offset; i < W + 20; i += 20) {
        ctx.fillRect(i, GROUND + 6, 10, 2);
      }
    }

    function drawCloud(x: number, y: number) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.arc(x + 18, y - 5, 13, 0, Math.PI * 2);
      ctx.arc(x + 35, y, 16, 0, Math.PI * 2);
      ctx.fill();
    }

    function update() {
      if (gameOver) {
        ctx.fillStyle = "#dc2626";
        ctx.font = "bold 28px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Game Over!", W / 2, H / 2 - 10);
        ctx.fillStyle = "#64748b";
        ctx.font = "14px -apple-system, sans-serif";
        ctx.fillText("Nhấn Space để chơi lại", W / 2, H / 2 + 20);
        ctx.textAlign = "start";
        return;
      }

      if (!started) {
        ctx.fillStyle = "#64748b";
        ctx.font = "bold 18px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Nhấn Space hoặc Chạm để bắt đầu!", W / 2, H / 2);
        ctx.textAlign = "start";
        drawDino(GROUND);
        drawGround();
        return;
      }

      frameCount++;
      dino.y += dino.vy;
      dino.vy += GRAVITY;
      if (dino.y >= GROUND) {
        dino.y = GROUND;
        dino.vy = 0;
        dino.jumping = false;
      }

      gameSpeed = 5 + Math.floor(score / 150);
      SPAWN_RATE = Math.max(35, 80 - Math.floor(score / 100) * 5);

      if (frameCount % SPAWN_RATE === 0) {
        const h = 30 + Math.floor(Math.random() * 25);
        obstacles.push({ x: W, h });
      }

      for (let i = obstacles.length - 1; i >= 0; i--) {
        obstacles[i].x -= gameSpeed;
        if (obstacles[i].x < -30) {
          obstacles.splice(i, 1);
          score += 10;
        }
      }

      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (
          o.x < dino.x + dino.w - 5 &&
          o.x + 14 > dino.x + 5 &&
          GROUND - o.h < dino.y &&
          GROUND > dino.y - dino.h + 10
        ) {
          gameOver = true;
        }
      }

      ctx.clearRect(0, 0, W, H);

      const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND);
      skyGrad.addColorStop(0, "#f0f9ff");
      skyGrad.addColorStop(1, "#e0f2fe");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, GROUND);

      drawCloud(W - ((frameCount * 2) % (W + 100)) + 100, 30);
      drawCloud(W - ((frameCount * 1.5 + 200) % (W + 100)) + 100, 50);
      drawGround();

      for (let i = 0; i < obstacles.length; i++) {
        drawCactus(obstacles[i].x, obstacles[i].h);
      }

      drawDino(dino.y);

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 20px -apple-system, monospace";
      ctx.textAlign = "right";
      ctx.fillText("Score: " + score, W - 15, 35);
      ctx.textAlign = "start";
    }

    function gameLoop() {
      update();
      gameRef.current = requestAnimationFrame(gameLoop);
    }

    // Listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
        jump();
      }
    };

    const handleTouch = (e: Event) => {
      e.preventDefault();
      jump();
    };

    window.addEventListener("keydown", handleKeyDown);
    canvas.addEventListener("touchstart", handleTouch, { passive: false });
    canvas.addEventListener("click", handleTouch);

    gameLoop();

    // Cleanup
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("touchstart", handleTouch);
      canvas.removeEventListener("click", handleTouch);
      if (gameRef.current) cancelAnimationFrame(gameRef.current);
    };
  }, []);

  useEffect(() => {
    const cleanup = initGame();
    return () => cleanup?.();
  }, [initGame]);

  return (
    <div style={{ margin: "1.5rem 0" }}>
      <div
        style={{
          background: "linear-gradient(180deg, #f0f9ff 0%, #e0f2fe 40%, #fef3c7 40%, #fef3c7 100%)",
          borderRadius: "1rem",
          overflow: "hidden",
          border: "2px solid #e2e8f0",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "auto", cursor: "pointer" }}
        />
        <div
          style={{
            textAlign: "center",
            padding: "0.75rem",
            background: "#1e293b",
            color: "#e2e8f0",
            fontSize: "0.85rem",
          }}
        >
          Nhấn <kbd style={{ background: "#334155", padding: "0.2rem 0.5rem", borderRadius: "0.3rem", fontSize: "0.8rem", border: "1px solid #475569" }}>Space</kbd> hoặc{" "}
          <kbd style={{ background: "#334155", padding: "0.2rem 0.5rem", borderRadius: "0.3rem", fontSize: "0.8rem", border: "1px solid #475569" }}>↑</kbd> hoặc <strong>Chạm màn hình</strong> để nhảy!
        </div>
      </div>
    </div>
  );
}
