"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getPlayerToken, getPlayerMeta, getCurrentOptions } from "@/lib/auth";
import { createAndStartHub } from "@/lib/signalr";
import type { ShowCorrectAnswerPayload, ShowLeaderboardPayload, NextQuestionPayload, EndGamePayload } from "@/lib/signalr";
import type { LeaderboardEntry } from "@/lib/api";

const SYMBOLS = ["▲", "◆", "●", "★"] as const;
const COLORS  = ["#22d3ee", "#fbbf24", "#e879f9", "#a3e635"];

export default function ResultPage() {
  const router = useRouter();
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null);
  const [correctText, setCorrectText] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [mySessionId, setMySessionId] = useState<string>("");
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const stopHubRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const meta = getPlayerMeta();
    const token = getPlayerToken();
    if (!meta || !token) { router.push("/"); return; }
    setMySessionId(meta.id);

    // sessionStorage'dan geçici veri yükle (game page'den)
    const cachedCorrect = sessionStorage.getItem("quizetu:last_correct_option_id");
    const cachedText = sessionStorage.getItem("quizetu:last_correct_option_text");
    if (cachedCorrect) setCorrectOptionId(cachedCorrect);
    if (cachedText) setCorrectText(cachedText);
    const cachedLb = sessionStorage.getItem("quizetu:leaderboard");
    if (cachedLb) {
      const lb: ShowLeaderboardPayload = JSON.parse(cachedLb);
      setLeaderboard(lb.top10);
      setRoundIndex(lb.roundIndex);
      const entry = lb.top10.find((e) => e.sessionId === meta.id) ?? null;
      setMyEntry(entry);
      setMyRank(lb.top10.findIndex((e) => e.sessionId === meta.id) + 1 || null);
    }
    setSelectedOptionId(sessionStorage.getItem("quizetu:selected_option_id"));

    (async () => {
      try {
        const stop = await createAndStartHub(token, meta.code, {
          onShowCorrectAnswer: (p: ShowCorrectAnswerPayload) => {
            setCorrectOptionId(p.correctOptionId);
            setCorrectText(p.correctOptionText);
          },
          onShowLeaderboard: (lb: ShowLeaderboardPayload) => {
            setLeaderboard(lb.top10);
            setRoundIndex(lb.roundIndex);
            const entry = lb.top10.find((e) => e.sessionId === meta.id) ?? null;
            setMyEntry(entry);
            setMyRank(lb.top10.findIndex((e) => e.sessionId === meta.id) + 1 || null);
          },
          onNextQuestion: (q: NextQuestionPayload) => {
            sessionStorage.removeItem("quizetu:last_correct_option_id");
            sessionStorage.removeItem("quizetu:last_correct_option_text");
            sessionStorage.removeItem("quizetu:leaderboard");
            // Yeni soru seçeneklerini sakla
            const { saveCurrentOptions } = require("@/lib/auth");
            saveCurrentOptions(q.options);
            router.push("/play/game");
          },
          onEndGame: (eg: EndGamePayload) => {
            sessionStorage.setItem("quizetu:final", JSON.stringify(eg));
            router.push("/play/final");
          },
        });
        stopHubRef.current = stop;
      } catch (err) { console.error(err); }
    })();

    return () => { stopHubRef.current?.(); };
  }, [router]);

  // Seçilen seçeneğin index'ini bul (sembole karşılık gelen)
  const options = getCurrentOptions();
  const correctIndex = correctOptionId ? options.findIndex((o) => o.id === correctOptionId) : -1;
  const isCorrect = correctOptionId !== null && selectedOptionId === correctOptionId;

  const BG = (
    <div className="pointer-events-none absolute inset-0" aria-hidden style={{
      backgroundImage: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.18), transparent),linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px),linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
      backgroundSize: "100% 100%, 44px 44px, 44px 44px",
    }} />
  );

  return (
    <div className="relative min-h-screen bg-[#030712] overflow-hidden text-slate-100 flex flex-col items-center justify-center px-5 py-10">
      {BG}
      <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-sm">

        {/* Doğru cevap göstergesi */}
        {correctOptionId && (
          <div className="w-full bg-slate-900/70 px-6 py-5 text-center" style={{ borderLeft: "2px solid rgba(163,230,53,0.4)" }}>
            <p className="font-[family-name:var(--font-orbitron)] text-[10px] uppercase tracking-[0.28em] text-lime-400/70 mb-3">Doğru Cevap</p>
            {correctIndex >= 0 ? (
              <div className="flex flex-col items-center gap-2">
                <span className="text-5xl" style={{ color: COLORS[correctIndex], filter: `drop-shadow(0 0 16px ${COLORS[correctIndex]})` }}>
                  {SYMBOLS[correctIndex]}
                </span>
                <p className="text-sm text-slate-300">{correctText}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-300">{correctText}</p>
            )}
          </div>
        )}

        {/* Kişisel skor */}
        {myEntry && (
          <div className="w-full bg-amber-300/8 px-6 py-5 text-center" style={{ boxShadow: "0 0 32px rgba(251,191,36,0.1) inset" }}>
            <p className="font-[family-name:var(--font-orbitron)] text-[10px] uppercase tracking-[0.28em] text-amber-300/60 mb-2">
              Tur {roundIndex + 1} Puanın
            </p>
            <div className="font-[family-name:var(--font-orbitron)] text-4xl font-black text-amber-300" style={{ textShadow: "0 0 24px rgba(251,191,36,0.4)" }}>
              +{Math.round(myEntry.roundTotalPoints)}
            </div>
            <div className="flex justify-center gap-4 mt-2">
              <span className="text-[10px] text-slate-500 font-mono">Hız: +{Math.round(myEntry.roundBasePoints)}</span>
              <span className="text-[10px] text-slate-500 font-mono">Nadir: +{Math.round(myEntry.roundBonusPoints)}</span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between">
              <span className="text-[10px] font-[family-name:var(--font-orbitron)] text-slate-500 uppercase tracking-widest">Toplam</span>
              <span className="font-[family-name:var(--font-orbitron)] text-sm font-bold text-cyan-400">{Math.round(myEntry.totalScore)} pt</span>
            </div>
          </div>
        )}

        {/* Sıralama (top 10) */}
        {leaderboard && leaderboard.length > 0 && (
          <div className="w-full bg-slate-900/60 px-5 py-4" style={{ borderLeft: "2px solid rgba(34,211,238,0.2)" }}>
            <p className="font-[family-name:var(--font-orbitron)] text-[10px] uppercase tracking-[0.28em] text-cyan-400/60 mb-3">
              Sıralama — Top {leaderboard.length}
            </p>
            <div className="flex flex-col gap-1.5">
              {leaderboard.map((p, i) => (
                <div key={p.sessionId} className="flex items-center gap-3 px-3 py-1.5"
                  style={{ background: p.sessionId === mySessionId ? "rgba(251,191,36,0.08)" : "transparent", borderLeft: `2px solid ${i < 3 ? "#fbbf24" : "#22d3ee"}33` }}>
                  <span className="font-[family-name:var(--font-orbitron)] text-xs w-5 text-slate-500">#{i + 1}</span>
                  <span className="flex-1 text-sm" style={{ color: p.sessionId === mySessionId ? "#fde68a" : "#cbd5e1" }}>{p.nickname}</span>
                  <span className="font-[family-name:var(--font-orbitron)] text-xs text-amber-300">{Math.round(p.totalScore)}</span>
                </div>
              ))}
            </div>
            {myRank && myRank > leaderboard.length && (
              <p className="text-[10px] text-slate-600 mt-2 font-mono">Senin sıran: #{myRank}</p>
            )}
          </div>
        )}

        {!correctOptionId && !leaderboard && (
          <p className="text-xs font-[family-name:var(--font-orbitron)] text-slate-600 uppercase tracking-[0.24em] animate-pulse">Sonuç bekleniyor...</p>
        )}

        <p className="text-xs font-[family-name:var(--font-orbitron)] text-slate-600 uppercase tracking-[0.22em] animate-pulse">
          Bir sonraki soru için bekleniyor...
        </p>
      </div>
    </div>
  );
}
