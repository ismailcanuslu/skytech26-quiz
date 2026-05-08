"use client";

import Image from "next/image";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { joinGame, ApiError } from "@/lib/api";
import { savePlayerToken, savePlayerMeta } from "@/lib/auth";

type Step = "pin" | "username";

function handlePinChange(val: string, setPin: (v: string) => void) {
  const digits = val.replace(/\D/g, "").slice(0, 6);
  setPin(digits);
}

function LandingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("pin");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [pinError, setPinError] = useState("");
  const [nameError, setNameError] = useState("");
  const [joining, setJoining] = useState(false);

  // URL'den ?pin= oku → adım 2'ye atla
  useEffect(() => {
    const urlPin = searchParams.get("pin")?.replace(/\D/g, "").slice(0, 6) ?? "";
    if (urlPin.length === 6) {
      setPin(urlPin);
      setStep("username");
    }
  }, [searchParams]);

  // ── Adım 1: PIN doğrula ─────────────────────────────────────────────────────
  function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPinError("");
    if (pin.length !== 6) { setPinError("PIN 6 haneli olmalıdır."); return; }
    setStep("username");
  }

  // ── Adım 2: Nick seç → join API ─────────────────────────────────────────────
  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNameError("");
    const name = username.trim();
    if (name.length < 4) { setNameError("Kullanıcı adı en az 4 karakter olmalı."); return; }
    setJoining(true);

    try {
      const res = await joinGame(pin, name);
      savePlayerToken(res.accessToken);
      savePlayerMeta({ id: res.sessionId, name: res.nickname, code: res.gamePin });
      router.push("/play/lobby");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) setNameError("Oyun bulunamadı. PIN'i kontrol et.");
        else if (err.status === 409) setNameError("Bu kullanıcı adı zaten alınmış.");
        else setNameError(`Hata ${err.status}: ${err.message}`);
      } else {
        setNameError("Sunucuya ulaşılamadı.");
      }
      setJoining(false);
    }
  }

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
    // ... (aynı JSX, değişmedi)
    <div className="relative min-h-screen overflow-hidden bg-[#030712] text-slate-100">
      {BG}
      <main className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-5 py-10 text-center">

        {/* Logo + Başlık */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image src="/favicon.webp" alt="ETÜBMT logosu" width={72} height={72} className="h-auto w-auto" priority />
          <h1 className="font-[family-name:var(--font-orbitron)] text-3xl font-bold tracking-tight text-white sm:text-5xl">
            SKYTECH<span className="text-amber-300">26</span>
            <span className="text-cyan-400 mx-3 text-2xl sm:text-4xl">×</span>
            <span className="text-white">ETU</span>
          </h1>
        </div>

        {/* ── Adım 1: PIN ── */}
        {step === "pin" && (
          <form onSubmit={handlePinSubmit} className="flex w-full max-w-sm flex-col items-center gap-5">
            <p className="text-sm text-slate-400 font-[family-name:var(--font-orbitron)] tracking-wide leading-relaxed">
              Ekranda gördüğünüz <span className="text-cyan-400">PIN</span>&apos;i yazın<br />ya da QR kodunu okutun
            </p>

            <div className="w-full bg-slate-900/70 px-6 py-8" style={{ boxShadow: "0 0 40px rgba(34,211,238,0.07) inset" }}>
              <p className="font-[family-name:var(--font-orbitron)] text-[10px] uppercase tracking-[0.32em] text-cyan-400/70 mb-5">Oyun PIN — 6 hane</p>
              <div className="relative inline-flex justify-center gap-2" style={{ touchAction: "manipulation" }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex h-14 w-10 sm:w-12 items-center justify-center border-b-2 transition-all duration-150"
                    style={{
                      borderColor: pin.length === i ? "rgba(34,211,238,1)" : pin[i] ? "rgba(251,191,36,0.8)" : "rgba(71,85,105,0.4)",
                      background: pin.length === i ? "rgba(34,211,238,0.04)" : "transparent",
                    }}>
                    <span className="font-[family-name:var(--font-orbitron)] text-3xl font-bold select-none"
                      style={{ color: pin[i] ? "#fbbf24" : "transparent", textShadow: pin[i] ? "0 0 16px rgba(251,191,36,0.5)" : "none" }}>
                      {pin[i] ?? "·"}
                    </span>
                  </div>
                ))}
                <input id="game-pin" type="tel" inputMode="numeric" pattern="[0-9]*"
                  autoComplete="one-time-code" autoFocus value={pin}
                  onChange={(e) => { handlePinChange(e.target.value, setPin); setPinError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handlePinSubmit(e as unknown as React.FormEvent)}
                  aria-label="Oyun PIN kodu"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "text", fontSize: "16px", caretColor: "transparent" }}
                />
              </div>
              <p className="mt-3 text-[10px] text-slate-600 font-[family-name:var(--font-orbitron)] tracking-widest select-none">kutucuklara tıkla / dokunarak yaz</p>
              {pinError && <p className="mt-4 text-xs text-red-400 font-[family-name:var(--font-orbitron)] tracking-wide">⚠ {pinError}</p>}
            </div>

            <button id="pin-submit-btn" type="submit" disabled={pin.length !== 6}
              className="inline-flex min-h-12 w-full items-center justify-center bg-cyan-400 px-8 py-3 font-[family-name:var(--font-orbitron)] text-sm font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-cyan-300 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed active:scale-[0.98]">
              Oyunu Bul →
            </button>
          </form>
        )}

        {/* ── Adım 2: Nick ── */}
        {step === "username" && (
          <form onSubmit={handleNameSubmit} className="flex w-full max-w-sm flex-col items-center gap-5">
            <div className="w-full bg-amber-300/10 px-6 py-4" style={{ boxShadow: "0 0 32px rgba(251,191,36,0.12) inset" }}>
              <p className="font-[family-name:var(--font-orbitron)] text-[10px] uppercase tracking-[0.32em] text-amber-300 mb-1">✓ PIN Doğrulandı</p>
              <p className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-white">PIN: <span className="text-amber-300">{pin}</span></p>
            </div>

            <div className="w-full bg-slate-900/70 px-6 py-8" style={{ boxShadow: "0 0 40px rgba(34,211,238,0.07) inset" }}>
              <p className="font-[family-name:var(--font-orbitron)] text-[10px] uppercase tracking-[0.32em] text-cyan-400/70 mb-5">Kullanıcı Adınız</p>
              <input id="player-name" type="text" autoComplete="off" autoFocus maxLength={20}
                placeholder="en az 4 karakter..."
                value={username}
                onChange={(e) => { setUsername(e.target.value); setNameError(""); }}
                className="w-full bg-transparent text-center font-[family-name:var(--font-orbitron)] text-2xl font-bold tracking-[0.1em] text-cyan-300 outline-none placeholder:text-slate-700 border-b-2 border-cyan-500/30 focus:border-cyan-400 pb-2 transition-colors"
              />
              <div className="mt-3 flex items-center justify-center gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-1 w-6 rounded-full transition-colors duration-300"
                    style={{ background: username.trim().length >= n ? n <= 2 ? "rgba(34,211,238,0.7)" : "#a3e635" : "rgba(71,85,105,0.4)" }} />
                ))}
                <span className="text-xs text-slate-500 ml-1 font-mono">{Math.min(username.trim().length, 4)}/4</span>
              </div>
              {nameError && <p className="mt-3 text-xs text-red-400 font-[family-name:var(--font-orbitron)] tracking-wide">⚠ {nameError}</p>}
            </div>

            <button id="name-submit-btn" type="submit" disabled={joining || username.trim().length < 4}
              className="inline-flex min-h-12 w-full items-center justify-center bg-amber-300 px-8 py-3 font-[family-name:var(--font-orbitron)] text-sm font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-amber-200 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed active:scale-[0.98]">
              {joining ? "Katılınıyor..." : "Bekleme Salonuna Gir →"}
            </button>

            <button type="button" onClick={() => { setStep("pin"); setPin(""); setPinError(""); }}
              className="text-xs text-slate-600 hover:text-slate-400 font-[family-name:var(--font-orbitron)] tracking-widest uppercase transition-colors">
              ← Farklı PIN Gir
            </button>
          </form>
        )}

        <a href="/admin" className="absolute bottom-5 right-5 text-[10px] text-slate-800 hover:text-slate-600 font-mono tracking-widest transition-colors">admin</a>
      </main>
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={null}>
      <LandingPageInner />
    </Suspense>
  );
}
