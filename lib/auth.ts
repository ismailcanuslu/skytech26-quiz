// QuizETU — JWT Token Yönetimi

const ADMIN_TOKEN_KEY  = "quizetu:admin_token";
const PLAYER_TOKEN_KEY = "quizetu:player_token";
const PLAYER_META_KEY  = "quizetu:me";

// ─── Admin ────────────────────────────────────────────────────────────────────

export function saveAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  localStorage.setItem("quizetu:admin", "1"); // eski kontrol için
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function clearAdmin(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem("quizetu:admin");
}

// ─── Player ───────────────────────────────────────────────────────────────────

export type PlayerMeta = {
  id: string;       // sessionId (backend'den)
  name: string;     // nickname
  code: string;     // gamePin
};

export function savePlayerToken(token: string): void {
  localStorage.setItem(PLAYER_TOKEN_KEY, token);
}

export function getPlayerToken(): string | null {
  return localStorage.getItem(PLAYER_TOKEN_KEY);
}

export function savePlayerMeta(meta: PlayerMeta): void {
  localStorage.setItem(PLAYER_META_KEY, JSON.stringify(meta));
}

export function getPlayerMeta(): PlayerMeta | null {
  try {
    const raw = localStorage.getItem(PLAYER_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPlayer(): void {
  localStorage.removeItem(PLAYER_TOKEN_KEY);
  localStorage.removeItem(PLAYER_META_KEY);
}

// ─── Mevcut soru seçeneklerini sakla (optionId lookup için) ──────────────────

export type StoredOption = { id: string; text: string };

export function saveCurrentOptions(options: StoredOption[]): void {
  sessionStorage.setItem("quizetu:current_options", JSON.stringify(options));
}

export function getCurrentOptions(): StoredOption[] {
  try {
    const raw = sessionStorage.getItem("quizetu:current_options");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
