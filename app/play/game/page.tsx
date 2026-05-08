"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getPlayerToken, getPlayerMeta, getCurrentOptions, saveCurrentOptions, clearPlayer } from "@/lib/auth";
import { submitAnswer, ApiError } from "@/lib/api";
import { createAndStartHub } from "@/lib/signalr";
import type {
  NextQuestionPayload,
  ShowCorrectAnswerPayload,
  ShowLeaderboardPayload,
  EndGamePayload,
  LobbySnapshotPayload,
} from "@/lib/signalr";

const SYMBOLS = ["▲", "◆", "●", "★"] as const;
const COLORS  = ["#22d3ee", "#fbbf24", "#e879f9", "#a3e635"];
const BG_COLORS = ["rgba(8,47,73,0.85)", "rgba(78,38,7,0.85)", "rgba(74,4,78,0.85)", "rgba(26,46,5,0.85)"];
const BORDER_COLORS = ["rgba(34,211,238,0.5)", "rgba(251,191,36,0.5)", "rgba(232,121,249,0.5)", "rgba(163,230,53,0.5)"];

export default function GamePage() {
  const router = useRouter();
  const [question, setQuestion] = useState<NextQuestionPayload | null>(null);
  const [myName, setMyName] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [reconnectingTooLong, setReconnectingTooLong] = useState(false);
  const [incomingCountdown, setIncomingCountdown] = useState<number | null>(null);
  const questionStartRef = useRef<number>(Date.now());
  const stopHubRef = useRef<(() => Promise<void>) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const incomingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const lastTickSecondRef = useRef<number | null>(null);

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

  const playTick = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !audioUnlockedRef.current) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(920, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.035, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }, []);

  const playCountdownBeep = useCallback((isFinal: boolean) => {
    const ctx = audioCtxRef.current;
    if (!ctx || !audioUnlockedRef.current) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(isFinal ? 760 : 620, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(isFinal ? 0.055 : 0.04, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (isFinal ? 0.16 : 0.11));
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (isFinal ? 0.18 : 0.13));
  }, []);

  const playAnswerFx = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !audioUnlockedRef.current) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.linearRampToValueAtTime(760, now + 0.12);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }, []);

  const startTimer = useCallback((timeLimit: number, startedAtUtc?: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const nowMs = Date.now();
    const startedAtMs = startedAtUtc ? new Date(startedAtUtc).getTime() : nowMs;
    questionStartRef.current = Number.isNaN(startedAtMs) ? nowMs : startedAtMs;
    const initialLeft = Math.max(
      0,
      Math.ceil(timeLimit - (nowMs - questionStartRef.current) / 1000)
    );
    lastTickSecondRef.current = null;
    setTimeLeft(initialLeft);
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - questionStartRef.current) / 1000;
      const left = Math.max(0, Math.ceil(timeLimit - elapsed));
      setTimeLeft(left);
      if (left === 0 && timerRef.current) clearInterval(timerRef.current);
    }, 200);
  }, []);

  const showIncomingQuestion = useCallback((q: NextQuestionPayload) => {
    saveCurrentOptions(q.options);
    setQuestion(null);
    setSelected(null);
    setSubmitted(false);
    setError("");
    setIncomingCountdown(3);

    if (incomingTimerRef.current) clearInterval(incomingTimerRef.current);
    incomingTimerRef.current = setInterval(() => {
      setIncomingCountdown((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          if (incomingTimerRef.current) clearInterval(incomingTimerRef.current);
          setQuestion(q);
          startTimer(q.timeLimit, q.startedAtUtc);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [startTimer]);

  useEffect(() => {
    const meta = getPlayerMeta();
    const token = getPlayerToken();
    if (!meta || !token) { router.push("/"); return; }
    setMyName(meta.name);

    const cachedQuestionRaw =
      sessionStorage.getItem("quizetu:incoming_question") ??
      sessionStorage.getItem("quizetu:current_question");
    if (cachedQuestionRaw) {
      try {
        const cachedQuestion = JSON.parse(cachedQuestionRaw) as NextQuestionPayload;
        if (cachedQuestion?.questionId) {
          showIncomingQuestion(cachedQuestion);
        }
      } catch {
        // ignore invalid cache
      } finally {
        sessionStorage.removeItem("quizetu:incoming_question");
        sessionStorage.removeItem("quizetu:current_question");
      }
    } else {
      // Eğer önceki NextQuestion event'i lobby'de sadece seçenek olarak saklandıysa
      const savedOptions = getCurrentOptions();
      if (savedOptions.length > 0) {
        // Soru payload'i yoksa event beklenir.
      }
    }

    (async () => {
      try {
        const stop = await createAndStartHub(token, meta.code, {
          onConnectionIssue: (isStuck) => setReconnectingTooLong(isStuck),
          onLobbySnapshot: (snapshot: LobbySnapshotPayload) => {
            if (snapshot.currentQuestion) {
              const q = snapshot.currentQuestion;
              showIncomingQuestion(q);
            }
          },
          onNextQuestion: (q: NextQuestionPayload) => {
            sessionStorage.removeItem("quizetu:selected_option_id");
            showIncomingQuestion(q);
          },
          onShowCorrectAnswer: (payload: ShowCorrectAnswerPayload) => {
            // Doğru cevabı result sayfasına taşı
            sessionStorage.setItem("quizetu:last_correct_option_id", payload.correctOptionId);
            sessionStorage.setItem("quizetu:last_correct_option_text", payload.correctOptionText);
            router.push("/play/result");
          },
          onShowLeaderboard: (_lb: ShowLeaderboardPayload) => {
            // Ara leaderboard oyuncu ekranina basilmiyor.
          },
          onEndGame: (eg: EndGamePayload) => {
            sessionStorage.setItem("quizetu:final", JSON.stringify(eg));
            router.push("/play/result");
          },
          onPlayerRemoved: (payload) => {
            if (payload.nickname === meta.name) {
              clearPlayer();
              router.push("/");
            }
          },
        });
        stopHubRef.current = stop;
      } catch (err) {
        console.error("Hub bağlantı hatası:", err);
      }
    })();

    return () => {
      stopHubRef.current?.();
      if (timerRef.current) clearInterval(timerRef.current);
      if (incomingTimerRef.current) clearInterval(incomingTimerRef.current);
    };
  }, [router, showIncomingQuestion]);

  async function handleAnswer(idx: number) {
    if (selected !== null || submitted || !question) return;
    const options = getCurrentOptions();
    if (!options[idx]) return;
    const token = getPlayerToken();
    const meta = getPlayerMeta();
    if (!token || !meta) return;

    setSelected(idx);
    playAnswerFx();
    const elapsedMs = Date.now() - questionStartRef.current;
    sessionStorage.setItem("quizetu:selected_option_id", options[idx].id);

    try {
      await submitAnswer(meta.code, options[idx].id, elapsedMs, token);
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSubmitted(true); // Zaten cevapladı
      } else if (err instanceof ApiError && err.status === 400) {
        setSubmitted(true);
        setError("Bu soru icin cevap suresi doldu veya cevap zaten alindi.");
      } else {
        setError("Cevap gönderilemedi.");
      }
    }
  }

  const progress = question ? timeLeft / question.timeLimit : 1;
  const circumference = 283;
  const strokeOffset = circumference * (1 - progress);
  const timerColorVal = timeLeft > (question?.timeLimit ?? 20) * 0.5 ? COLORS[0] : timeLeft > (question?.timeLimit ?? 20) * 0.25 ? COLORS[1] : "#ef4444";

  useEffect(() => {
    if (!question || submitted || incomingCountdown) return;
    if (timeLeft > 0 && timeLeft <= 5 && lastTickSecondRef.current !== timeLeft) {
      playTick();
      lastTickSecondRef.current = timeLeft;
    }
  }, [timeLeft, question, submitted, incomingCountdown, playTick]);

  useEffect(() => {
    if (!incomingCountdown) return;
    playCountdownBeep(incomingCountdown === 1);
  }, [incomingCountdown, playCountdownBeep]);

  const BG = (
    <div className="pointer-events-none absolute inset-0" aria-hidden style={{
      backgroundImage:
        "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.18), transparent)," +
        "linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px)," +
        "linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
      backgroundSize: "100% 100%, 44px 44px, 44px 44px",
    }} />
  );

  if (!question) {
    return (
      <div className="relative min-h-screen bg-[#030712] flex items-center justify-center">
        {BG}
        <div className="relative z-10 flex flex-col items-center gap-4">
          {incomingCountdown ? (
            <>
              <div className="relative w-24 h-24 flex items-center justify-center border-4 border-amber-300/60 rounded-full shadow-[0_0_24px_rgba(251,191,36,0.35)]">
                <span className="font-[family-name:var(--font-orbitron)] text-4xl text-amber-300 font-black">
                  {incomingCountdown}
                </span>
              </div>
              <p className="font-[family-name:var(--font-orbitron)] text-sm uppercase tracking-[0.28em] text-amber-300/80">
                Sonraki soru geliyor, hazırlan!
              </p>
            </>
          ) : (
            <>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden style={{ animation: "spin 1.2s linear infinite" }}>
                <circle cx="24" cy="24" r="20" stroke="rgba(34,211,238,0.2)" strokeWidth="4" />
                <circle cx="24" cy="24" r="20" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" strokeDasharray="80 46" />
              </svg>
              <p className="font-[family-name:var(--font-orbitron)] text-xs uppercase tracking-[0.28em] text-cyan-400/50">Soru bekleniyor...</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#030712] overflow-hidden flex flex-col text-slate-100">
      {BG}

      {/* Üst bar */}
      <div className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-slate-800/60">
        <span className="text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.2em] text-slate-500">
          Soru {question.questionIndex + 1}
          {question.totalQuestions ? ` / ${question.totalQuestions}` : ""}
        </span>
        <span className="text-[10px] font-mono text-cyan-400/50">{myName}</span>
      </div>

      <div className="relative z-10 flex flex-col items-center flex-1 px-5 py-6 gap-6 max-w-lg mx-auto w-full">

        {/* Timer */}
        {reconnectingTooLong && (
          <div className="w-full text-xs text-amber-300 font-mono bg-amber-500/10 border border-amber-500/40 px-4 py-3">
            ⚠ Yeniden bağlanıyor... Sorun hala devam ediyor mu, QR okutarak veya PIN&apos;i tekrar girerek bağlanmayı deneyin.
          </div>
        )}

        <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
          <svg width="80" height="80" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <circle cx="50" cy="50" r="45" fill="none" stroke={timerColorVal} strokeWidth="6"
              strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeOffset}
              style={{ transition: "stroke-dashoffset 0.2s linear, stroke 0.5s", filter: `drop-shadow(0 0 8px ${timerColorVal}88)` }}
            />
          </svg>
          <span
            className={`absolute font-[family-name:var(--font-orbitron)] text-xl font-bold ${timeLeft <= 5 && timeLeft > 0 ? "animate-pulse" : ""}`}
            style={{ color: timerColorVal }}
          >
            {timeLeft}
          </span>
        </div>

        {/* 4 sembol buton — soru metni yok (büyük ekrandan takip edilir) */}
        <p className="text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.28em] text-slate-600">
          Büyük ekrandaki sembolü seç
        </p>

        <div className="grid grid-cols-2 gap-4 w-full">
          {SYMBOLS.map((symbol, i) => {
            const isSelected = selected === i;
            const isDisabled = selected !== null || timeLeft === 0;
            const dimmed = selected !== null && !isSelected;
            return (
              <button key={symbol} id={`answer-${i}`} onClick={() => handleAnswer(i)}
                disabled={isDisabled}
                style={{
                  background: dimmed ? "rgba(15,23,42,0.6)" : BG_COLORS[i],
                  border: `2px solid ${isSelected ? COLORS[i] : dimmed ? "rgba(71,85,105,0.3)" : BORDER_COLORS[i]}`,
                  boxShadow: isSelected ? `0 0 32px ${COLORS[i]}55` : "none",
                  opacity: dimmed ? 0.35 : 1,
                  transition: "all 0.2s",
                }}
                className="flex flex-col items-center justify-center gap-2 py-8 active:scale-[0.96] disabled:cursor-not-allowed rounded-sm"
              >
                <span className="text-5xl leading-none select-none"
                  style={{ color: dimmed ? "rgba(148,163,184,0.4)" : COLORS[i], filter: isSelected ? `drop-shadow(0 0 16px ${COLORS[i]})` : "none", transition: "all 0.2s" }}>
                  {symbol}
                </span>
              </button>
            );
          })}
        </div>

        {error && <p className="text-xs text-red-400 font-mono">⚠ {error}</p>}

        {submitted && (
          <p className="text-xs font-[family-name:var(--font-orbitron)] text-cyan-400/60 uppercase tracking-[0.24em] animate-pulse">
            Cevap gönderildi — sonuç bekleniyor...
          </p>
        )}

        {timeLeft === 0 && !submitted && (
          <p className="text-xs font-[family-name:var(--font-orbitron)] text-slate-600 uppercase tracking-[0.2em]">
            Süre doldu
          </p>
        )}
      </div>
    </div>
  );
}
