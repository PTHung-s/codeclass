// Avatar shop configuration (synced with server)

export interface AvatarTier {
  id: string;
  name: string;
  animalName: string;
  cost: number;
  order: number;
  unlocked?: boolean;
  selected?: boolean;
}

export const AVATAR_TIERS: AvatarTier[] = [
  { id: "default", name: "Mặc định", animalName: "Penguin", cost: 0, order: 0 },
  { id: "fox", name: "Cáo Đỏ", animalName: "Fox", cost: 25, order: 1 },
  { id: "panda", name: "Gấu Trúc", animalName: "Panda", cost: 50, order: 2 },
  { id: "raccoon", name: "Gấu Trúc Đỏ", animalName: "Raccoon", cost: 75, order: 3 },
  { id: "koala", name: "Gấu Túi", animalName: "Koala", cost: 125, order: 4 },
  { id: "axolotl", name: "Kỳ Nhông", animalName: "Axolotl", cost: 200, order: 5 },
  { id: "tiger", name: "Hổ Vằn", animalName: "Tiger", cost: 300, order: 6 },
  { id: "dinosaur", name: "Khủng Long", animalName: "Dinosaur", cost: 450, order: 7 },
];

export function getAvatarUrl(animalName: string): string {
  return `https://anonymous-animals.azurewebsites.net/animal/${animalName}`;
}

export function getAvatarBgColor(index: number): string {
  const colors = [
    "#0066cc", "#0066cc", "#ec4899", "#f43f5e", "#f97316",
    "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6"
  ];
  return colors[index % colors.length];
}
