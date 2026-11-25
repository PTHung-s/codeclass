import { motion } from "framer-motion";

const TABS = [
  { id: "today", label: "Today", short: "Today" },
  { id: "week", label: "This Week", short: "Week" },
  { id: "month", label: "This Month", short: "Month" },
  { id: "all", label: "All Time", short: "All" },
] as const;

export type Period = (typeof TABS)[number]["id"];

interface TimeTabsProps {
  active: Period;
  onChange: (period: Period) => void;
}

export default function TimeTabs({ active, onChange }: TimeTabsProps) {
  return (
    <div className="flex items-center rounded-xl bg-gray-100 p-1 overflow-x-auto">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`relative px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
            active === tab.id ? "text-white" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {active === tab.id && (
            <motion.div
              layoutId="timeTab"
              className="absolute inset-0 bg-brand-600 rounded-lg"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10">
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.short}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
