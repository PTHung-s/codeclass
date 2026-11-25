import { useCallback, useEffect, useRef, useState } from "react";
import api from "../lib/api";
import type { GachaInfo, GachaReward, PackState, Rarity } from "../types/gacha";
import { playGachaRevealSound, playChargeSound, playLaserCutSound } from "../lib/soundEffects";
import { useToast } from "./useToast";

const RARITY_RANK: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
  mythic: 4,
};

export function useCardPack() {
  const toast = useToast();
  const [state, setState] = useState<PackState>("idle");
  const [cards, setCards] = useState<GachaReward[]>([]);
  const [pity, setPity] = useState(0);
  const [hardPity, setHardPity] = useState(30);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [costs, setCosts] = useState({ x1: 10, x10: 90 });
  const [revealed, setRevealed] = useState<number[]>([]);
  const [packSize, setPackSize] = useState<1 | 10>(1);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<GachaInfo | null>(null);
  const timer = useRef<number | null>(null);

  const loadInfo = useCallback(async () => {
    try {
      const res = await api.get("/gacha/info");
      setInfo(res.data);
      setPity(res.data.pity);
      setHardPity(res.data.hardPity);
      setTokenBalance(res.data.tokenBalance);
      if (res.data.costs) setCosts(res.data.costs);
    } catch (err) {}
  }, []);

  useEffect(() => {
    loadInfo();
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [loadInfo]);

  const openPack = useCallback(
    async (count: 1 | 10) => {
      if (state !== "idle" || loading) return;
      const cost = count === 10 ? costs.x10 : costs.x1;
      if (tokenBalance < cost) {
        toast.error({
          title: "Không đủ Tokens/Vàng",
          message: `Bạn cần ${cost} Vàng để mở gói này. Hãy hoàn thành nhiệm vụ để kiếm thêm nhé!`,
        });
        return;
      }

      setLoading(true);
      try {
        const res = await api.post("/gacha/roll", { count });
        setCards(res.data.cards);
        setPackSize(count);
        setPity(res.data.pity);
        setTokenBalance(res.data.balance);
        setRevealed([]);
        setState("opening");
        playChargeSound();

        window.setTimeout(() => {
          playLaserCutSound();
        }, 220);

        // Tìm độ hiếm cao nhất trong pack để phát nhạc thích hợp
        const highestRarity = res.data.cards.reduce((best: Rarity, c: GachaReward) => {
          const rankA = RARITY_RANK[c.rarity] ?? 0;
          const rankB = RARITY_RANK[best] ?? 0;
          return rankA > rankB ? c.rarity : best;
        }, "common");

        window.setTimeout(() => {
          playGachaRevealSound(highestRarity);
        }, 700);

        timer.current = window.setTimeout(() => {
          setState("cards");
          setLoading(false);
        }, 1300);
      } catch (err: any) {
        toast.error({
          title: "Lỗi mở hộp quà",
          message: err.response?.data?.error || "Không thể thực hiện",
        });
        setLoading(false);
      }
    },
    [costs, loading, state, tokenBalance, toast]
  );

  const revealCard = useCallback(
    (index: number) => {
      if (state !== "cards") return;
      const card = cards[index];
      if (card) {
        playGachaRevealSound(card.rarity);
      }
      setRevealed((items) => (items.includes(index) ? items : [...items, index]));
    },
    [cards, state]
  );

  const revealAll = useCallback(() => {
    if (state !== "cards") return;
    setRevealed(cards.map((_, index) => index));
    playGachaRevealSound("legendary");
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([18, 30, 24]);
  }, [cards, state]);

  const collect = useCallback(() => {
    if (state === "cards" && cards.length > 0 && revealed.length === cards.length) {
      setState("summary");
      loadInfo();
    }
  }, [cards.length, loadInfo, revealed.length, state]);

  const reset = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setCards([]);
    setRevealed([]);
    setState("idle");
    loadInfo();
  }, [loadInfo]);

  const bestRarity: Rarity = cards.reduce<Rarity>((best, card) => {
    const rankA = RARITY_RANK[card.rarity] ?? 0;
    const rankB = RARITY_RANK[best] ?? 0;
    return rankA > rankB ? card.rarity : best;
  }, "common");

  return {
    state,
    cards,
    pity,
    hardPity,
    tokenBalance,
    costs,
    info,
    revealed,
    packSize,
    bestRarity,
    loading,
    openPack,
    revealCard,
    revealAll,
    collect,
    reset,
    loadInfo,
  };
}
