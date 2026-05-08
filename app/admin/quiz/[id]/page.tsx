"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  getQuizDetail,
  updateQuiz,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  ApiError,
  type ApiQuizDetail,
  type ApiQuestion,
  type UpsertQuestionBody,
} from "@/lib/api";
import { getAdminToken } from "@/lib/auth";

const SYMBOLS = ["▲", "◆", "●", "★"] as const;
const OPT_COLORS = ["#22d3ee", "#fbbf24", "#e879f9", "#a3e635"];
const LABELS = ["A", "B", "C", "D"];

/** Boş soru template'i (local draft, henüz backend'e gönderilmedi) */
function emptyDraft(): UpsertQuestionBody {
  return {
    text: "",
    timeLimit: 20,
    points: 1000,
    options: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ],
  };
}

export default function QuizEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [quiz, setQuiz] = useState<ApiQuizDetail | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [error, setError] = useState("");
  // Yeni soru draft state'i
  const [draftQ, setDraftQ] = useState<UpsertQuestionBody | null>(null);
  const [addingQ, setAddingQ] = useState(false);
  // Inline editör için hangi soru düzenleniyor
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<UpsertQuestionBody | null>(null);
  const [saving, setSaving] = useState(false);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (token: string) => {
    try {
      const data = await getQuizDetail(params.id, token);
      setQuiz(data);
      setTitle(data.title);
      setDescription(data.description ?? "");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { router.push("/admin"); return; }
      setError(err instanceof ApiError ? err.message : "Quiz yüklenemedi.");
    }
  }, [params.id, router]);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) { router.push("/admin"); return; }
    load(token);
  }, [load, router]);

  // Başlık / açıklama otomatik kaydet (debounce)
  function handleTitleChange(val: string) {
    setTitle(val);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(async () => {
      const token = getAdminToken();
      if (!token || !quiz) return;
      setSaved("saving");
      try {
        await updateQuiz(quiz.id, { title: val, description }, token);
        setSaved("ok");
        setTimeout(() => setSaved("idle"), 2000);
      } catch { setSaved("err"); }
    }, 700);
  }

  function handleDescriptionChange(val: string) {
    setDescription(val);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(async () => {
      const token = getAdminToken();
      if (!token || !quiz) return;
      try { await updateQuiz(quiz.id, { title, description: val }, token); } catch { /* ignore */ }
    }, 700);
  }

  // Yeni soru kaydet
  async function handleAddQuestion() {
    if (!draftQ || !quiz) return;
    const token = getAdminToken();
    if (!token) return;
    const correctCount = draftQ.options.filter((o) => o.isCorrect).length;
    if (correctCount !== 1) { setError("Tam olarak 1 doğru cevap seçilmelidir."); return; }
    if (!draftQ.text.trim()) { setError("Soru metni boş olamaz."); return; }
    setAddingQ(true); setError("");
    try {
      const added = await addQuestion(quiz.id, draftQ, token);
      setQuiz((q) => q ? { ...q, questions: [...q.questions, added], questionCount: q.questionCount + 1 } : q);
      setDraftQ(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Soru eklenemedi.");
    } finally { setAddingQ(false); }
  }

  // Mevcut soruyu güncelle
  async function handleUpdateQuestion(q: ApiQuestion) {
    if (!editDraft || !quiz) return;
    const token = getAdminToken();
    if (!token) return;
    const correctCount = editDraft.options.filter((o) => o.isCorrect).length;
    if (correctCount !== 1) { setError("Tam olarak 1 doğru cevap seçilmelidir."); return; }
    setSaving(true); setError("");
    try {
      const updated = await updateQuestion(quiz.id, q.id, editDraft, token);
      setQuiz((prev) => prev ? { ...prev, questions: prev.questions.map((x) => x.id === q.id ? updated : x) } : prev);
      setEditingId(null);
      setEditDraft(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Soru güncellenemedi.");
    } finally { setSaving(false); }
  }

  // Soru sil
  async function handleDeleteQuestion(qId: string) {
    if (!confirm("Bu soruyu silmek istiyor musun?") || !quiz) return;
    const token = getAdminToken();
    if (!token) return;
    try {
      await deleteQuestion(quiz.id, qId, token);
      setQuiz((prev) => prev ? { ...prev, questions: prev.questions.filter((x) => x.id !== qId), questionCount: prev.questionCount - 1 } : prev);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Soru silinemedi.");
    }
  }

  // ── Option helpers ──────────────────────────────────────────────────────────

  function setDraftOption(draft: UpsertQuestionBody, idx: number, text: string): UpsertQuestionBody {
    const options = draft.options.map((o, i) => i === idx ? { ...o, text } : o);
    return { ...draft, options };
  }

  function setDraftCorrect(draft: UpsertQuestionBody, idx: number): UpsertQuestionBody {
    const options = draft.options.map((o, i) => ({ ...o, isCorrect: i === idx }));
    return { ...draft, options };
  }

  const BG = (
    <div className="pointer-events-none absolute inset-0" aria-hidden style={{
      backgroundImage: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.18), transparent),linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px),linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
      backgroundSize: "100% 100%, 44px 44px, 44px 44px",
    }} />
  );

  if (!quiz) return (
    <div className="relative flex items-center justify-center min-h-screen bg-[#030712]">
      {BG}
      <p className="relative z-10 text-cyan-400/50 font-mono animate-pulse text-sm">Yükleniyor...</p>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030712] text-slate-100">
      {BG}

      {/* Sidebar */}
      <div className="fixed top-0 left-0 bottom-0 w-52 bg-[#030712]/98 border-r border-slate-800/60 flex flex-col z-40">
        <div className="p-5 border-b border-slate-800/60">
          <div className="font-[family-name:var(--font-orbitron)] text-base font-bold text-cyan-400">QuizETU</div>
          <p className="text-[10px] text-slate-600 font-mono mt-0.5">Soru Editörü</p>
        </div>
        <nav className="flex flex-col gap-1 p-3 flex-1">
          <a href="/admin/dashboard" className="flex items-center gap-2 px-3 py-2 text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.14em] text-slate-500 hover:text-cyan-400 transition-colors border-l-2 border-transparent hover:border-cyan-400">
            📋 Quizlerim
          </a>
        </nav>
      </div>

      <main className="ml-52 p-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div className="flex-1 flex flex-col gap-3">
            <div>
              <label className="block text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-cyan-400/60 mb-1.5">Quiz Başlığı</label>
              <input id="quiz-title"
                className="w-full bg-slate-800/60 border border-slate-700/50 px-4 py-2.5 text-lg font-semibold text-slate-100 outline-none focus:border-cyan-400/40 transition-colors"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.22em] text-cyan-400/60 mb-1.5">Açıklama (opsiyonel)</label>
              <input
                className="w-full bg-slate-800/60 border border-slate-700/50 px-4 py-2 text-sm text-slate-400 outline-none focus:border-cyan-400/40 transition-colors"
                value={description}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                placeholder="Kısa bir açıklama..."
              />
            </div>
          </div>
          <div className="flex gap-3 items-center shrink-0">
            {saved === "saving" && <span className="text-xs text-slate-500 font-mono">kaydediliyor...</span>}
            {saved === "ok" && <span className="text-xs text-lime-400 font-mono">✓ kaydedildi</span>}
            {saved === "err" && <span className="text-xs text-red-400 font-mono">⚠ hata</span>}
            <button id="add-question-btn" onClick={() => { setDraftQ(emptyDraft()); setEditingId(null); }}
              className="inline-flex min-h-10 items-center gap-1.5 bg-amber-300 px-5 py-2.5 font-[family-name:var(--font-orbitron)] text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 hover:bg-amber-200 transition">
              + Soru Ekle
            </button>
            <button onClick={() => router.push(`/admin/host/${quiz.id}`)}
              className="inline-flex min-h-10 items-center gap-1.5 bg-cyan-400 px-5 py-2.5 font-[family-name:var(--font-orbitron)] text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 hover:bg-cyan-300 transition">
              ▶ Başlat
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-4 text-xs text-red-400 font-mono bg-red-500/10 border border-red-500/30 px-4 py-2">⚠ {error}</p>
        )}

        {/* Yeni soru formu */}
        {draftQ && (
          <QuestionForm
            label="Yeni Soru"
            draft={draftQ}
            onChange={setDraftQ}
            onSetOption={(idx, text) => setDraftQ(setDraftOption(draftQ, idx, text))}
            onSetCorrect={(idx) => setDraftQ(setDraftCorrect(draftQ, idx))}
            onSave={handleAddQuestion}
            onCancel={() => setDraftQ(null)}
            saving={addingQ}
          />
        )}

        {/* Mevcut sorular */}
        <div className="flex flex-col gap-5">
          {quiz.questions.map((q, qIdx) => (
            <div key={q.id} className="bg-slate-900/70 p-6 flex flex-col gap-4" style={{ borderLeft: "2px solid rgba(34,211,238,0.15)" }}>
              {editingId === q.id && editDraft ? (
                <QuestionForm
                  label={`SORU ${qIdx + 1} — Düzenleniyor`}
                  draft={editDraft}
                  onChange={setEditDraft}
                  onSetOption={(idx, text) => setEditDraft(setDraftOption(editDraft, idx, text))}
                  onSetCorrect={(idx) => setEditDraft(setDraftCorrect(editDraft, idx))}
                  onSave={() => handleUpdateQuestion(q)}
                  onCancel={() => { setEditingId(null); setEditDraft(null); }}
                  saving={saving}
                />
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className="font-[family-name:var(--font-orbitron)] text-[10px] uppercase tracking-[0.2em] text-cyan-400/60">SORU {qIdx + 1}</span>
                    <span className="text-[10px] text-slate-600 font-mono ml-auto">{q.timeLimit}sn</span>
                    <button onClick={() => { setEditingId(q.id); setEditDraft({ text: q.text, timeLimit: q.timeLimit, points: q.points, options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) }); setDraftQ(null); }}
                      className="text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-widest px-3 py-1.5 border border-slate-700/50 text-slate-400 hover:border-cyan-400/30 hover:text-cyan-400 transition">
                      Düzenle
                    </button>
                    <button onClick={() => handleDeleteQuestion(q.id)}
                      className="text-[10px] px-2.5 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 transition">
                      🗑
                    </button>
                  </div>
                  <p className="text-base text-slate-100 font-semibold">{q.text || <span className="text-slate-600 italic">Soru metni yok</span>}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {q.options.map((opt, oIdx) => (
                      <div key={opt.id} className="flex items-center gap-2 px-3 py-2 border"
                        style={{ borderColor: opt.isCorrect ? `${OPT_COLORS[oIdx]}66` : "rgba(71,85,105,0.3)", background: opt.isCorrect ? `${OPT_COLORS[oIdx]}0d` : "rgba(15,23,42,0.5)" }}>
                        <span className="text-base" style={{ color: OPT_COLORS[oIdx] }}>{SYMBOLS[oIdx]}</span>
                        <span className="text-xs text-slate-300 flex-1">{opt.text}</span>
                        {opt.isCorrect && <span className="text-[9px] text-lime-400 font-[family-name:var(--font-orbitron)] tracking-widest">✓ DOĞRU</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}

          {quiz.questions.length === 0 && !draftQ && (
            <div className="bg-slate-900/50 p-12 text-center text-slate-600 font-mono text-sm">
              Henüz soru yok. &quot;Soru Ekle&quot; ile başla.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ── QuestionForm bileşeni ─────────────────────────────────────────────────────

type QuestionFormProps = {
  label: string;
  draft: UpsertQuestionBody;
  onChange: (d: UpsertQuestionBody) => void;
  onSetOption: (idx: number, text: string) => void;
  onSetCorrect: (idx: number) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
};

function QuestionForm({ label, draft, onChange, onSetOption, onSetCorrect, onSave, onCancel, saving }: QuestionFormProps) {
  return (
    <div className="bg-slate-900/80 p-6 mb-5 flex flex-col gap-4" style={{ borderLeft: "2px solid rgba(251,191,36,0.3)" }}>
      <p className="font-[family-name:var(--font-orbitron)] text-[10px] uppercase tracking-[0.22em] text-amber-300/70">{label}</p>

      <div>
        <label className="block text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.2em] text-cyan-400/60 mb-1.5">Soru Metni</label>
        <textarea
          className="w-full bg-slate-800/60 border border-slate-700/50 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-400/40 transition-colors resize-none"
          rows={2}
          placeholder="Soru metnini buraya yaz..."
          value={draft.text}
          onChange={(e) => onChange({ ...draft, text: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-[10px] font-[family-name:var(--font-orbitron)] uppercase tracking-[0.2em] text-cyan-400/60 mb-1.5">Süre</label>
        <select className="bg-slate-800/60 border border-slate-700/50 px-3 py-2 text-sm text-slate-300 outline-none focus:border-cyan-400/40"
          value={draft.timeLimit}
          onChange={(e) => onChange({ ...draft, timeLimit: Number(e.target.value) })}>
          {[10, 15, 20, 30, 45, 60].map((s) => <option key={s} value={s}>{s} saniye</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {draft.options.map((opt, oIdx) => (
          <div key={oIdx} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSetCorrect(oIdx)}
              className="w-8 h-8 flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 transition-all rounded-full"
              style={{
                borderColor: opt.isCorrect ? "#a3e635" : "rgba(34,211,238,0.3)",
                background: opt.isCorrect ? "rgba(163,230,53,0.15)" : "transparent",
                color: opt.isCorrect ? "#a3e635" : "#94a3b8",
              }}>
              {LABELS[oIdx]}
            </button>
            <input
              id={`q-opt-${oIdx}`}
              className="flex-1 bg-slate-800/60 border border-slate-700/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/30 transition-colors"
              style={{ color: OPT_COLORS[oIdx] }}
              placeholder={`${LABELS[oIdx]} şıkkı...`}
              value={opt.text}
              onChange={(e) => onSetOption(oIdx, e.target.value)}
            />
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-600">Doğru cevap için harf butonuna tıkla. Tam olarak 1 doğru olmalı.</p>

      <div className="flex gap-3">
        <button onClick={onSave} disabled={saving}
          className="inline-flex min-h-9 items-center gap-1.5 bg-lime-400 px-6 py-2 font-[family-name:var(--font-orbitron)] text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 hover:bg-lime-300 disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed transition">
          {saving ? "Kaydediliyor..." : "✓ Kaydet"}
        </button>
        <button onClick={onCancel} disabled={saving}
          className="inline-flex min-h-9 items-center px-4 py-2 font-[family-name:var(--font-orbitron)] text-xs uppercase tracking-widest text-slate-500 border border-slate-700/50 hover:text-slate-300 hover:border-slate-600 transition">
          İptal
        </button>
      </div>
    </div>
  );
}

