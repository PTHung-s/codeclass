import { cn } from "../../lib/utils";

export interface RadarDataPoint {
  label: string;
  shortLabel?: string;
  value: number; // 0-1
  skillIds: string[];
  trend?: "up" | "down" | "flat";
  /** False when the student has no approved evidence in this topic yet. */
  hasEvidence?: boolean;
  evidenceSkillCount?: number;
}

interface RadarChartProps {
  data: RadarDataPoint[];
  size?: number;
  className?: string;
  onGroupClick?: (point: RadarDataPoint) => void;
  activeGroup?: string | null;
}

const SHORT_NAMES: Record<string, string> = {
  "Làm quen với Python": "Làm quen",
  "Biến và vào/ra": "Biến & I/O",
  "Toán tử và biểu thức": "Toán tử",
  "Rẽ nhánh": "Rẽ nhánh",
  "Vòng lặp": "Vòng lặp",
  "Xử lý số bằng vòng lặp": "Xử lý số",
  "Danh sách và xâu kí tự": "List & String",
  Hàm: "Hàm",
  "Debug và tư duy giải bài": "Debug",
  "C++: Bắt đầu với C++": "C++ Khởi đầu",
  "C++: Kiểu dữ liệu và biến": "C++ Kiểu & biến",
  "C++: Nhập xuất": "C++ I/O",
  "C++: Toán tử": "C++ Toán tử",
  "C++: Câu lệnh điều kiện": "C++ Rẽ nhánh",
  "C++: Vòng lặp": "C++ Vòng lặp",
  "C++: Mảng": "C++ Mảng",
  "C++: Hàm": "C++ Hàm",
  "C++: Chuỗi ký tự": "C++ Chuỗi",
};

/** Programming language of a skill, from its canonical skill-id prefix. */
export type SkillLanguage = "py" | "cpp";

const langPrefix = (lang: SkillLanguage) => (lang === "cpp" ? "cpp." : "py.");

/** Topics made up of skills of one language (each topic is single-language). */
export function topicsForLanguage<T extends { skills: Array<{ skillId: string }> }>(
  topics: T[],
  lang: SkillLanguage,
): T[] {
  const prefix = langPrefix(lang);
  return topics.filter((t) => t.skills.some((sk) => sk.skillId.startsWith(prefix)));
}

/** Skills of one language, from a flat skill list. */
export function skillsForLanguage<T extends { skillId: string }>(
  skills: T[],
  lang: SkillLanguage,
): T[] {
  const prefix = langPrefix(lang);
  return skills.filter((s) => s.skillId.startsWith(prefix));
}

/**
 * Group skills by topic for radar chart display.
 * Takes flat skills + topic info + optional language → RadarDataPoint[].
 * When `language` is given, only topics whose skills belong to that language
 * are included, so Python and C++ never mix in the same radar.
 *
 * Always emits one axis per catalog topic for that language (even with zero
 * evidence). Topic mastery averages ONLY skills with hasEvidence so unknown
 * skills do not drag a topic toward 0/50%. Topics with no evidence keep
 * value=0 and hasEvidence=false for "—" labels on the chart.
 */
export function groupSkillsByTopic(
  skills: {
    skillId: string;
    name: string;
    mastery: number;
    trend: "up" | "down" | "flat";
    hasEvidence?: boolean;
  }[],
  topics: { topicId: string; topicName: string; skillIds: string[] }[],
  language?: SkillLanguage,
): RadarDataPoint[] {
  const skillMap = new Map(skills.map((s) => [s.skillId, s]));
  const points: RadarDataPoint[] = [];
  const prefix = language ? langPrefix(language) : null;
  const scopedTopics = prefix
    ? topics.filter((t) => t.skillIds.some((sid) => sid.startsWith(prefix!)))
    : topics;

  for (const topic of scopedTopics) {
    // Prefer language-scoped skill ids inside mixed lists (defensive).
    const topicSkillIds = prefix
      ? topic.skillIds.filter((sid) => sid.startsWith(prefix))
      : topic.skillIds;
    if (topicSkillIds.length === 0) continue;

    const topicSkills = topicSkillIds
      .map((sid) => skillMap.get(sid))
      .filter(Boolean) as typeof skills;
    const evidenced = topicSkills.filter((s) => s.hasEvidence !== false && Number.isFinite(s.mastery));
    const hasEvidence = evidenced.length > 0;
    const avgMastery = hasEvidence
      ? evidenced.reduce((sum, s) => sum + s.mastery, 0) / evidenced.length
      : 0;
    const hasDown = evidenced.some((s) => s.trend === "down");
    const hasUp = evidenced.some((s) => s.trend === "up");
    points.push({
      label: topic.topicName,
      shortLabel: SHORT_NAMES[topic.topicName] || topic.topicName,
      value: avgMastery,
      skillIds: topicSkillIds,
      trend: hasDown ? "down" : hasUp ? "up" : "flat",
      hasEvidence,
      evidenceSkillCount: evidenced.length,
    });
  }

  // Keep curriculum order (topics array order) so advanced chapters stay
  // visible even when mastery is still low / zero.
  return points;
}

export function RadarChart({ data, size = 280, className, onGroupClick, activeGroup }: RadarChartProps) {
  if (data.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.36;
  const levels = 4;

  // Rotate so "Vòng lặp" is at 12 o'clock if present
  const loopIdx = data.findIndex((d) => d.label.includes("Vòng lặp"));
  const rotated = loopIdx >= 0 ? [...data.slice(loopIdx), ...data.slice(0, loopIdx)] : data;

  const angleStep = (2 * Math.PI) / rotated.length;
  const startAngle = -Math.PI / 2; // 12 o'clock

  // Build hex color from mastery value (red → amber → green)
  const masteryColor = (v: number) => {
    if (v < 0.5) {
      const t = v / 0.5;
      const r = 239;
      const g = Math.round(68 + t * (245 - 68));
      const b = Math.round(68 + t * (158 - 68));
      return `rgb(${r},${g},${b})`;
    }
    const t = (v - 0.5) / 0.5;
    const r = Math.round(245 - t * (34 - 245));
    const g = Math.round(158 - t * (197 - 158));
    const b = Math.round(48 - t * (94 - 48));
    return `rgb(${r},${g},${b})`;
  };

  const polygonPoints = rotated
    .map((d, i) => {
      const angle = startAngle + i * angleStep;
      const r = radius * d.value;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    })
    .join(" ");

  return (
    <div className={cn("mx-auto", className)} style={{ maxWidth: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        height="100%"
        className="overflow-visible"
        aria-label="Biểu đồ kỹ năng radar"
      >
        {/* Concentric rings */}
        {Array.from({ length: levels }, (_, i) => {
          const r = radius * ((i + 1) / levels);
          const points = Array.from({ length: 60 }, (_, j) => {
            const a = (2 * Math.PI * j) / 60;
            return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
          }).join(" ");
          return (
            <polygon
              key={i}
              points={points}
              fill="none"
              stroke="currentColor"
              className="text-border/60"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Axis lines */}
        {rotated.map((_, i) => {
          const angle = startAngle + i * angleStep;
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={cx + radius * Math.cos(angle)}
              y2={cy + radius * Math.sin(angle)}
              stroke="currentColor"
              className="text-border/40"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Mastery polygon */}
        <polygon
          points={polygonPoints}
          fill="#0066cc"
          fillOpacity={0.15}
          stroke="#0066cc"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Data points */}
        {rotated.map((d, i) => {
          const angle = startAngle + i * angleStep;
          const evidenced = d.hasEvidence !== false;
          const r = evidenced ? radius * Math.max(0.05, d.value) : 0;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          const isActive = activeGroup === d.label;
          return (
            <g key={i}>
              <circle
                cx={x}
                cy={y}
                r={isActive ? 6 : evidenced ? 3.5 : 2.5}
                fill={evidenced ? masteryColor(d.value) : "currentColor"}
                className={cn(
                  "cursor-pointer transition-all",
                  evidenced ? (isActive ? "drop-shadow-lg" : "hover:drop-shadow-md") : "text-muted-foreground/40",
                )}
                onClick={() => onGroupClick?.(d)}
              />
              {isActive && evidenced && (
                <circle
                  cx={x}
                  cy={y}
                  r={8}
                  fill="none"
                  stroke={masteryColor(d.value)}
                  strokeWidth={1.5}
                  opacity={0.4}
                />
              )}
            </g>
          );
        })}

        {/* Labels */}
        {rotated.map((d, i) => {
          const angle = startAngle + i * angleStep;
          const labelR = radius * 1.25;
          const x = cx + labelR * Math.cos(angle);
          const y = cy + labelR * Math.sin(angle);
          const anchor = x < cx - 5 ? "end" : x > cx + 5 ? "start" : "middle";
          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="fill-foreground text-[10px] font-medium"
            >
              <tspan x={x} dy="-0.4em">
                {d.shortLabel || d.label}
              </tspan>
              <tspan x={x} dy="1.2em" className="fill-muted-foreground text-[9px]">
                {d.hasEvidence === false ? "—" : `${Math.round(d.value * 100)}%`}
              </tspan>
            </text>
          );
        })}

        {/* Center label — average only topics that already have evidence */}
        {(() => {
          // Prefer explicit hasEvidence; fall back to value>0 for older callers.
          const evidenced = rotated.filter(
            (d) => d.hasEvidence === true || (d.hasEvidence === undefined && d.value > 0),
          );
          const avg = evidenced.length > 0
            ? evidenced.reduce((s, d) => s + d.value, 0) / evidenced.length
            : null;
          return (
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
              <tspan className="fill-foreground text-xl font-black">
                {avg === null ? "—" : `${Math.round(avg * 100)}%`}
              </tspan>
              <tspan x={cx} dy="1.4em" className="fill-muted-foreground text-[10px]">
                trung bình
              </tspan>
            </text>
          );
        })()}
      </svg>
    </div>
  );
}
