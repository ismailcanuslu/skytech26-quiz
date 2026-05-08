"use client";

import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getPlayerToken, getPlayerMeta, clearPlayer } from "@/lib/auth";
import { createAndStartHub } from "@/lib/signalr";
import type {
  PlayerJoinedPayload,
  NextQuestionPayload,
  LobbySnapshotPayload,
} from "@/lib/signalr";
import { saveCurrentOptions } from "@/lib/auth";

export default function LobbyPage() {
  const router = useRouter();
  const [gameCode, setGameCode] = useState("—");
  const [myName, setMyName] = useState("");
  const [playerCount, setPlayerCount] = useState(1);
  const [players, setPlayers] = useState<string[]>([]);
  const [reconnectingTooLong, setReconnectingTooLong] = useState(false);
  const [dotCount, setDotCount] = useState(1);
  const stopHubRef = useRef<(() => Promise<void>) | null>(null);
  const dotRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const meta = getPlayerMeta();
    const token = getPlayerToken();
    if (!meta || !token) { router.push("/"); return; }
    setGameCode(meta.code);
    setMyName(meta.name);
    setPlayers([meta.name]);
    setPlayerCount(1);

    // Dönen nokta
    dotRef.current = setInterval(() => setDotCount((d) => (d % 3) + 1), 600);

    // SignalR hub bağlantısı
    (async () => {
      try {
        const stop = await createAndStartHub(token, meta.code, {
          onConnectionIssue: (isStuck) => setReconnectingTooLong(isStuck),
          onLobbySnapshot: (snapshot: LobbySnapshotPayload) => {
            setPlayers(snapshot.players);
            setPlayerCount(snapshot.playerCount);
            if (snapshot.currentQuestion) {
              saveCurrentOptions(snapshot.currentQuestion.options);
              sessionStorage.setItem(
                "quizetu:current_question",
                JSON.stringify(snapshot.currentQuestion)
              );
              router.push("/play/game");
            }
          },
          onPlayerJoined: (p: PlayerJoinedPayload) => {
            setPlayerCount(p.playerCount);
            setPlayers((prev) => {
              if (prev.includes(p.nickname)) return prev;
              return [...prev, p.nickname];
            });
          },
          onPlayerRemoved: (p) => {
            setPlayerCount(p.playerCount);
            setPlayers((prev) => prev.filter((name) => name !== p.nickname));
            if (p.nickname === meta.name) {
              clearPlayer();
              router.push("/");
            }
          },
          onNextQuestion: (q: NextQuestionPayload) => {
            // Seçenekleri sakla (optionId lookup için)
            saveCurrentOptions(q.options);
            router.push("/play/game");
          },
        });
        stopHubRef.current = stop;
      } catch (err) {
        console.error("Hub bağlantı hatası:", err);
      }
    })();

    return () => {
      stopHubRef.current?.();
      if (dotRef.current) clearInterval(dotRef.current);
    };
  }, [router]);

  const dots = ".".repeat(dotCount);

  const BG = (
    <div className="pointer-events-none absolute inset-0" aria-hidden style={{
      backgroundImage:
        "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.22), transparent)," +
        "radial-gradient(ellipse 70% 40% at 100% 60%, rgba(251,191,36,0.10), transparent)," +
        "linear-gradient(rgba(148,163,184,0.18) 1px, transparent 1px)," +
        "linear-gradient(90deg, rgba(148,163,184,0.18) 1px, transparent 1px)",
      backgroundSize: "100% 100%, 100% 100%, 44px 44px, 44px 44px",
    }} />
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030712] text-slate-100 flex flex-col">
      {BG}

      <main className="relative flex flex-col flex-1 items-center px-5 pt-10 pb-24 text-center max-w-2xl mx-auto w-full">

        {/* Logo + Başlık */}
        <div className="flex flex-col items-center gap-2 mb-6">
          <Image src="/favicon.webp" alt="ETÜBMT" width={52} height={52} className="h-auto w-auto opacity-80" />
          <h1 className="font-[family-name:var(--font-orbitron)] text-xl font-bold text-white tracking-tight">
            SKYTECH<span className="text-amber-300">26</span>
            <span className="text-cyan-400 mx-2">×</span>ETU
          </h1>
        </div>

        {/* Quiz PIN */}
        <div className="w-full bg-slate-900/70 px-6 py-5 mb-5" style={{ boxShadow: "0 0 40px rgba(34,211,238,0.07) inset" }}>
          <p className="font-[family-name:var(--font-orbitron)] text-[10px] uppercase tracking-[0.32em] text-cyan-400/60 mb-1">Bekleme Salonu</p>
          <p className="text-xs text-slate-500 mt-1 font-mono tracking-widest">
            PIN: <span className="text-amber-300">{gameCode}</span>
          </p>
          <p className="font-[family-name:var(--font-orbitron)] text-sm text-slate-300 mt-1">
            Hoş geldin, <span className="text-cyan-400">{myName}</span>!
          </p>
        </div>

        {/* Nasıl oynanır butonu */}
        <div className="w-full flex justify-end mb-3">
          <button type="button" onClick={() => document.getElementById("how-to-play")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="inline-flex items-center gap-2 px-4 py-2 text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-cyan-400 border border-cyan-500/30 bg-slate-900/60 hover:border-cyan-400/60 hover:text-cyan-300 transition-colors">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
              <rect x="5.25" y="5" width="1.5" height="4" rx="0.5" fill="currentColor" />
              <rect x="5.25" y="2.5" width="1.5" height="1.5" rx="0.5" fill="currentColor" />
            </svg>
            Nasıl Oynanır?
          </button>
        </div>

        {/* Katılımcı sayısı */}
        {reconnectingTooLong && (
          <div className="w-full mb-4 text-xs text-amber-300 font-mono bg-amber-500/10 border border-amber-500/40 px-4 py-3">
            ⚠ Yeniden bağlanıyor... Sorun hala devam ediyor mu, QR okutarak veya PIN&apos;i tekrar girerek bağlanmayı deneyin.
          </div>
        )}

        <div className="w-full bg-amber-300/8 px-6 py-5 mb-5" style={{ boxShadow: "0 0 32px rgba(251,191,36,0.1) inset" }}>
          <div className="flex items-center justify-center gap-4">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden style={{ flexShrink: 0, animation: "spin 1.4s linear infinite" }}>
              <circle cx="18" cy="18" r="15" stroke="rgba(251,191,36,0.15)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" strokeDasharray="60 34"
                style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.7))" }} />
            </svg>
            <div className="flex items-baseline gap-3">
              <span className="font-[family-name:var(--font-orbitron)] text-5xl font-black text-amber-300" style={{ textShadow: "0 0 24px rgba(251,191,36,0.4)" }}>
                {playerCount}
              </span>
              <span className="font-[family-name:var(--font-orbitron)] text-sm text-slate-300 tracking-wide">kişi katıldı</span>
            </div>
          </div>
        </div>

        {/* Oyuncu listesi */}
        <div className="w-full flex flex-wrap justify-center gap-2 mb-6 min-h-[50px]">
          {players.map((name, i) => (
            <span key={`${name}-${i}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/70 border text-sm font-semibold"
              style={{
                borderColor: name === myName ? "rgba(251,191,36,0.5)" : "rgba(34,211,238,0.22)",
                color: name === myName ? "#fde68a" : "#e2e8f0",
                animation: `fadeInLeft 0.35s ${i * 0.07}s both`,
              }}>
              <span style={{ color: name === myName ? "#fbbf24" : "#22d3ee" }}>●</span>
              {name}
              {name === myName && <span className="text-[9px] font-[family-name:var(--font-orbitron)] tracking-widest text-amber-300/70 ml-1">(sen)</span>}
            </span>
          ))}
        </div>

        {/* Nasıl oynanır */}
        <div id="how-to-play" className="w-full bg-slate-900/50 px-5 py-5 mb-28 text-left" style={{ borderLeft: "2px solid rgba(34,211,238,0.25)", scrollMarginTop: "16px" }}>
          <p className="font-[family-name:var(--font-orbitron)] text-[9px] uppercase tracking-[0.32em] text-cyan-400/70 mb-3">Nasıl oynanır?</p>
          <p className="text-xs text-slate-400 leading-relaxed mb-4">
            Soruları <span className="text-white font-semibold">karşınızdaki büyük ekrandan</span> takip edeceksiniz.
            Doğru cevabın hangi şıkla eşleştiğini düşünüyorsanız, telefonunuzda beliren o şıka tıklayın.
          </p>
          <div className="bg-slate-800/60 px-4 py-3 mb-4" style={{ borderLeft: "2px solid rgba(251,191,36,0.3)" }}>
            <p className="text-[10px] text-amber-300/70 font-[family-name:var(--font-orbitron)] tracking-widest uppercase mb-2">Örnek</p>
            <p className="text-xs text-slate-300 leading-relaxed">
              Büyük ekranda <span className="text-white font-semibold">«Türkiye&apos;nin başkenti neresidir?»</span> sorusu çıktı.
              <span className="text-white font-semibold"> Ankara</span> seçeneğinin yanında bir{" "}
              <span className="text-amber-300 font-bold">★ yıldız</span> sembolü görüyorsunuz.
              Telefonunuzda <span className="text-amber-300 font-bold">★ yıldıza</span> tıklamanız yeterli.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { symbol: "▲", label: "Üçgen",  color: "#22d3ee", bg: "rgba(8,47,73,0.7)"  },
              { symbol: "◆", label: "Elmas",  color: "#fbbf24", bg: "rgba(78,38,7,0.7)"  },
              { symbol: "●", label: "Daire",  color: "#e879f9", bg: "rgba(74,4,78,0.7)"  },
              { symbol: "★", label: "Yıldız", color: "#a3e635", bg: "rgba(26,46,5,0.7)"  },
            ].map(({ symbol, label, color, bg }) => (
              <div key={label} className="flex flex-col items-center justify-center py-3 gap-1" style={{ background: bg, border: `1px solid ${color}44` }}>
                <span className="text-xl leading-none" style={{ color, filter: `drop-shadow(0 0 6px ${color}88)` }}>{symbol}</span>
                <span className="text-[9px] font-[family-name:var(--font-orbitron)] tracking-wide" style={{ color: `${color}99` }}>{label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-slate-600 leading-relaxed">
            Sizin cihazınızda sorular gözükmeyecek — <span className="text-slate-500">yalnızca şıkları işaretleyebileceksiniz.</span>
          </p>
        </div>
      </main>

      {/* Sabit alt yazı */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#030712]/95 border-t border-slate-800/60 py-4 text-center z-20">
        <p className="font-[family-name:var(--font-orbitron)] text-xs uppercase tracking-[0.28em] text-slate-400">
          Oyunun başlatılması bekleniyor
          <span className="text-cyan-400 ml-1 inline-block w-5 text-left">{dots}</span>
        </p>
      </div>

      <style>{`
        @keyframes fadeInLeft { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
