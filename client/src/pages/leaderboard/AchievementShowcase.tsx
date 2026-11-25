import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, ChevronDown, ChevronUp } from "lucide-react";

interface Badge {
  id: string;
  name: string;
  icon: string | null;
}

interface AchievementShowcaseProps {
  badges: Badge[];
}

export default function AchievementShowcase({ badges }: AchievementShowcaseProps) {
  const [expanded, setExpanded] = useState(false);
  const showAll = expanded || badges.length <= 6;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 dark:bg-gray-800 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 dark:text-white">
          🏆 Achievements
          <span className="text-xs font-normal text-gray-400 dark:text-gray-500">({badges.length})</span>
        </h3>
        {badges.length > 6 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
          >
            {expanded ? <>Show less <ChevronUp className="w-3 h-3" /></> : <>Show all <ChevronDown className="w-3 h-3" /></>}
          </button>
        )}
      </div>

      {badges.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center dark:text-gray-500">
          No achievements yet. Start coding to earn badges!
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          <AnimatePresence>
            {(showAll ? badges : badges.slice(0, 6)).map((b, i) => (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: i * 0.03 }}
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-gray-50 border border-gray-100 hover:border-brand-200 hover:bg-brand-50/50 transition-colors cursor-default group dark:bg-gray-800/60 dark:border-gray-700"
                title={b.name}
              >
                <span className="text-2xl group-hover:scale-110 transition-transform">
                  {b.icon || <Star className="w-6 h-6 text-yellow-400" />}
                </span>
                <span className="text-[10px] font-medium text-gray-500 text-center leading-tight truncate max-w-[80px] dark:text-gray-400">
                  {b.name}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
