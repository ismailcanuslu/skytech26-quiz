"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getPlayerToken, getPlayerMeta, getCurrentOptions, clearPlayer } from "@/lib/auth";
import { createAndStartHub } from "@/lib/signalr";
import type { ShowCorrectAnswerPayload, ShowLeaderboardPayload, NextQuestionPayload, EndGamePayload } from "@/lib/signalr";

const SYMBOLS = ["▲", "◆", "●", "★"] as const;
const COLORS  = ["#22d3ee", "#fbbf24", "#e879f9", "#a3e635"];

export default function ResultPage() {
  const router = useRouter();
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null);
  const [correctText, setCorrectText] = useState("");
  const [reconnectingTooLong, setReconnectingTooLong] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [finalData, setFinalData] = useState<EndGamePayload | null>(null);
  const [mySessionId, setMySessionId] = useState<string | null>(null);
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
    const cachedFinal = sessionStorage.getItem("quizetu:final");
    if (cachedFinal) {
      try {
        setFinalData(JSON.parse(cachedFinal) as EndGamePayload);
      } catch {
        // ignore
      }
    }
    setSelectedOptionId(sessionStorage.getItem("quizetu:selected_option_id"));

    (async () => {
      try {
        const stop = await createAndStartHub(token, meta.code, {
          onConnectionIssue: (isStuck) => setReconnectingTooLong(isStuck),
          onShowCorrectAnswer: (p: ShowCorrectAnswerPayload) => {
            setCorrectOptionId(p.correctOptionId);
            setCorrectText(p.correctOptionText);
          },
          onShowLeaderboard: (lb: ShowLeaderboardPayload) => {
            // Ara leaderboard oyuncu ekranina basilmiyor.
            void lb;
          },
          onNextQuestion: (q: NextQuestionPayload) => {
            sessionStorage.removeItem("quizetu:last_correct_option_id");
            sessionStorage.removeItem("quizetu:last_correct_option_text");
            sessionStorage.removeItem("quizetu:leaderboard");
            sessionStorage.removeItem("quizetu:final");
            sessionStorage.removeItem("quizetu:prev_totals");
            sessionStorage.setItem("quizetu:incoming_question", JSON.stringify(q));
            // Yeni soru seçeneklerini sakla
            const { saveCurrentOptions } = require("@/lib/auth");
            saveCurrentOptions(q.options);
            router.push("/play/game");
          },
          onEndGame: (eg: EndGamePayload) => {
            sessionStorage.setItem("quizetu:final", JSON.stringify(eg));
            setFinalData(eg);
          },
          onPlayerRemoved: (payload) => {
            if (payload.nickname === meta.name) {
              clearPlayer();
              router.push("/");
            }
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
  const myFinalRank = mySessionId ? finalData?.finalTop10.findIndex((x) => x.sessionId === mySessionId) ?? -1 : -1;

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
        {reconnectingTooLong && (
          <div className="w-full text-xs text-amber-300 font-mono bg-amber-500/10 border border-amber-500/40 px-4 py-3">
            ⚠ Yeniden bağlanıyor... Sorun hala devam ediyor mu, QR okutarak veya PIN&apos;i tekrar girerek bağlanmayı deneyin.
          </div>
        )}

        {finalData && (
          <>
            <div className="w-full bg-slate-900/70 px-6 py-5 text-center border border-amber-400/30">
              <p className="font-[family-name:var(--font-orbitron)] text-[10px] uppercase tracking-[0.28em] text-amber-300/80 mb-2">
                Oyun Bitti
              </p>
              <p className="text-sm text-slate-300">
                {myFinalRank >= 0
                  ? `Oyunu ${myFinalRank + 1}. sırada tamamladın.`
                  : "Oyunu tamamladın."}
              </p>
            </div>
          </>
        )}

        {/* Doğru cevap göstergesi */}
        {correctOptionId && !finalData && (
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

        {correctOptionId && selectedOptionId && !finalData && (
          <div
            className="w-full px-6 py-4 text-center border"
            style={{
              background: isCorrect ? "rgba(163,230,53,0.12)" : "rgba(239,68,68,0.10)",
              borderColor: isCorrect ? "rgba(163,230,53,0.45)" : "rgba(239,68,68,0.45)",
            }}
          >
            <p
              className="font-[family-name:var(--font-orbitron)] text-sm uppercase tracking-[0.2em]"
              style={{ color: isCorrect ? "#a3e635" : "#f87171" }}
            >
              {isCorrect ? "Doğru bildin!" : `Üzgünüz, cevap şu olacaktı: ${correctText}`}
            </p>
          </div>
        )}

        {!correctOptionId && !finalData && (
          <p className="text-xs font-[family-name:var(--font-orbitron)] text-slate-600 uppercase tracking-[0.24em] animate-pulse">Sonuç bekleniyor...</p>
        )}
        {!finalData && (
          <p className="text-xs font-[family-name:var(--font-orbitron)] text-slate-600 uppercase tracking-[0.22em] animate-pulse">
            Bir sonraki soru için bekleniyor...
          </p>
        )}
      </div>
    </div>
  );
}
