"use client";

/**
 * FollowButton — Trader takip/bırak düğmesi.
 *
 * - Bağlı cüzdan yoksa devre dışı + bağlantı mesajı gösterir.
 * - Tıklamada optimistik toggle: UI anında güncellenir, ardından API çağrısı yapılır.
 * - Hata durumunda optimistik güncelleme geri alınır.
 *
 * 'use client' — wagmi useAccount hook'u istemci tarafında çalışır.
 */

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";

type Props = {
  /** Profil sahibinin adresi. */
  trader: string;
  /** Server'dan gelen başlangıç takipçi sayısı (hydration için). */
  initialFollowerCount?: number;
};

export function FollowButton({ trader, initialFollowerCount = 0 }: Props) {
  const { address, isConnected } = useAccount();

  // Durum
  const [following, setFollowing] = useState(false);
  const [count, setCount] = useState(initialFollowerCount);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  // Bağlı kullanıcının bu trader'ı takip edip etmediğini getir
  const fetchStatus = useCallback(async () => {
    if (!isConnected || !address) return;
    try {
      const res = await fetch(
        `/api/follow?trader=${trader}&user=${address}`
      );
      if (!res.ok) return;
      const data: {
        followerCount: number;
        isFollowing: boolean;
      } = await res.json();
      setFollowing(data.isFollowing);
      setCount(data.followerCount);
    } catch {
      // Sessizce devam et — başlangıç değerleri korunur
    } finally {
      setFetched(true);
    }
  }, [address, isConnected, trader]);

  // Cüzdan bağlandığında veya trader değiştiğinde gerçek durumu çek
  useEffect(() => {
    setFetched(false);
    if (isConnected && address) {
      fetchStatus();
    }
  }, [address, isConnected, fetchStatus]);

  // Takip et / bırak
  async function handleToggle() {
    if (!isConnected || !address || loading) return;

    const nextFollowing = !following;
    const nextCount = nextFollowing ? count + 1 : Math.max(0, count - 1);

    // Optimistik güncelleme
    setFollowing(nextFollowing);
    setCount(nextCount);
    setLoading(true);

    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trader,
          user: address,
          action: nextFollowing ? "follow" : "unfollow",
        }),
      });

      if (!res.ok) {
        // Geri al
        setFollowing(following);
        setCount(count);
        return;
      }

      const data: {
        followerCount: number;
        isFollowing: boolean;
      } = await res.json();

      // Sunucudan gelen gerçek değerleri uygula
      setFollowing(data.isFollowing);
      setCount(data.followerCount);
    } catch {
      // Hata durumunda geri al
      setFollowing(following);
      setCount(count);
    } finally {
      setLoading(false);
    }
  }

  // Cüzdan bağlı değilse
  if (!isConnected) {
    return (
      <button className="btn btn-secondary" disabled style={{ width: "100%" }}>
        Takip için cüzdan bağla
      </button>
    );
  }

  // Kendi profiline bakıyorsa (takip butonu anlamlı değil)
  if (address?.toLowerCase() === trader.toLowerCase()) {
    return (
      <button className="btn btn-secondary" disabled style={{ width: "100%" }}>
        Bu senin profilin
      </button>
    );
  }

  // Durum henüz yüklenmediyse hafif bir skeleton göster
  if (!fetched) {
    return (
      <button className="btn btn-secondary" disabled style={{ width: "100%" }}>
        Yükleniyor…
      </button>
    );
  }

  return (
    <button
      className={following ? "btn btn-secondary" : "btn"}
      onClick={handleToggle}
      disabled={loading}
      style={{ width: "100%" }}
    >
      {loading
        ? "İşleniyor…"
        : following
        ? `Takip ediliyor · ${count} takipçi`
        : `Takip et · ${count} takipçi`}
    </button>
  );
}
