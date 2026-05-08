"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPlayerMeta, clearPlayer } from "@/lib/auth";
import type { EndGamePayload, LeaderboardEntry } from "@/lib/api";

const PODIUM_ORDER = [1, 0, 2]; // 2. 1. 3. sıra
const PODIUM_HEIGHTS = ["96px", "128px", "72px"];
const PODIUM_COLORS = ["#94a3b8", "#fbbf24", "#b45309"];
const PODIUM_SYMBOLS = ["🥈", "🏆", "🥉"];

export default function FinalPage() {
  const router = useRouter();
  const [top10, setTop10] = useState<LeaderboardEntry[]>([]);
  const [myNickname, setMyNickname] = useState("");
  const [mySessionId, setMySessionId] = useState("");

  useEffect(() => {
    const meta = getPlayerMeta();
    if (meta) {
      setMyNickname(meta.name);
      setMySessionId(meta.id);
    }

    // Game veya result sayfasından gelen EndGame payload
    const raw = sessionStorage.getItem("quizetu:final");
    if (raw) {
      const eg: EndGamePayload = JSON.parse(raw);
      setTop10(eg.finalTop10);
    }

    // Temizlik
    return () => {
      sessionStorage.removeItem("quizetu:final");
      sessionStorage.removeItem("quizetu:leaderboard");
      sessionStorage.removeItem("quizetu:last_correct_option_id");
      sessionStorage.removeItem("quizetu:last_correct_option_text");
      sessionStorage.removeItem("quizetu:current_options");
    };
  }, []);

  const myRank = top10.findIndex((e) => e.sessionId === mySessionId) + 1;
  const top3 = PODIUM_ORDER.map((i) => top10[i] ?? null);

  const BG = (
    <div className="pointer-events-none absolute inset-0" aria-hidden style={{
      backgroundImage:
        "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(251,191,36,0.18), transparent)," +
        "linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px)," +
        "linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
      backgroundSize: "100% 100%, 44px 44px, 44px 44px",
    }} />
  );

  return (
    <div className="relative min-h-screen bg-[#030712] overflow-hidden text-slate-100 flex flex-col items-center justify-center px-5 py-10">
      {BG}
      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-lg">

        <div className="text-center">
          <p className="font-[family-name:var(--font-orbitron)] text-[10px] uppercase tracking-[0.32em] text-amber-300/60 mb-2">Oyun Bitti</p>
          <h1 className="font-[family-name:var(--font-orbitron)] text-3xl sm:text-4xl font-black text-white">
            Final <span className="text-amber-300">Sıralaması</span>
          </h1>
          {myRank > 0 && (
            <p className="mt-2 text-sm text-slate-400">
              Senin sıran: <span className="text-cyan-400 font-semibold">#{myRank}</span>
              {top10[myRank - 1] && <span className="text-slate-500"> / {Math.round(top10[myRank - 1].totalScore)} pt</span>}
            </p>
          )}
        </div>

        {/* Podyum */}
        {top3.some(Boolean) && (
          <div className="flex items-end justify-center gap-3 w-full">
            {top3.map((entry, podiumSlot) => {
              const rankIdx = PODIUM_ORDER[podiumSlot]; // 0-indexed gerçek sıra
              if (!entry) return <div key={podiumSlot} className="w-24" />;
              const isMe = entry.sessionId === mySessionId;
              return (
                <div key={entry.sessionId} className="flex flex-col items-center gap-1">
                  <span className="text-2xl">{PODIUM_SYMBOLS[podiumSlot]}</span>
                  <p className="text-xs font-semibold text-slate-300 truncate max-w-[72px] text-center" style={{ color: isMe ? "#fde68a" : undefined }}>
                    {entry.nickname}
                  </p>
                  <p className="font-[family-name:var(--font-orbitron)] text-[10px] text-amber-300">{Math.round(entry.totalScore)}</p>
                  <div className="w-20 rounded-t" style={{
                    height: PODIUM_HEIGHTS[podiumSlot],
                    background: `linear-gradient(180deg, ${PODIUM_COLORS[podiumSlot]}44, ${PODIUM_COLORS[podiumSlot]}11)`,
                    border: `1px solid ${PODIUM_COLORS[podiumSlot]}66`,
                    boxShadow: rankIdx === 0 ? `0 0 24px ${PODIUM_COLORS[podiumSlot]}33` : "none",
                    animation: `podiumRise 0.6s ${podiumSlot * 0.15}s both`,
                  }} />
                </div>
              );
            })}
          </div>
        )}

        {/* Full top 10 */}
        {top10.length > 0 && (
          <div className="w-full bg-slate-900/60 px-5 py-4" style={{ borderLeft: "2px solid rgba(251,191,36,0.2)" }}>
            <p className="font-[family-name:var(--font-orbitron)] text-[10px] uppercase tracking-[0.28em] text-amber-300/60 mb-3">Top {top10.length}</p>
            <div className="flex flex-col gap-1.5">
              {top10.map((entry, i) => {
                const isMe = entry.sessionId === mySessionId;
                return (
                  <div key={entry.sessionId} className="flex items-center gap-3 px-3 py-2 rounded-sm"
                    style={{ background: isMe ? "rgba(251,191,36,0.08)" : i < 3 ? "rgba(15,23,42,0.6)" : "transparent", borderLeft: `2px solid ${i < 3 ? "#fbbf24" : "#22d3ee"}44` }}>
                    <span className="font-[family-name:var(--font-orbitron)] text-xs w-5 text-slate-500">#{i + 1}</span>
                    <span className="flex-1 text-sm font-semibold" style={{ color: isMe ? "#fde68a" : "#e2e8f0" }}>
                      {entry.nickname}
                      {isMe && <span className="ml-2 text-[9px] text-amber-300/70 font-[family-name:var(--font-orbitron)] tracking-widest">(sen)</span>}
                    </span>
                    <span className="font-[family-name:var(--font-orbitron)] text-sm text-amber-300">{Math.round(entry.totalScore)} pt</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {top10.length === 0 && (
          <p className="text-xs text-slate-600 font-mono animate-pulse">Sıralama yükleniyor...</p>
        )}

        <button id="play-again-btn" onClick={() => { clearPlayer(); router.push("/"); }}
          className="inline-flex min-h-12 items-center justify-center bg-cyan-400 px-8 py-3 font-[family-name:var(--font-orbitron)] text-sm font-semibold uppercase tracking-[0.2em] text-slate-950 hover:bg-cyan-300 transition active:scale-[0.98]">
          Ana Sayfaya Dön
        </button>
      </div>

      <style>{`
        @keyframes podiumRise { from { opacity: 0; transform: scaleY(0); transform-origin: bottom; } to { opacity: 1; transform: scaleY(1); } }
      `}</style>
    </div>
  );
}
