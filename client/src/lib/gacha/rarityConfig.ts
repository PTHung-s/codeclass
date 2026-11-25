import type { Rarity } from "../../types/gacha";

export interface RarityDetails {
  label: string;
  color: string;
  color2: string;
  duration: number;
  particles: number;
  shake: number;
}

export const rarityConfig: Record<Rarity, RarityDetails> = {
  common: {
    label: "Common",
    color: "#d8dde8",
    color2: "#8d97a8",
    duration: 1750,
    particles: 18,
    shake: 1,
  },
  rare: {
    label: "Rare",
    color: "#38bdf8",
    color2: "#0066cc",
    duration: 1950,
    particles: 28,
    shake: 2,
  },
  epic: {
    label: "Epic",
    color: "#2dd4bf",
    color2: "#0d9488",
    duration: 2150,
    particles: 38,
    shake: 4,
  },
  legendary: {
    label: "Legendary",
    color: "#fbbf24",
    color2: "#ea580c",
    duration: 2400,
    particles: 50,
    shake: 5,
  },
  mythic: {
    label: "Mythic",
    color: "#f43f5e",
    color2: "#fbbf24",
    duration: 2500,
    particles: 58,
    shake: 6,
  },
};
