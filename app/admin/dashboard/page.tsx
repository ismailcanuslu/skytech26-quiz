"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getQuizzes,
  createQuiz,
  deleteQuiz,
  ApiError,
  type ApiQuizSummary,
} from "@/lib/api";
import { getAdminToken, clearAdmin } from "@/lib/auth";

export default function AdminDashboard() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<ApiQuizSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newQuizTitle, setNewQuizTitle] = useState("");
  const [newQuizDescription, setNewQuizDescription] = useState("");

  async function load(token: string) {
    setLoading(true);
    setError("");
    try {
      setQuizzes(await getQuizzes(token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAdmin(); router.push("/admin"); return;
      }
      setError(err instanceof ApiError ? err.message : "Quizler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = getAdminToken();
    if (!token) { router.push("/admin"); return; }
    load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleNew() {
    setNewQuizTitle("");
    setNewQuizDescription("");
    setError("");
    setIsCreateModalOpen(true);
  }

  async function handleCreateQuiz(e: React.FormEvent) {
    e.preventDefault();
    const token = getAdminToken();
    if (!token) return;
    const title = newQuizTitle.trim();
    if (!title) {
      setError("Quiz adı zorunlu.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const quiz = await createQuiz(
        { title, description: newQuizDescription.trim() },
        token
      );
      setIsCreateModalOpen(false);
      router.push(`/admin/quiz/${quiz.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Quiz oluşturulamadı.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu quiz'i silmek istiyor musun?")) return;
    const token = getAdminToken();
    if (!token) return;
    try {
      await deleteQuiz(id, token);
      setQuizzes((prev) => prev.filter((q) => q.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Silinemedi.");
    }
  }

  const BG = (
    <div className="pointer-events-none absolute inset-0" aria-hidden style={{
      backgroundImage:
        "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.18), transparent)," +
        "linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px)," +
        "linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
      backgroundSize: "100% 100%, 44px 44px, 44px 44px",
    }} />
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030712] text-slate-100">
      {BG}

      {/* Sidebar */}
      <div className="fixed top-0 left-0 bottom-0 w-52 bg-[#030712]/98 border-r border-slate-800/60 flex flex-col z-40">
        <div className="p-5 border-b border-slate-800/60">
          <div className="font-[family-name:var(--font-orbitron)] text-base font-bold text-cyan-400">QuizETU</div>
          <p className="text-[10px] text-slate-600 font-mono mt-0.5">Admin Paneli</p>
        </div>
        <nav className="flex flex-col gap-1 p-3 flex-1">
          <a href="/admin/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.14em] text-cyan-400 border-l-2 border-cyan-400 bg-cyan-400/5">
            📋 Quizlerim
          </a>
          <a href="/"
            className="flex items-center gap-2 px-3 py-2 text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.14em] text-slate-500 hover:text-cyan-400 transition-colors border-l-2 border-transparent hover:border-cyan-400">
            🏠 Ana Sayfa
          </a>
        </nav>
        <div className="p-4 border-t border-slate-800/40">
          <button onClick={() => { clearAdmin(); router.push("/admin"); }}
            className="w-full text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-widest text-slate-600 hover:text-slate-400 transition-colors py-2">
            Çıkış
          </button>
        </div>
      </div>

      <main className="ml-52 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-[family-name:var(--font-orbitron)] text-2xl font-bold text-cyan-400 tracking-wide">Quizlerim</h1>
            <p className="text-sm text-slate-500 mt-1 font-mono">{loading ? "yükleniyor..." : `${quizzes.length} quiz`}</p>
          </div>
          <button id="new-quiz-btn" onClick={handleNew} disabled={creating}
            className="inline-flex min-h-10 items-center gap-2 bg-amber-300 px-6 py-2.5 font-[family-name:var(--font-orbitron)] text-xs font-semibold uppercase tracking-[0.2em] text-slate-950 hover:bg-amber-200 disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed transition">
            + Yeni Quiz
          </button>
        </div>

        {error && (
          <p className="mb-6 text-xs text-red-400 font-mono bg-red-500/10 border border-red-500/30 px-4 py-2">⚠ {error}</p>
        )}

        {loading ? (
          <div className="flex items-center gap-3 text-slate-600">
            <svg width="20" height="20" viewBox="0 0 36 36" fill="none" style={{ animation: "spin 1.2s linear infinite" }}>
              <circle cx="18" cy="18" r="15" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
              <circle cx="18" cy="18" r="15" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" strokeDasharray="60 34" />
            </svg>
            <span className="font-[family-name:var(--font-orbitron)] text-xs uppercase tracking-widest text-slate-600">Yükleniyor...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {quizzes.map((quiz) => (
              <div key={quiz.id} className="bg-slate-900/70 p-6 flex flex-col gap-4 relative" style={{ borderLeft: "2px solid rgba(34,211,238,0.2)" }}>
                {!quiz.isActive && (
                  <span className="absolute top-3 right-3 text-[9px] font-[family-name:var(--font-orbitron)] uppercase tracking-widest text-slate-600 border border-slate-700/50 px-1.5 py-0.5">
                    pasif
                  </span>
                )}
                <div>
                  <h3 className="font-semibold text-slate-100 text-base truncate">{quiz.title}</h3>
                  {quiz.description && <p className="text-xs text-slate-600 mt-0.5 truncate">{quiz.description}</p>}
                  <p className="text-xs text-slate-500 mt-1 font-mono">{quiz.questionCount} soru</p>
                </div>
                <div className="flex gap-2 mt-auto">
                  <button id={`edit-quiz-${quiz.id}`} onClick={() => router.push(`/admin/quiz/${quiz.id}`)}
                    className="flex-1 text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.16em] px-3 py-2 border border-slate-700/60 text-slate-400 hover:border-cyan-400/40 hover:text-cyan-400 transition">
                    Düzenle
                  </button>
                  <button id={`host-quiz-${quiz.id}`} onClick={() => router.push(`/admin/host/${quiz.id}`)}
                    className="flex-1 text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.16em] px-3 py-2 bg-amber-300 text-slate-950 hover:bg-amber-200 transition font-semibold">
                    ▶ Başlat
                  </button>
                  <button onClick={() => handleDelete(quiz.id)}
                    className="text-[10px] px-3 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 transition"
                    title="Sil">
                    🗑
                  </button>
                </div>
              </div>
            ))}

            {quizzes.length === 0 && !loading && (
              <div className="col-span-full text-center py-16 text-slate-600 font-mono text-sm">
                Henüz quiz yok. &quot;Yeni Quiz&quot; ile başla.
              </div>
            )}
          </div>
        )}
      </main>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4">
          <form
            onSubmit={handleCreateQuiz}
            className="w-full max-w-lg bg-slate-900 border border-slate-700/70 p-6 flex flex-col gap-4"
          >
            <h2 className="font-[family-name:var(--font-orbitron)] text-lg text-cyan-400 tracking-wide">
              Yeni Quiz Oluştur
            </h2>
            <div>
              <label
                htmlFor="new-quiz-title"
                className="block text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-amber-300/80 mb-2"
              >
                Quiz Adı
              </label>
              <input
                id="new-quiz-title"
                type="text"
                value={newQuizTitle}
                onChange={(e) => setNewQuizTitle(e.target.value)}
                className="w-full bg-slate-800/70 border border-slate-700/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50 transition-colors"
                placeholder="Orn. Genel Kultur"
                autoFocus
              />
            </div>
            <div>
              <label
                htmlFor="new-quiz-description"
                className="block text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-amber-300/80 mb-2"
              >
                Açıklama
              </label>
              <textarea
                id="new-quiz-description"
                value={newQuizDescription}
                onChange={(e) => setNewQuizDescription(e.target.value)}
                className="w-full min-h-24 resize-y bg-slate-800/70 border border-slate-700/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50 transition-colors"
                placeholder="Quiz hakkında kısa bir açıklama"
              />
            </div>
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                disabled={creating}
                className="px-4 py-2 text-xs font-[family-name:var(--font-orbitron)] uppercase tracking-[0.16em] border border-slate-700/60 text-slate-300 hover:border-slate-500 disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 text-xs font-[family-name:var(--font-orbitron)] uppercase tracking-[0.16em] bg-amber-300 text-slate-950 hover:bg-amber-200 disabled:bg-slate-600 disabled:text-slate-300"
              >
                {creating ? "Oluşturuluyor..." : "Oluştur"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
