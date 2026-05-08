"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinGame, ApiError } from "@/lib/api";
import { savePlayerMeta, savePlayerToken } from "@/lib/auth";

type Step = "pin" | "username";

export default function PlayPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("pin");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [foundGame, setFoundGame] = useState<{ title: string; host: string } | null>(null);
  const [resolvedCode, setResolvedCode] = useState("");
  const [pinError, setPinError] = useState("");
  const [nameError, setNameError] = useState("");
  const [joining, setJoining] = useState(false);

  // ─── Adım 1: PIN kontrol ───────────────────────────────────────────────────
  function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPinError("");
    const code = pin.trim();
    if (!/^[0-9]{6}$/.test(code)) {
      setPinError("PIN 6 haneli numerik olmalı.");
      return;
    }

    setFoundGame({ title: "Canlı Oyun", host: "Admin" });
    setResolvedCode(code);
    setStep("username");
  }

  // ─── Adım 2: Kullanıcı adı gir ────────────────────────────────────────────
  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNameError("");
    const name = username.trim();
    if (name.length < 4) {
      setNameError("Kullanıcı adı en az 4 karakter olmalı.");
      return;
    }
    setJoining(true);
    try {
      const result = await joinGame(resolvedCode, name);
      savePlayerToken(result.accessToken);
      savePlayerMeta({ id: result.sessionId, name: result.nickname, code: result.gamePin });
      router.push("/play/lobby");
    } catch (err) {
      if (err instanceof ApiError) {
        setNameError(err.status >= 500 ? "Bağlantıda sorun var, lütfen tekrar dene." : err.message);
      } else {
        setNameError("Bağlantıda sorun var, lütfen tekrar dene.");
      }
      setJoining(false);
    }
  }

  // ─── Arka plan (çekilis'ten birebir alındı) ───────────────────────────────
  const BG = (
    <div
      className="pointer-events-none absolute inset-0 opacity-80"
      aria-hidden
      style={{
        backgroundImage:
          "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.24), transparent), radial-gradient(ellipse 70% 40% at 100% 60%, rgba(251,191,36,0.12), transparent), linear-gradient(rgba(148,163,184,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.22) 1px, transparent 1px)",
        backgroundSize: "100% 100%, 100% 100%, 44px 44px, 44px 44px",
      }}
    />
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030712] text-slate-100">
      {BG}

      <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center justify-center px-4 py-10 text-center sm:px-6">

        {/* ─── Logo ─────────────────────────────────────────────────────────── */}
        <div className="mb-6 flex items-center gap-3 sm:gap-4">
          <Image
            src="/favicon.webp"
            alt="ETÜBMT logosu"
            width={76}
            height={76}
            className="h-auto w-auto"
            priority
          />
        </div>

        {/* ─── Başlık ───────────────────────────────────────────────────────── */}
        <h1 className="font-[family-name:var(--font-orbitron)] text-3xl font-bold tracking-tight text-white sm:text-5xl">
          QUIZ<span className="text-amber-300">ETU</span>
        </h1>
        <p className="mt-2 text-sm tracking-[0.2em] text-cyan-400/70 uppercase font-[family-name:var(--font-orbitron)]">
          Canlı Quiz Platformu
        </p>

        {/* ─── Kart: PIN giriş ──────────────────────────────────────────────── */}
        {step === "pin" && (
          <form
            onSubmit={handlePinSubmit}
            className="mt-10 flex w-full max-w-sm flex-col items-center gap-5"
          >
            <div className="w-full bg-slate-900/70 px-6 py-8 text-center"
                 style={{ boxShadow: "0 0 40px rgba(34,211,238,0.08) inset" }}>
              <p className="font-[family-name:var(--font-orbitron)] text-[11px] uppercase tracking-[0.28em] text-cyan-400 mb-5">
                Oyun PIN'i
              </p>
              <input
                id="game-pin"
                type="text"
                autoComplete="off"
                autoFocus
                maxLength={6}
                placeholder="123456"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full bg-transparent text-center font-[family-name:var(--font-orbitron)] text-4xl sm:text-5xl font-bold tracking-[0.18em] text-amber-300 outline-none placeholder:text-slate-700 border-b-2 border-cyan-500/40 focus:border-cyan-400 pb-2 transition-colors"
                style={{ textShadow: pin ? "0 0 24px rgba(251,191,36,0.4)" : "none" }}
              />
              {pinError && (
                <p className="mt-4 text-xs text-red-400 font-[family-name:var(--font-orbitron)] tracking-wide">
                  ⚠ {pinError}
                </p>
              )}
            </div>

            <button
              id="pin-submit-btn"
              type="submit"
              className="inline-flex min-h-12 w-full items-center justify-center bg-cyan-400 px-8 py-3 font-[family-name:var(--font-orbitron)] text-sm font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-cyan-300 active:scale-[0.98]"
            >
              Oyunu Bul →
            </button>

            <a href="/" className="text-xs text-slate-600 hover:text-slate-400 font-[family-name:var(--font-orbitron)] tracking-widest uppercase transition-colors">
              ← Ana Sayfa
            </a>
          </form>
        )}

        {/* ─── Kart: Oyun bulundu + kullanıcı adı ──────────────────────────── */}
        {step === "username" && foundGame && (
          <form
            onSubmit={handleNameSubmit}
            className="mt-10 flex w-full max-w-sm flex-col items-center gap-5"
          >
            {/* Oyun bulundu banner */}
            <div
              className="w-full bg-amber-300/10 px-6 py-5 text-center"
              style={{ boxShadow: "0 0 36px rgba(251,191,36,0.18) inset" }}
            >
              <p className="font-[family-name:var(--font-orbitron)] text-[10px] uppercase tracking-[0.3em] text-amber-300 mb-1">
                ✓ Oyun Bulundu
              </p>
              <p className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-white">
                {foundGame.title}
              </p>
              <p className="text-xs text-slate-400 mt-1 font-[family-name:var(--font-orbitron)] tracking-wider">
                PIN: {resolvedCode}
              </p>
            </div>

            {/* Kullanıcı adı alanı */}
            <div className="w-full bg-slate-900/70 px-6 py-8 text-center"
                 style={{ boxShadow: "0 0 40px rgba(34,211,238,0.08) inset" }}>
              <p className="font-[family-name:var(--font-orbitron)] text-[11px] uppercase tracking-[0.28em] text-cyan-400 mb-5">
                Kullanıcı Adınız
              </p>
              <input
                id="player-name"
                type="text"
                autoComplete="off"
                autoFocus
                maxLength={20}
                placeholder="en az 4 karakter"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-transparent text-center font-[family-name:var(--font-orbitron)] text-2xl sm:text-3xl font-bold tracking-[0.12em] text-cyan-300 outline-none placeholder:text-slate-700 border-b-2 border-cyan-500/40 focus:border-cyan-400 pb-2 transition-colors"
              />
              <p className="mt-3 text-xs text-slate-600 font-[family-name:var(--font-orbitron)] tracking-wide">
                {username.trim().length}/4 min karakter
                {username.trim().length >= 4 && <span className="text-amber-300 ml-2">✓</span>}
              </p>
              {nameError && (
                <p className="mt-3 text-xs text-red-400 font-[family-name:var(--font-orbitron)] tracking-wide">
                  ⚠ {nameError}
                </p>
              )}
            </div>

            <button
              id="name-submit-btn"
              type="submit"
              disabled={joining}
              className="inline-flex min-h-12 w-full items-center justify-center bg-amber-300 px-8 py-3 font-[family-name:var(--font-orbitron)] text-sm font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-amber-200 disabled:bg-slate-500 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {joining ? "Katılınıyor..." : "Bekleme Salonuna Gir →"}
            </button>

            <button
              type="button"
              onClick={() => { setStep("pin"); setPin(""); setPinError(""); setFoundGame(null); }}
              className="text-xs text-slate-600 hover:text-slate-400 font-[family-name:var(--font-orbitron)] tracking-widest uppercase transition-colors"
            >
              ← Farklı PIN Gir
            </button>
          </form>
        )}

        {/* ─── Alt bilgi ───────────────────────────────────────────────────── */}
        <p className="absolute bottom-6 text-xs text-slate-700 font-[family-name:var(--font-orbitron)] tracking-[0.2em] uppercase">
          SKYTECH26 × ETÜBMT
        </p>
      </main>
    </div>
  );
}
