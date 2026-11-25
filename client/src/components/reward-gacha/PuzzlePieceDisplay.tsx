import React, { useId } from "react";

/**
 * 4 Closed SVG Paths chuẩn xác 100% cho 4 mảnh ghép Puzzle 2x2:
 * - Base square: [0, 0] -> [100, 100]
 * - Khớp nối tròn cổ điển (Smooth bulbous head with wide neck):
 *   + Độ sâu mấu: 18px (vươn từ y=0 tới y=-18 hoặc x=100 tới x=118)
 *   + Cổ rộng 20px, vòm đầu tròn rộng 24px, tiếp tuyến C1 trơn tru tuyệt đối, không có góc nhọn hay giọt nước.
 *   + Các cạnh đối xứng và complementary ăn khớp nhau 100% từng pixel.
 * - ViewBox: -20 -20 140 140
 */
const PUZZLE_PATHS = [
  // Piece 0 (Top-Left): Phẳng Top, Mấu phải (+X), Lỗ dưới (-Y), Phẳng trái
  "M 0,0 L 100,0 L 100,35 C 100,39 104,41 108,40 C 115,39 118,44 118,50 C 118,56 115,61 108,60 C 104,59 100,61 100,65 L 100,100 L 65,100 C 61,100 59,96 60,92 C 61,85 56,82 50,82 C 44,82 39,85 40,92 C 41,96 39,100 35,100 L 0,100 Z",

  // Piece 1 (Top-Right): Phẳng Top, Phẳng phải, Mấu dưới (+Y), Lỗ trái (+X)
  "M 0,0 L 100,0 L 100,100 L 65,100 C 61,100 59,104 60,108 C 61,115 56,118 50,118 C 44,118 39,115 40,108 C 41,104 39,100 35,100 L 0,100 L 0,65 C 0,61 4,59 8,60 C 15,61 18,56 18,50 C 18,44 15,39 8,40 C 4,41 0,39 0,35 L 0,0 Z",

  // Piece 2 (Bottom-Left): Mấu trên (-Y), Lỗ phải (-X), Phẳng dưới, Phẳng trái
  "M 0,0 L 35,0 C 39,0 41,-4 40,-8 C 39,-15 44,-18 50,-18 C 56,-18 61,-15 60,-8 C 59,-4 61,0 65,0 L 100,0 L 100,35 C 100,39 96,41 92,40 C 85,39 82,44 82,50 C 82,56 85,61 92,60 C 96,59 100,61 100,65 L 100,100 L 0,100 Z",

  // Piece 3 (Bottom-Right): Lỗ trên (+Y), Phẳng phải, Phẳng dưới, Mấu trái (-X)
  "M 0,0 L 35,0 C 39,0 41,4 40,8 C 39,15 44,18 50,18 C 56,18 61,15 60,8 C 59,4 61,0 65,0 L 100,0 L 100,100 L 0,100 L 0,65 C 0,61 -4,59 -8,60 C -15,61 -18,56 -18,50 C -18,44 -15,39 -8,40 C -4,41 0,39 0,35 L 0,0 Z",
];

// Offset ảnh gốc 200x200 cắt chuẩn 4 góc (100x100 mỗi góc)
const IMAGE_OFFSETS = [
  { x: 0, y: 0 },       // Top-Left (Piece 0)
  { x: -100, y: 0 },    // Top-Right (Piece 1)
  { x: 0, y: -100 },    // Bottom-Left (Piece 2)
  { x: -100, y: -100 }, // Bottom-Right (Piece 3)
];

export function PuzzlePieceDisplay({
  imageUrl,
  pieceIndex,
  size = 100,
  hasPiece = true,
  count = 1,
  showCount = false,
}: {
  imageUrl: string;
  pieceIndex: number; // 0, 1, 2, 3
  size?: number;
  hasPiece?: boolean;
  count?: number;
  showCount?: boolean;
}) {
  const rawId = useId();
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `puzzle-clip-${pieceIndex}-${safeId}`;
  const pathD = PUZZLE_PATHS[pieceIndex] || PUZZLE_PATHS[0];
  const imgOffset = IMAGE_OFFSETS[pieceIndex] || IMAGE_OFFSETS[0];

  // Tỷ lệ scale: ViewBox 140x140 với base 100x100
  const svgScale = size / 100;
  const svgDimension = 140 * svgScale;
  const offsetTranslate = -20 * svgScale;

  return (
    <div
      className="relative flex items-center justify-center select-none overflow-visible"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="-20 -20 140 140"
        className="absolute pointer-events-none overflow-visible drop-shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
        style={{
          width: svgDimension,
          height: svgDimension,
          transform: `translate(${offsetTranslate}px, ${offsetTranslate}px)`,
          left: 0,
          top: 0,
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={pathD} />
          </clipPath>

          {/* Viền mạ vàng bóng bẩy sang trọng */}
          <linearGradient id={`gold-border-${safeId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>

          {/* Lớp tráng gương nhẹ trên mặt mảnh ghép */}
          <linearGradient id={`sheen-${safeId}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        {hasPiece ? (
          <g>
            <g clipPath={`url(#${clipId})`}>
              <image
                href={imageUrl}
                x={imgOffset.x}
                y={imgOffset.y}
                width="200"
                height="200"
                preserveAspectRatio="xMidYMid slice"
              />
              <rect x="-20" y="-20" width="140" height="140" fill={`url(#sheen-${safeId})`} />
            </g>

            {/* Đường viền bo cong tròn mềm mại theo mấu puzzle */}
            <path
              d={pathD}
              fill="none"
              stroke={`url(#gold-border-${safeId})`}
              strokeWidth="2.2"
              strokeLinejoin="round"
              className="drop-shadow-[0_0_2px_rgba(245,158,11,0.5)]"
            />
          </g>
        ) : (
          <g>
            {/* Mảnh chưa có: Nét đứt trong suốt mềm mại */}
            <path
              d={pathD}
              fill="rgba(241, 245, 249, 0.75)"
              stroke="rgba(148, 163, 184, 0.45)"
              strokeWidth="1.6"
              strokeDasharray="3.5 3.5"
              strokeLinejoin="round"
              className="dark:fill-slate-900/60 dark:stroke-slate-700"
            />
            <text
              x="50"
              y="54"
              fill="#94a3b8"
              fontSize="14"
              fontWeight="900"
              textAnchor="middle"
              dominantBaseline="middle"
              className="dark:fill-slate-600 font-mono"
            >
              #{pieceIndex + 1}
            </text>
          </g>
        )}
      </svg>

      {/* Badge số thứ tự góc */}
      {hasPiece && (
        <div className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.2 rounded bg-black/80 border border-amber-400/50 text-[8.5px] font-mono font-bold text-amber-300 shadow leading-none pointer-events-none">
          #{pieceIndex + 1}
        </div>
      )}

      {/* Badge số lượng sở hữu */}
      {showCount && count > 1 && (
        <div className="absolute bottom-1.5 right-1.5 z-10 px-1.5 py-0.2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-[9px] shadow-md border border-white/40 leading-tight pointer-events-none">
          x{count}
        </div>
      )}
    </div>
  );
}

/**
 * Khung hiển thị Tranh ghép 4 Mảnh Puzzle Hoàn Chỉnh (2x2)
 * Khoảng cách giữa các mảnh gap = 4px tách nhẹ nhàng, thanh lịch.
 */
export function PuzzleBoard({
  imageUrl,
  pieces = [],
  size = 200,
  showCount = true,
  gap = 4,
}: {
  imageUrl: string;
  pieces?: Array<{ pieceIndex: number; count: number }>;
  size?: number;
  showCount?: boolean;
  gap?: number;
}) {
  const pieceMap = new Map(pieces.map((p) => [p.pieceIndex, p.count]));
  const pieceSize = (size - gap) / 2;

  return (
    <div
      className="relative select-none overflow-visible"
      style={{ width: size, height: size }}
    >
      {[0, 1, 2, 3].map((idx) => {
        const has = pieceMap.has(idx);
        const count = pieceMap.get(idx) || 0;
        const left = (idx % 2) * (pieceSize + gap);
        const top = Math.floor(idx / 2) * (pieceSize + gap);

        return (
          <div
            key={idx}
            className="absolute overflow-visible"
            style={{ left, top, width: pieceSize, height: pieceSize }}
          >
            <PuzzlePieceDisplay
              imageUrl={imageUrl}
              pieceIndex={idx}
              size={pieceSize}
              hasPiece={has}
              count={count}
              showCount={showCount}
            />
          </div>
        );
      })}
    </div>
  );
}
