// QuizETU — JWT Token Yönetimi

const ADMIN_TOKEN_KEY  = "quizetu:admin_token";
const PLAYER_TOKEN_KEY = "quizetu:player_token";
const PLAYER_META_KEY  = "quizetu:me";
const isBrowser = typeof window !== "undefined";
const COOKIE_PATH = "path=/; SameSite=Lax";
const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 gun

function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (!isBrowser) return;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
    value
  )}; max-age=${maxAgeSeconds}; ${COOKIE_PATH}`;
}

function getCookie(name: string): string | null {
  if (!isBrowser) return null;
  const encodedName = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split("; ");
  for (const part of parts) {
    if (part.startsWith(encodedName)) {
      return decodeURIComponent(part.slice(encodedName.length));
    }
  }
  return null;
}

function deleteCookie(name: string): void {
  if (!isBrowser) return;
  document.cookie = `${encodeURIComponent(name)}=; max-age=0; ${COOKIE_PATH}`;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export function saveAdminToken(token: string): void {
  if (!isBrowser) return;
  setCookie(ADMIN_TOKEN_KEY, token, TOKEN_MAX_AGE_SECONDS);
  setCookie("quizetu:admin", "1", TOKEN_MAX_AGE_SECONDS); // eski kontrol için
}

export function getAdminToken(): string | null {
  return getCookie(ADMIN_TOKEN_KEY);
}

export function clearAdmin(): void {
  if (!isBrowser) return;
  deleteCookie(ADMIN_TOKEN_KEY);
  deleteCookie("quizetu:admin");
}

// ─── Player ───────────────────────────────────────────────────────────────────

export type PlayerMeta = {
  id: string;       // sessionId (backend'den)
  name: string;     // nickname
  code: string;     // gamePin
};

export function savePlayerToken(token: string): void {
  if (!isBrowser) return;
  // Oyuncu oturumu tab-bazli olmalidir (ayni tarayicida coklu oyuncu desteği).
  sessionStorage.setItem(PLAYER_TOKEN_KEY, token);
}

export function getPlayerToken(): string | null {
  if (!isBrowser) return null;
  return sessionStorage.getItem(PLAYER_TOKEN_KEY);
}

export function savePlayerMeta(meta: PlayerMeta): void {
  if (!isBrowser) return;
  sessionStorage.setItem(PLAYER_META_KEY, JSON.stringify(meta));
}

export function getPlayerMeta(): PlayerMeta | null {
  if (!isBrowser) return null;
  try {
    const raw = sessionStorage.getItem(PLAYER_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPlayer(): void {
  if (!isBrowser) return;
  sessionStorage.removeItem(PLAYER_TOKEN_KEY);
  sessionStorage.removeItem(PLAYER_META_KEY);
}

// ─── Mevcut soru seçeneklerini sakla (optionId lookup için) ──────────────────

export type StoredOption = { id: string; text: string };

export function saveCurrentOptions(options: StoredOption[]): void {
  if (!isBrowser) return;
  sessionStorage.setItem("quizetu:current_options", JSON.stringify(options));
}

export function getCurrentOptions(): StoredOption[] {
  if (!isBrowser) return [];
  try {
    const raw = sessionStorage.getItem("quizetu:current_options");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
