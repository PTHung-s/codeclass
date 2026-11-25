export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";

export interface GachaReward {
  id: string;
  uniqueId?: string;
  name: string;
  description: string;
  rarity: Rarity;
  rewardType: "xp" | "tokens" | "hint_credits" | "streak_freeze" | "avatar" | "emoji" | "sticker" | "puzzle_piece" | "custom";
  amount: number;
  icon: string;
  avatarId?: string;
  emojiCode?: string;
  stickerId?: string;
  stickerUrl?: string;
  gemsEarned?: number;
  puzzleRewardId?: string;
  pieceIndex?: number; // 0, 1, 2, 3
  pieceName?: string;
  puzzleImageUrl?: string;
}

export type PackState = "idle" | "opening" | "cards" | "summary";

export interface PhysicalReward {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string;
  rarity: string;
  stock: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface UserPiece {
  id: string;
  rewardId: string;
  pieceIndex: number;
  count: number;
}

export interface PuzzleProgress {
  reward: PhysicalReward;
  pieces: UserPiece[];
  collectedCount: number;
  totalRequired: number;
  isComplete: boolean;
}

export interface GachaInfo {
  tokenBalance: number;
  xp: number;
  pity: number;
  hardPity: number;
  gemBalance: number;
  costs: {
    x1: number;
    x10: number;
  };
  rates: Record<Rarity, number>;
  rewardsPool: GachaReward[];
  recentPulls: any[];
  puzzleProgress?: PuzzleProgress[];
}
