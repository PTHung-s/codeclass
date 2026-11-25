interface AttendanceDay {
  date: string;
  status: string | null; // present | late | excused | absent | cancelled | none | null
}

const STATUS_COLOR: Record<string, string> = {
  present: "bg-emerald-500",
  late: "bg-lime-400",
  excused: "bg-sky-400",
  absent: "bg-red-500",
  cancelled: "bg-gray-300 dark:bg-gray-600",
  none: "bg-gray-100 dark:bg-gray-700/50",
};

const STATUS_LABEL: Record<string, string> = {
  present: "Có mặt",
  late: "Muộn",
  excused: "Có phép",
  absent: "Vắng",
  cancelled: "Nghỉ (cả lớp)",
  none: "—",
};

export function AttendanceLegend() {
  const items: Array<keyof typeof STATUS_COLOR> = ["present", "late", "excused", "absent", "cancelled", "none"];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
      {items.map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-sm ${STATUS_COLOR[s]}`} />
          {STATUS_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

export default function AttendanceHeatmap({ days, cellSize = 14 }: { days: AttendanceDay[]; cellSize?: number }) {
  // Group into weeks (columns of 7)
  const weeks: AttendanceDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day, di) => {
              const status = day.status || "none";
              return (
                <div
                  key={di}
                  className={`rounded-sm ${STATUS_COLOR[status] || STATUS_COLOR.none}`}
                  style={{ width: cellSize, height: cellSize }}
                  title={`${day.date}: ${STATUS_LABEL[status] || "—"}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
