"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import QRCode from "react-qr-code";
import { getAdminToken, clearAdmin } from "@/lib/auth";
import { startGame, nextQuestion, getQuizDetail, banPlayer, ApiError } from "@/lib/api";
import { createAndStartHub } from "@/lib/signalr";
import type {
  ShowLeaderboardPayload,
  EndGamePayload,
  PlayerJoinedPayload,
  NextQuestionPayload,
  LobbySnapshotPayload,
} from "@/lib/signalr";

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
  const [players, setPlayers] = useState<string[]>([]);
  const [currentQ, setCurrentQ] = useState<NextQuestionPayload | null>(null);
  const [leaderboard, setLeaderboard] = useState<ShowLeaderboardPayload | null>(null);
  const [finalData, setFinalData] = useState<EndGamePayload | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [reconnectingTooLong, setReconnectingTooLong] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingBanNickname, setPendingBanNickname] = useState<string | null>(null);
  const [incomingCountdown, setIncomingCountdown] = useState<number | null>(null);
  const stopHubRef = useRef<(() => Promise<void>) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const incomingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionStartRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const prevTop3Ref = useRef<string[]>([]);

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
    return () => {
      stopHubRef.current?.();
      if (timerRef.current) clearInterval(timerRef.current);
      if (incomingTimerRef.current) clearInterval(incomingTimerRef.current);
    };
  }, [params.id, router]);

  // ESC ile QR kapat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowQR(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setError("Tam ekran modu açılamadı.");
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "f") {
        void toggleFullscreen();
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [toggleFullscreen]);

  useEffect(() => {
    const unlockAudio = async () => {
      if (audioUnlockedRef.current) return;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }
      audioUnlockedRef.current = true;
    };
    const onInteract = () => { void unlockAudio(); };
    window.addEventListener("pointerdown", onInteract, { once: true });
    window.addEventListener("keydown", onInteract, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, []);

  const playTone = useCallback((frequency: number, durationMs: number, gain = 0.045) => {
    const ctx = audioCtxRef.current;
    if (!ctx || !audioUnlockedRef.current) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.03);
  }, []);

  const playRankShiftFx = useCallback((type: "minor" | "major") => {
    if (type === "major") {
      playTone(392, 85, 0.05);
      setTimeout(() => playTone(523.25, 120, 0.055), 60);
      setTimeout(() => playTone(659.25, 165, 0.06), 140);
      return;
    }
    playTone(466.16, 65, 0.036);
    setTimeout(() => playTone(587.33, 85, 0.04), 55);
  }, [playTone]);

  const connectHub = useCallback(async (pin: string) => {
    const token = getAdminToken()!;
    const showIncomingQuestion = (q: NextQuestionPayload) => {
      const startedAtMs = q.startedAtUtc ? Date.parse(q.startedAtUtc) : NaN;
      const safeStartMs = Number.isFinite(startedAtMs) ? startedAtMs : Date.now();

      setCurrentQ(null);
      setPhase("question");
      setIncomingCountdown(3);
      if (incomingTimerRef.current) clearInterval(incomingTimerRef.current);
      playTone(520, 80, 0.03);
      incomingTimerRef.current = setInterval(() => {
        setIncomingCountdown((prev) => {
          if (prev === null) return prev;
          if (prev <= 1) {
            playTone(660, 130, 0.05);
            if (incomingTimerRef.current) clearInterval(incomingTimerRef.current);
            setCurrentQ(q);
            questionStartRef.current = safeStartMs;
            const initialLeft = Math.max(0, Math.ceil(q.timeLimit - (Date.now() - questionStartRef.current) / 1000));
            setTimeLeft(initialLeft);
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = setInterval(() => {
              const elapsed = (Date.now() - questionStartRef.current) / 1000;
              const left = Math.max(0, Math.ceil(q.timeLimit - elapsed));
              setTimeLeft(left);
              if (left === 0 && timerRef.current) clearInterval(timerRef.current);
            }, 300);
            return null;
          }
          playTone(520, 80, 0.03);
          return prev - 1;
        });
      }, 1000);
    };

    const stop = await createAndStartHub(token, pin, {
      onConnectionIssue: (isStuck) => setReconnectingTooLong(isStuck),
      onLobbySnapshot: (snapshot: LobbySnapshotPayload) => {
        setPlayers(snapshot.players);
        setPlayerCount(snapshot.playerCount);
      },
      onPlayerJoined: (p: PlayerJoinedPayload) => {
        setPlayerCount(p.playerCount);
        setPlayers((prev) => (prev.includes(p.nickname) ? prev : [...prev, p.nickname]));
      },
      onPlayerRemoved: (p) => {
        setPlayerCount(p.playerCount);
        setPlayers((prev) => prev.filter((name) => name !== p.nickname));
      },
      onNextQuestion: (q: NextQuestionPayload) => {
        showIncomingQuestion(q);
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

  async function handleBanClick(nickname: string) {
    if (!gamePin) return;
    if (pendingBanNickname !== nickname) {
      setPendingBanNickname(nickname);
      return;
    }

    setPendingBanNickname(null);
    try {
      const token = getAdminToken();
      if (!token) return;
      await banPlayer(gamePin, nickname, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Oyuncu banlanamadi.");
    }
  }

  const BG = (
    <div className="pointer-events-none absolute inset-0" aria-hidden style={{
      backgroundImage: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.18), transparent),linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px),linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
      backgroundSize: "100% 100%, 44px 44px, 44px 44px",
    }} />
  );

  const rankRows = useCallback(() => {
    const source = phase === "final" ? finalData?.finalTop10 : leaderboard?.top10;
    const scoreByName = new Map<string, number>();
    const roundByName = new Map<string, number>();

    for (const entry of source ?? []) {
      scoreByName.set(entry.nickname, Number(entry.totalScore) || 0);
      roundByName.set(entry.nickname, Number(entry.roundTotalPoints) || 0);
    }

    for (const name of players) {
      if (!scoreByName.has(name)) {
        scoreByName.set(name, 0);
        roundByName.set(name, 0);
      }
    }

    const rows = Array.from(scoreByName.entries())
      .map(([nickname, totalScore]) => ({
        nickname,
        totalScore,
        roundTotalPoints: roundByName.get(nickname) ?? 0,
      }))
      .sort((a, b) => b.totalScore - a.totalScore || a.nickname.localeCompare(b.nickname, "tr"));

    let prevScore: number | null = null;
    let currentRank = 0;
    return rows.map((row, index) => {
      if (prevScore === null || row.totalScore !== prevScore) {
        currentRank = index + 1;
        prevScore = row.totalScore;
      }
      return { ...row, rank: currentRank };
    });
  }, [finalData?.finalTop10, leaderboard?.top10, phase, players]);

  useEffect(() => {
    const ranked = rankRows();
    const currentTop3 = ranked.slice(0, 3).map((x) => x.nickname);
    const prevTop3 = prevTop3Ref.current;
    if (currentTop3.length === 0) return;
    if (prevTop3.length === 0) {
      prevTop3Ref.current = currentTop3;
      return;
    }

    const firstChanged = prevTop3[0] !== currentTop3[0];
    const minorChanged = !firstChanged && (prevTop3[1] !== currentTop3[1] || prevTop3[2] !== currentTop3[2]);
    if (firstChanged) {
      playRankShiftFx("major");
    } else if (minorChanged) {
      playRankShiftFx("minor");
    }
    prevTop3Ref.current = currentTop3;
  }, [leaderboard, finalData, rankRows, playRankShiftFx]);

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
      <main className="ml-52 p-10 flex flex-col gap-8 max-w-7xl">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-[family-name:var(--font-orbitron)] text-3xl font-bold text-white">
            {quizTitle || "Quiz"} <span className="text-slate-600 text-sm font-normal">— Host</span>
          </h1>
          <button
            onClick={() => void toggleFullscreen()}
            className="inline-flex min-h-12 items-center gap-2 px-5 py-3 border border-cyan-400/40 text-cyan-300 bg-slate-900/70 hover:bg-slate-800/80 transition font-[family-name:var(--font-orbitron)] text-sm uppercase tracking-[0.16em]"
          >
            {isFullscreen ? "⤫ Tam Ekrandan Çık" : "⛶ Tam Ekran (F)"}
          </button>
        </div>

        {/* Üst kart satırı */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Game PIN — tıklanabilir, QR açar */}
          <button
            onClick={() => gamePin && setShowQR(true)}
            disabled={!gamePin}
            className="bg-slate-900/70 px-8 py-8 text-center group transition disabled:cursor-default"
            style={{ borderLeft: "2px solid rgba(251,191,36,0.3)" }}
            title={gamePin ? "QR kodunu göster" : ""}
          >
            <p className="text-sm font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-amber-300/80 mb-2">Oyun PIN</p>
            <div
              className="relative z-10 font-[family-name:var(--font-orbitron)] font-black text-amber-300 group-hover:text-amber-200 transition leading-none whitespace-nowrap overflow-visible"
              style={{
                textShadow: "0 0 24px rgba(251,191,36,0.4)",
                letterSpacing: "0.06em",
                fontSize: "clamp(1.6rem, 4.6vw, 4rem)",
              }}
            >
              {gamePin ?? "—"}
            </div>
            {gamePin ? (
              <p className="text-sm text-slate-500 mt-2 font-mono group-hover:text-cyan-400/50 transition">▦ QR için tıkla</p>
            ) : (
              <p className="text-sm text-slate-600 mt-2 font-mono">quizetu.app/play</p>
            )}
          </button>

          {/* Durum */}
          <div className="bg-slate-900/70 px-8 py-8 text-center" style={{ borderLeft: "2px solid rgba(34,211,238,0.2)" }}>
            <p className="text-sm font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-cyan-400/80 mb-2">Durum</p>
            <div className="font-[family-name:var(--font-orbitron)] text-3xl font-bold text-slate-200 mt-1">
              {{ idle: "Hazır", lobby: "Bekleme", question: "Soru Aktif", leaderboard: "Sıralama", final: "Bitti" }[phase]}
            </div>
            {currentQ && <p className="text-sm text-slate-500 mt-2">{currentQ.questionIndex + 1}. soru</p>}
          </div>

          {/* Oyuncu sayısı */}
          <div className="bg-slate-900/70 px-8 py-8 text-center" style={{ borderLeft: "2px solid rgba(163,230,53,0.2)" }}>
            <p className="text-sm font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-lime-400/80 mb-2">Oyuncular</p>
            <div className="font-[family-name:var(--font-orbitron)] text-7xl font-black text-lime-400">{playerCount}</div>
          </div>
        </div>

        {error && <p className="text-xs text-red-400 font-mono bg-red-500/10 border border-red-500/30 px-4 py-2">⚠ {error}</p>}
        {reconnectingTooLong && (
          <p className="text-xs text-amber-300 font-mono bg-amber-500/10 border border-amber-500/40 px-4 py-2">
            ⚠ Yeniden bağlanıyor... Sorun hala devam ediyor mu, QR okutarak veya PIN&apos;i tekrar girerek bağlanmayı deneyin.
          </p>
        )}

        {phase === "lobby" && (
          <div className="bg-slate-900/60 px-6 py-5" style={{ borderLeft: "2px solid rgba(163,230,53,0.25)" }}>
            <div className="flex items-center justify-between mb-6">
              <p className="text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-lime-400/70">
                Bekleme Salonu
              </p>
              <span className="text-xs text-slate-500 font-mono">{playerCount} oyuncu</span>
            </div>

            {players.length === 0 ? (
              <p className="text-sm text-slate-500 font-mono">Henüz katılan yok...</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {players.map((name, idx) => (
                  <span
                    key={`${name}-${idx}`}
                    className="group inline-flex items-center gap-2 px-5 py-3 bg-slate-900/80 border text-2xl font-semibold relative"
                    style={{
                      borderColor: "rgba(34,211,238,0.22)",
                      color: "#e2e8f0",
                    }}
                  >
                    <span style={{ color: "#22d3ee" }}>●</span>
                    {name}
                    <button
                      type="button"
                      onClick={() => void handleBanClick(name)}
                      className={`ml-2 text-lg transition ${
                        pendingBanNickname === name
                          ? "text-red-400 opacity-100"
                          : "text-red-400/40 opacity-0 group-hover:opacity-100"
                      }`}
                      title={pendingBanNickname === name ? "Tekrar tıkla: banla" : "Oyuncuyu banla"}
                    >
                      ✖
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === "question" && incomingCountdown && (
          <div className="bg-slate-900/60 px-6 py-8 flex flex-col items-center gap-5" style={{ borderLeft: "2px solid rgba(251,191,36,0.28)" }}>
            <div className="relative w-28 h-28 flex items-center justify-center border-4 border-amber-300/70 rounded-full shadow-[0_0_30px_rgba(251,191,36,0.35)]">
              <span className="font-[family-name:var(--font-orbitron)] text-5xl text-amber-300 font-black">
                {incomingCountdown}
              </span>
            </div>
            <p className="font-[family-name:var(--font-orbitron)] text-xl uppercase tracking-[0.22em] text-amber-300/90">
              Sonraki soru geliyor, hazırlan!
            </p>
          </div>
        )}

        {/* Aktif soru */}
        {currentQ && phase === "question" && !incomingCountdown && (
          <div className="bg-slate-900/60 px-6 py-5" style={{ borderLeft: "2px solid rgba(34,211,238,0.2)" }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.2em] text-cyan-400/60">Aktif Soru</p>
              <div className="font-[family-name:var(--font-orbitron)] text-2xl font-black"
                style={{ color: timeLeft > 10 ? "#22d3ee" : timeLeft > 5 ? "#fbbf24" : "#ef4444" }}>
                {timeLeft}s
              </div>
            </div>
            <p className="text-4xl md:text-5xl leading-tight text-slate-100 font-black mb-8 font-[family-name:var(--font-orbitron)]">
              {currentQ.text}
            </p>
            <div className="grid grid-cols-2 gap-6">
              {currentQ.options.map((opt, i) => (
                <div key={opt.id} className="flex items-center gap-5 p-6 border"
                  style={{ borderColor: `${SYMBOL_COLORS[i]}33`, background: `${SYMBOL_COLORS[i]}0d` }}>
                  <span
                    className="text-6xl md:text-7xl leading-none"
                    style={{ color: SYMBOL_COLORS[i], filter: `drop-shadow(0 0 14px ${SYMBOL_COLORS[i]}88)` }}
                  >
                    {SYMBOLS[i]}
                  </span>
                  <span className="text-2xl md:text-3xl font-semibold text-slate-100">{opt.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {(phase === "leaderboard" || phase === "final") && leaderboard && (
          <div className="bg-slate-900/60 px-6 py-5" style={{ borderLeft: "2px solid rgba(251,191,36,0.2)" }}>
              <p className="text-sm font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-amber-300/80 mb-4">
                {phase === "final"
                  ? "Final Sıralaması"
                  : `Güncel Sıralama — Tur ${leaderboard.roundIndex + 1}`}
            </p>
            {(() => {
              const ranked = rankRows();
              const top5 = ranked.slice(0, 5);
              const podium = [2, 1, 3]
                .map((rank) => top5.find((x) => x.rank === rank))
                .filter(Boolean) as typeof top5;

              return (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4 items-end">
                    {podium.map((p) => {
                      const isFirst = p.rank === 1;
                      const height = isFirst ? "h-28" : p.rank === 2 ? "h-22" : "h-18";
                      const medal = p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : "🥉";
                      return (
                        <div
                          key={`podium-${p.nickname}`}
                          className={`flex flex-col items-center justify-end ${height} border border-amber-300/40 bg-amber-300/10`}
                          style={isFirst ? { boxShadow: "0 0 18px rgba(249,115,22,0.35)" } : undefined}
                        >
                          <span className="text-2xl">{isFirst ? "🔥🥇" : medal}</span>
                          <span className="text-xs text-slate-300 font-semibold">{p.nickname}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-col gap-2">
                    {top5.map((p) => {
                const isTop3 = p.rank <= 3;
                const medal = p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : p.rank === 3 ? "🥉" : "";
                return (
                  <div
                    key={p.nickname}
                    className="flex items-center gap-3 px-4 py-2"
                    style={{
                      background: isTop3 ? "rgba(251,191,36,0.06)" : "rgba(15,23,42,0.5)",
                      borderLeft: `2px solid ${isTop3 ? "#fbbf24" : "#22d3ee"}44`,
                      animation: p.rank === 1 ? "rankPulse 1.6s ease-in-out infinite" : undefined,
                    }}
                  >
                    <span className="font-[family-name:var(--font-orbitron)] text-sm w-12 text-slate-300">
                      #{p.rank}
                    </span>
                    {medal && (
                      <span
                        className="text-xl"
                        style={p.rank === 1 ? { filter: "drop-shadow(0 0 10px #f97316)" } : undefined}
                      >
                        {p.rank === 1 ? "🔥🥇" : medal}
                      </span>
                    )}
                    <span className="flex-1 text-base font-semibold text-slate-200">{p.nickname}</span>
                    <div className="text-right">
                      <div className="font-[family-name:var(--font-orbitron)] text-sm text-amber-300">
                        {Math.round(p.totalScore)} pt
                      </div>
                      {phase !== "final" && (
                        <div className="text-[10px] text-slate-500">+{Math.round(p.roundTotalPoints)}</div>
                      )}
                    </div>
                  </div>
                );
                    })}
                  </div>
                </>
              );
            })()}
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
      <style>{`
        @keyframes rankPulse {
          0% { box-shadow: 0 0 0 rgba(249,115,22,0.0); }
          50% { box-shadow: 0 0 26px rgba(249,115,22,0.36), 0 0 10px rgba(251,191,36,0.24) inset; }
          100% { box-shadow: 0 0 0 rgba(249,115,22,0.0); }
        }
      `}</style>
    </div>
  );
}
