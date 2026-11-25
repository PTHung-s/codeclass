import { useState, useEffect } from "react";

interface PixelSpriteProps {
  src: string;
  frameWidth: number;
  frameHeight: number;
  totalFrames: number;
  fps?: number;
  className?: string;
}

export default function PixelSprite({
  src,
  frameWidth,
  frameHeight,
  totalFrames,
  fps = 8,
  className = "",
}: PixelSpriteProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % totalFrames);
    }, 1000 / fps);
    return () => clearInterval(timer);
  }, [totalFrames, fps]);

  return (
    <div
      className={`inline-block overflow-hidden image-pixelated ${className}`}
      style={{
        width: `${frameWidth}px`,
        height: `${frameHeight}px`,
        backgroundImage: `url('${src}')`,
        backgroundPosition: `-${frame * frameWidth}px 0px`,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
