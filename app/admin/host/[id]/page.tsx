"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import QRCode from "react-qr-code";
import { getAdminToken, clearAdmin } from "@/lib/auth";
import { startGame, nextQuestion, getQuizDetail, ApiError } from "@/lib/api";
import { createAndStartHub } from "@/lib/signalr";
import type { ShowLeaderboardPayload, EndGamePayload, PlayerJoinedPayload, NextQuestionPayload } from "@/lib/signalr";

type Phase = "idle" | "lobby" | "question" | "leaderboard" | "final";

const SYMBOLS = ["▲", "◆", "●", "★"] as const;
const SYMBOL_COLORS = ["#22d3ee", "#fbbf24", "#e879f9", "#a3e635"];

/** Oyuncunun tarayacağı URL — PIN query param ile landing page */
function buildJoinUrl(pin: string): string {
  if (typeof window === "undefined") return `/?pin=${pin}`;
  return `${window.location.origin}/?pin=${pin}`;
}

export default function HostPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [gamePin, setGamePin] = useState<string | null>(null);
  const [quizTitle, setQuizTitle] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [playerCount, setPlayerCount] = useState(0);
  const [currentQ, setCurrentQ] = useState<NextQuestionPayload | null>(null);
  const [leaderboard, setLeaderboard] = useState<ShowLeaderboardPayload | null>(null);
  const [finalData, setFinalData] = useState<EndGamePayload | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const stopHubRef = useRef<(() => Promise<void>) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionStartRef = useRef<number>(0);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) { router.push("/admin"); return; }
    const loadQuiz = async () => {
      try {
        const detail = await getQuizDetail(params.id, token);
        setQuizTitle(detail.title);
      } catch {
        setQuizTitle("Quiz");
      }
    };
    loadQuiz();
    return () => { stopHubRef.current?.(); if (timerRef.current) clearInterval(timerRef.current); };
  }, [params.id, router]);

  // ESC ile QR kapat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowQR(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const connectHub = useCallback(async (pin: string) => {
    const token = getAdminToken()!;
    const stop = await createAndStartHub(token, pin, {
      onPlayerJoined: (p: PlayerJoinedPayload) => setPlayerCount(p.playerCount),
      onNextQuestion: (q: NextQuestionPayload) => {
        setCurrentQ(q);
        setPhase("question");
        setTimeLeft(q.timeLimit);
        questionStartRef.current = Date.now();
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          const elapsed = (Date.now() - questionStartRef.current) / 1000;
          const left = Math.max(0, Math.ceil(q.timeLimit - elapsed));
          setTimeLeft(left);
          if (left === 0 && timerRef.current) clearInterval(timerRef.current);
        }, 300);
      },
      onShowLeaderboard: (lb: ShowLeaderboardPayload) => {
        setLeaderboard(lb); setPhase("leaderboard");
      },
      onEndGame: (eg: EndGamePayload) => {
        setFinalData(eg); setPhase("final");
      },
    });
    stopHubRef.current = stop;
  }, []);

  async function handleStartGame() {
    setError(""); setLoading(true);
    try {
      const token = getAdminToken()!;
      const res = await startGame(params.id, token);
      setGamePin(res.gamePin);
      setPhase("lobby");
      setShowQR(true); // Oyun başlar başlamaz QR aç
      await connectHub(res.gamePin);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bağlantıda sorun var, lütfen tekrar dene.");
    } finally { setLoading(false); }
  }

  async function handleNextQuestion() {
    if (!gamePin) return;
    setError(""); setLoading(true);
    try {
      await nextQuestion(gamePin, getAdminToken()!);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bağlantıda sorun var, lütfen tekrar dene.");
    } finally { setLoading(false); }
  }

  const BG = (
    <div className="pointer-events-none absolute inset-0" aria-hidden style={{
      backgroundImage: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.18), transparent),linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px),linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
      backgroundSize: "100% 100%, 44px 44px, 44px 44px",
    }} />
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030712] text-slate-100">
      {BG}

      {/* ── QR Modal ─────────────────────────────────────────────────────────── */}
      {showQR && gamePin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(3,7,18,0.92)", backdropFilter: "blur(8px)" }}
          onClick={() => setShowQR(false)}
        >
          <div
            className="relative flex flex-col items-center gap-6 px-10 py-10 max-w-sm w-full mx-4"
            style={{ background: "#030712", border: "2px solid rgba(251,191,36,0.3)", boxShadow: "0 0 60px rgba(251,191,36,0.15)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Başlık */}
            <div className="text-center">
              <p className="font-[family-name:var(--font-orbitron)] text-[10px] uppercase tracking-[0.32em] text-amber-300/60 mb-1">QR ile katıl</p>
              <div className="font-[family-name:var(--font-orbitron)] text-5xl font-black text-amber-300" style={{ textShadow: "0 0 32px rgba(251,191,36,0.5)", letterSpacing: "0.18em" }}>
                {gamePin}
              </div>
            </div>

            {/* QR Kod */}
            <div className="bg-white p-4 rounded-sm" style={{ boxShadow: "0 0 0 4px rgba(251,191,36,0.2)" }}>
              <QRCode
                value={buildJoinUrl(gamePin)}
                size={220}
                bgColor="#ffffff"
                fgColor="#030712"
                level="M"
              />
            </div>

            {/* URL */}
            <p className="text-[10px] text-slate-500 font-mono text-center break-all">
              {buildJoinUrl(gamePin)}
            </p>

            {/* Oyuncu sayısı */}
            <div className="flex items-center gap-3">
              <svg width="20" height="20" viewBox="0 0 36 36" fill="none" style={{ animation: "spin 1.4s linear infinite" }}>
                <circle cx="18" cy="18" r="15" stroke="rgba(251,191,36,0.15)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" strokeDasharray="60 34" />
              </svg>
              <span className="font-[family-name:var(--font-orbitron)] text-2xl font-black text-amber-300">{playerCount}</span>
              <span className="text-sm text-slate-400 font-[family-name:var(--font-orbitron)]">kişi katıldı</span>
            </div>

            {/* Kapat */}
            <button onClick={() => setShowQR(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-slate-600 hover:text-slate-300 transition-colors font-mono text-lg">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <div className="fixed top-0 left-0 bottom-0 w-52 bg-[#030712]/98 border-r border-slate-800/60 flex flex-col z-40">
        <div className="p-5 border-b border-slate-800/60">
          <div className="font-[family-name:var(--font-orbitron)] text-base font-bold text-cyan-400">QuizETU</div>
          <p className="text-[10px] text-slate-600 font-mono mt-0.5">Host Paneli</p>
        </div>
        <nav className="flex flex-col gap-1 p-3 flex-1">
          <a href="/admin/dashboard" className="flex items-center gap-2 px-3 py-2 text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.14em] text-slate-500 hover:text-cyan-400 transition-colors border-l-2 border-transparent hover:border-cyan-400">
            📋 Quizlerim
          </a>
        </nav>
        <div className="p-4 border-t border-slate-800/40">
          <button onClick={() => { clearAdmin(); router.push("/admin"); }}
            className="w-full text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-widest text-slate-600 hover:text-slate-400 transition-colors py-2">
            Çıkış
          </button>
        </div>
      </div>

      {/* ── Ana İçerik ───────────────────────────────────────────────────────── */}
      <main className="ml-52 p-8 flex flex-col gap-6 max-w-5xl">
        <h1 className="font-[family-name:var(--font-orbitron)] text-xl font-bold text-white">
          {quizTitle || "Quiz"} <span className="text-slate-600 text-sm font-normal">— Host</span>
        </h1>

        {/* Üst kart satırı */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Game PIN — tıklanabilir, QR açar */}
          <button
            onClick={() => gamePin && setShowQR(true)}
            disabled={!gamePin}
            className="bg-slate-900/70 px-6 py-5 text-center group transition disabled:cursor-default"
            style={{ borderLeft: "2px solid rgba(251,191,36,0.3)" }}
            title={gamePin ? "QR kodunu göster" : ""}
          >
            <p className="text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-amber-300/60 mb-1">Oyun PIN</p>
            <div className="font-[family-name:var(--font-orbitron)] text-4xl font-black text-amber-300 group-hover:text-amber-200 transition"
              style={{ textShadow: "0 0 24px rgba(251,191,36,0.4)", letterSpacing: "0.14em" }}>
              {gamePin ?? "—"}
            </div>
            {gamePin ? (
              <p className="text-[10px] text-slate-600 mt-1 font-mono group-hover:text-cyan-400/50 transition">▦ QR için tıkla</p>
            ) : (
              <p className="text-[10px] text-slate-600 mt-1 font-mono">quizetu.app/play</p>
            )}
          </button>

          {/* Durum */}
          <div className="bg-slate-900/70 px-6 py-5 text-center" style={{ borderLeft: "2px solid rgba(34,211,238,0.2)" }}>
            <p className="text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-cyan-400/60 mb-1">Durum</p>
            <div className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-slate-200 mt-1">
              {{ idle: "Hazır", lobby: "Bekleme", question: "Soru Aktif", leaderboard: "Sıralama", final: "Bitti" }[phase]}
            </div>
            {currentQ && <p className="text-[10px] text-slate-500 mt-1">{currentQ.questionIndex + 1}. soru</p>}
          </div>

          {/* Oyuncu sayısı */}
          <div className="bg-slate-900/70 px-6 py-5 text-center" style={{ borderLeft: "2px solid rgba(163,230,53,0.2)" }}>
            <p className="text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-lime-400/60 mb-1">Oyuncular</p>
            <div className="font-[family-name:var(--font-orbitron)] text-4xl font-black text-lime-400">{playerCount}</div>
          </div>
        </div>

        {error && <p className="text-xs text-red-400 font-mono bg-red-500/10 border border-red-500/30 px-4 py-2">⚠ {error}</p>}

        {/* Aktif soru */}
        {currentQ && phase === "question" && (
          <div className="bg-slate-900/60 px-6 py-5" style={{ borderLeft: "2px solid rgba(34,211,238,0.2)" }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.2em] text-cyan-400/60">Aktif Soru</p>
              <div className="font-[family-name:var(--font-orbitron)] text-2xl font-black"
                style={{ color: timeLeft > 10 ? "#22d3ee" : timeLeft > 5 ? "#fbbf24" : "#ef4444" }}>
                {timeLeft}s
              </div>
            </div>
            <p className="text-base text-slate-100 font-semibold mb-5">{currentQ.text}</p>
            <div className="grid grid-cols-2 gap-3">
              {currentQ.options.map((opt, i) => (
                <div key={opt.id} className="flex items-center gap-3 p-3 border"
                  style={{ borderColor: `${SYMBOL_COLORS[i]}33`, background: `${SYMBOL_COLORS[i]}0d` }}>
                  <span className="text-xl" style={{ color: SYMBOL_COLORS[i] }}>{SYMBOLS[i]}</span>
                  <span className="text-sm text-slate-300">{opt.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {(phase === "leaderboard" || phase === "final") && leaderboard && (
          <div className="bg-slate-900/60 px-6 py-5" style={{ borderLeft: "2px solid rgba(251,191,36,0.2)" }}>
            <p className="text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-amber-300/60 mb-4">
              {phase === "final" ? "Final Sıralaması" : `Tur ${leaderboard.roundIndex + 1} Sıralaması`}
            </p>
            <div className="flex flex-col gap-2">
              {(phase === "final" ? finalData?.finalTop10 : leaderboard.top10)?.map((p, i) => (
                <div key={p.sessionId} className="flex items-center gap-3 px-4 py-2"
                  style={{ background: i < 3 ? "rgba(251,191,36,0.06)" : "rgba(15,23,42,0.5)", borderLeft: `2px solid ${i < 3 ? "#fbbf24" : "#22d3ee"}44` }}>
                  <span className="font-[family-name:var(--font-orbitron)] text-sm w-5 text-slate-400">#{i + 1}</span>
                  <span className="flex-1 text-sm font-semibold text-slate-200">{p.nickname}</span>
                  <div className="text-right">
                    <div className="font-[family-name:var(--font-orbitron)] text-sm text-amber-300">{Math.round(p.totalScore)} pt</div>
                    {phase !== "final" && <div className="text-[10px] text-slate-500">+{Math.round(p.roundTotalPoints)}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aksiyon butonları */}
        <div className="flex gap-3 flex-wrap">
          {phase === "idle" && (
            <button id="host-start-btn" onClick={handleStartGame} disabled={loading}
              className="inline-flex min-h-12 items-center gap-2 bg-cyan-400 px-8 py-3 font-[family-name:var(--font-orbitron)] text-sm font-semibold uppercase tracking-[0.2em] text-slate-950 hover:bg-cyan-300 disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed transition">
              {loading ? "Başlatılıyor..." : "▶ Oyun Başlat"}
            </button>
          )}
          {phase === "lobby" && gamePin && (
            <button onClick={() => setShowQR(true)}
              className="inline-flex min-h-12 items-center gap-2 bg-amber-300/20 border border-amber-300/40 px-6 py-3 font-[family-name:var(--font-orbitron)] text-sm font-semibold uppercase tracking-[0.2em] text-amber-300 hover:bg-amber-300/30 transition">
              ▦ QR Göster
            </button>
          )}
          {(phase === "lobby" || phase === "leaderboard") && (
            <button id="host-next-btn" onClick={handleNextQuestion} disabled={loading}
              className="inline-flex min-h-12 items-center gap-2 bg-amber-300 px-8 py-3 font-[family-name:var(--font-orbitron)] text-sm font-semibold uppercase tracking-[0.2em] text-slate-950 hover:bg-amber-200 disabled:bg-slate-600 disabled:cursor-not-allowed transition">
              {loading ? "Yükleniyor..." : phase === "lobby" ? "▶ İlk Soruyu Başlat" : "→ Sonraki Soru"}
            </button>
          )}
          {phase === "final" && (
            <button onClick={() => router.push("/admin/dashboard")}
              className="inline-flex min-h-12 items-center gap-2 bg-slate-700 px-8 py-3 font-[family-name:var(--font-orbitron)] text-sm font-semibold uppercase tracking-[0.2em] text-slate-200 hover:bg-slate-600 transition">
              Dashboard&apos;a Dön
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
