import { motion } from "framer-motion";
import { Medal } from "lucide-react";
import { Link } from "react-router-dom";
import { getAnimalAvatarUrl, getAvatarBgColor } from "../../lib/utils";

interface PodiumEntry {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  xp: number;
  rank: number;
  levelTitle: string;
}

interface PodiumProps {
  entries: PodiumEntry[];
}

function PodiumSpot({ entry, height, delay }: { entry: PodiumEntry; height: string; delay: number }) {
  const medals = ["", "🥇", "🥈", "🥉"];
  const isFirst = entry.rank === 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 200, damping: 20 }}
      className="flex flex-col items-center"
    >
      <Link to={`/students/${entry.userId}`} title={`Xem hồ sơ ${entry.fullName}`}>
        {/* Avatar */}
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: delay * 0.3 }}
          className={`relative mb-2 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg cursor-pointer hover:scale-110 transition-transform ${ isFirst ? "w-20 h-20 bg-yellow-100 text-yellow-700 ring-4 ring-yellow-300" : entry.rank === 2 ? "w-16 h-16 bg-gray-100 text-gray-600 ring-4 ring-gray-300" : "w-16 h-16 bg-amber-100 text-amber-700 ring-4 ring-amber-300" } dark:text-gray-400`}
        >
          <img src={entry.avatarUrl || getAnimalAvatarUrl(entry.fullName)} alt="" className="w-full h-full rounded-full object-cover" style={{ backgroundColor: getAvatarBgColor(entry.fullName) }} />
          <span className="absolute -top-1 -right-1 text-xl">{medals[entry.rank]}</span>
        </motion.div>

        {/* Info */}
        <p className="text-sm font-semibold text-gray-900 truncate max-w-[100px] text-center hover:text-brand-600 transition-colors dark:text-white">
          {entry.fullName}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{entry.levelTitle}</p>
        <p className="text-sm font-bold text-brand-600">{entry.xp} XP</p>
      </Link>

      {/* Podium base */}
      <div
        className={`w-full max-w-[100px] rounded-t-lg mt-1 ${height} ${
          isFirst
            ? "bg-gradient-to-b from-yellow-400 to-yellow-500"
            : entry.rank === 2
            ? "bg-gradient-to-b from-gray-300 to-gray-400"
            : "bg-gradient-to-b from-amber-500 to-amber-600"
        }`}
      >
        <div className="flex items-center justify-center h-full">
          <span className="text-white font-bold text-lg">#{entry.rank}</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function Podium({ entries }: PodiumProps) {
  if (entries.length < 3) return null;

  // Display order: 2nd (left), 1st (center, tallest), 3rd (right)
  const ordered = [entries[1], entries[0], entries[2]]; // rank 2, 1, 3

  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6 py-6 max-w-lg mx-auto">
      <PodiumSpot entry={ordered[0]} height="h-20 sm:h-24" delay={0.1} />
      <PodiumSpot entry={ordered[1]} height="h-28 sm:h-32" delay={0} />
      <PodiumSpot entry={ordered[2]} height="h-16 sm:h-20" delay={0.2} />
    </div>
  );
}
