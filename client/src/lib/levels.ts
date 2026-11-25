// XP → Level & League calculation (shared between client and server)

export interface LevelInfo {
  level: number;
  league: string;        // "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond" | "Master" | "Grandmaster"
  leagueEmoji: string;   // 🥉🥈🥇💎💠👑⚡
  leagueColor: string;   // tailwind color classes for bg/text
  subTier: string;       // "I" | "II" | "III" | "IV" | "V"
  levelTitle: string;    // "Bronze I", "Silver II", etc.
  currentLevelMinXp: number;
  nextLevelXp: number;
  xpInLevel: number;
  xpToNextLevel: number;
  levelProgress: number; // 0–100
}

const LEAGUE_DEFS = [
  { name: "Bronze", emoji: "🥉", color: "amber", minLevel: 1, maxLevel: 5 },
  { name: "Silver", emoji: "🥈", color: "gray", minLevel: 6, maxLevel: 10 },
  { name: "Gold", emoji: "🥇", color: "yellow", minLevel: 11, maxLevel: 15 },
  { name: "Platinum", emoji: "💎", color: "cyan", minLevel: 16, maxLevel: 20 },
  { name: "Diamond", emoji: "💠", color: "blue", minLevel: 21, maxLevel: 25 },
  { name: "Master", emoji: "👑", color: "purple", minLevel: 26, maxLevel: 30 },
  { name: "Grandmaster", emoji: "⚡", color: "red", minLevel: 31, maxLevel: Infinity },
];

const ROMAN_TIERS = ["V", "IV", "III", "II", "I"]; // 5=V (lowest), 1=I (highest)

/**
 * XP formula: Level = floor(sqrt(xp / 10)) + 1
 * So: 0 XP = L1, 10 XP = L2, 40 XP = L3, 90 XP = L4, 160 XP = L5, etc.
 */
export function getLevelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 10)) + 1;
}

/** Total XP needed to reach a given level (exclusive) */
export function getXpForLevel(level: number): number {
  return (level - 1) * (level - 1) * 10;
}

/** Get full level info from XP */
export function getLevelInfo(xp: number): LevelInfo {
  const level = getLevelFromXp(xp);
  const currentLevelMinXp = getXpForLevel(level);
  const nextLevelXp = getXpForLevel(level + 1);
  const xpInLevel = xp - currentLevelMinXp;
  const xpToNextLevel = nextLevelXp - currentLevelMinXp;
  const levelProgress = xpToNextLevel > 0 ? Math.round((xpInLevel / xpToNextLevel) * 100) : 100;

  const leagueDef = LEAGUE_DEFS.find((l) => level >= l.minLevel && level <= l.maxLevel)!;
  const levelInLeague = level - leagueDef.minLevel + 1; // 1..5 within league
  const subTier = ROMAN_TIERS[levelInLeague - 1]; // 1→I (highest), 5→V (lowest)

  return {
    level,
    league: leagueDef.name,
    leagueEmoji: leagueDef.emoji,
    leagueColor: leagueDef.color,
    subTier,
    levelTitle: `${leagueDef.name} ${subTier}`,
    currentLevelMinXp,
    nextLevelXp,
    xpInLevel,
    xpToNextLevel,
    levelProgress,
  };
}

/** Map league color name to Tailwind classes */
export function leagueTailwind(leagueColor: string): { bg: string; text: string; border: string; bar: string } {
  const map: Record<string, { bg: string; text: string; border: string; bar: string }> = {
    amber:  { bg: "bg-amber-100",   text: "text-amber-700",   border: "border-amber-200",   bar: "bg-amber-500" },
    gray:   { bg: "bg-gray-100",    text: "text-gray-700",    border: "border-gray-200",    bar: "bg-gray-400" },
    yellow: { bg: "bg-yellow-100",  text: "text-yellow-700",  border: "border-yellow-200",  bar: "bg-yellow-500" },
    cyan:   { bg: "bg-cyan-100",    text: "text-cyan-700",    border: "border-cyan-200",    bar: "bg-cyan-500" },
    blue:   { bg: "bg-blue-100",    text: "text-blue-700",    border: "border-blue-200",    bar: "bg-blue-500" },
    purple: { bg: "bg-blue-100",  text: "text-blue-700",  border: "border-blue-200",  bar: "bg-blue-500" },
    red:    { bg: "bg-red-100",     text: "text-red-700",     border: "border-red-200",     bar: "bg-red-500" },
  };
  return map[leagueColor] || map.amber;
}

export { LEAGUE_DEFS, ROMAN_TIERS };
