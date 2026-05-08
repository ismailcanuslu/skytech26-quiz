"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminLogin, ApiError } from "@/lib/api";
import { saveAdminToken } from "@/lib/auth";
import Image from "next/image";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await adminLogin(email.trim(), password);

      if (!res?.accessToken || typeof res.accessToken !== "string") {
        throw new Error("Login yanıtında accessToken bulunamadı.");
      }

      try {
        saveAdminToken(res.accessToken);
      } catch {
        throw new Error(
          "Tarayıcı depolamasına yazılamadı. Gizli mod/cookie ayarlarını kontrol et."
        );
      }

      router.push("/admin/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 0) {
          setError("Sunucuya ulaşılamadı. CORS veya API URL ayarını kontrol et.");
          return;
        }
        setError(
          err.status === 401
            ? "E-posta veya şifre hatalı."
            : `Hata ${err.status}: ${err.message}`
        );
      } else if (err instanceof SyntaxError) {
        setError("Backend yanıtı okunamadı. JSON response formatını kontrol et.");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Sunucuya ulaşılamadı. Backend çalışıyor mu?");
      }
    } finally {
      setLoading(false);
    }
  }

  const BG = (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden
      style={{
        backgroundImage:
          "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.22), transparent)," +
          "radial-gradient(ellipse 70% 40% at 100% 60%, rgba(251,191,36,0.10), transparent)," +
          "linear-gradient(rgba(148,163,184,0.18) 1px, transparent 1px)," +
          "linear-gradient(90deg, rgba(148,163,184,0.18) 1px, transparent 1px)",
        backgroundSize: "100% 100%, 100% 100%, 44px 44px, 44px 44px",
      }}
    />
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030712] text-slate-100 flex items-center justify-center">
      {BG}
      <div className="relative z-10 w-full max-w-sm px-6">
        <div className="flex flex-col items-center mb-8">
          <Image src="/favicon.webp" alt="ETÜBMT" width={56} height={56} className="mb-4" />
          <a href="/" className="text-[10px] font-[family-name:var(--font-orbitron)] tracking-[0.28em] text-cyan-400/40 hover:text-cyan-400/70 transition-colors uppercase mb-4">
            ← Ana Sayfa
          </a>
          <h1 className="font-[family-name:var(--font-orbitron)] text-2xl font-bold text-white tracking-wide">
            Admin Girişi
          </h1>
          <p className="text-[10px] text-slate-600 font-mono mt-1">
            admin@kahoot.local
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-slate-900/70 px-6 py-8 flex flex-col gap-5"
          style={{ boxShadow: "0 0 32px rgba(251,191,36,0.08) inset", borderLeft: "2px solid rgba(251,191,36,0.25)" }}
        >
          <div>
            <label className="block text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-amber-300/70 mb-2" htmlFor="admin-email">
              E-posta
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              className="w-full bg-slate-800/60 border border-slate-700/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-400/50 transition-colors font-mono"
              placeholder="admin@kahoot.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-amber-300/70 mb-2" htmlFor="admin-password">
              Şifre
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              className="w-full bg-slate-800/60 border border-slate-700/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-400/50 transition-colors"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 font-mono bg-red-500/10 border border-red-500/30 px-3 py-2">
              ⚠ {error}
            </p>
          )}

          <button
            id="admin-login-submit"
            type="submit"
            disabled={loading}
            className="inline-flex min-h-12 items-center justify-center bg-amber-300 px-8 py-3 font-[family-name:var(--font-orbitron)] text-sm font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-amber-200 disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {loading ? "Giriş yapılıyor..." : "GİRİŞ →"}
          </button>
        </form>
      </div>
    </div>
  );
}
