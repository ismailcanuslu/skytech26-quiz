// QuizETU — Backend REST API Client

const PUBLIC_API_URL =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_URL?.trim() : "";
const BASE_URL = PUBLIC_API_URL ? PUBLIC_API_URL.replace(/\/+$/, "") : "";

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(0, "Network error");
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.message ?? body?.title ?? message;
    } catch {
      try {
        const text = (await res.text())?.trim();
        if (text) message = text;
      } catch {
        // ignore
      }
    }
    throw new ApiError(res.status, message);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(res.status, "Sunucudan gecersiz JSON yaniti dondu.");
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// ─── 2.1 Admin Login ──────────────────────────────────────────────────────────

export type AdminLoginResponse = {
  accessToken: string;
  expiresAtUtc: string;
};

export async function adminLogin(
  email: string,
  password: string
): Promise<AdminLoginResponse> {
  return apiFetch<AdminLoginResponse>("/api/auth/admin/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

// ─── 3.1 Oyun Başlatma ────────────────────────────────────────────────────────

export type StartGameResponse = { gamePin: string };

export async function startGame(
  quizId: string,
  adminToken: string
): Promise<StartGameResponse> {
  return apiFetch<StartGameResponse>("/api/gamesession/start", {
    method: "POST",
    headers: authHeader(adminToken),
    body: JSON.stringify({ quizId }),
  });
}

// ─── 3.2 Oyuncu Katılım ───────────────────────────────────────────────────────

export type JoinGameResponse = {
  gamePin: string;
  nickname: string;
  sessionId: string;
  accessToken: string;
  expiresAtUtc: string;
};

export async function joinGame(
  gamePin: string,
  nickname: string
): Promise<JoinGameResponse> {
  return apiFetch<JoinGameResponse>("/api/gamesession/join", {
    method: "POST",
    body: JSON.stringify({ gamePin, nickname }),
  });
}

// ─── 3.3 Sonraki Soru ────────────────────────────────────────────────────────

export type NextQuestionResponse = {
  gamePin: string;
  questionId: string;
  questionIndex: number;
  text: string;
  timeLimit: number;
  points: number;
  options: { id: string; text: string }[];
};

export async function nextQuestion(
  gamePin: string,
  adminToken: string
): Promise<NextQuestionResponse> {
  return apiFetch<NextQuestionResponse>(
    `/api/gamesession/${gamePin}/next-question`,
    { method: "POST", headers: authHeader(adminToken) }
  );
}

// ─── 3.4 Cevap Gönderme ──────────────────────────────────────────────────────

export type SubmitAnswerResponse = { accepted: boolean };

export async function submitAnswer(
  gamePin: string,
  selectedOptionId: string,
  elapsedMilliseconds: number,
  playerToken: string
): Promise<SubmitAnswerResponse> {
  return apiFetch<SubmitAnswerResponse>(
    `/api/gamesession/${gamePin}/submit-answer`,
    {
      method: "POST",
      headers: authHeader(playerToken),
      body: JSON.stringify({ selectedOptionId, elapsedMilliseconds }),
    }
  );
}

// ─── 3.5 Doğru Cevap Göster (manuel) ─────────────────────────────────────────

export type ShowCorrectAnswerResponse = {
  gamePin: string;
  questionId: string;
  correctOptionId: string;
  correctOptionText: string;
};

export async function showCorrectAnswer(
  gamePin: string,
  adminToken: string
): Promise<ShowCorrectAnswerResponse> {
  return apiFetch<ShowCorrectAnswerResponse>(
    `/api/gamesession/${gamePin}/show-correct-answer`,
    { method: "POST", headers: authHeader(adminToken) }
  );
}

// ─── 3.6 Leaderboard (manuel) ────────────────────────────────────────────────

export type LeaderboardEntry = {
  sessionId: string;
  nickname: string;
  totalScore: number;
  roundBasePoints: number;
  roundBonusPoints: number;
  roundTotalPoints: number;
};

export type ShowLeaderboardResponse = {
  gamePin: string;
  roundIndex: number;
  top10: LeaderboardEntry[];
};

export async function showLeaderboard(
  gamePin: string,
  adminToken: string
): Promise<ShowLeaderboardResponse> {
  return apiFetch<ShowLeaderboardResponse>(
    `/api/gamesession/${gamePin}/show-leaderboard`,
    { method: "POST", headers: authHeader(adminToken) }
  );
}

// ─── 3.7 Oyunu Bitir ─────────────────────────────────────────────────────────

export type EndGameResponse = {
  gamePin: string;
  status: string;
  finalTop10: LeaderboardEntry[];
};

/** Alias: SignalR EndGame event ile aynı tip */
export type EndGamePayload = EndGameResponse;


export async function endGame(
  gamePin: string,
  adminToken: string
): Promise<EndGameResponse> {
  return apiFetch<EndGameResponse>(
    `/api/gamesession/${gamePin}/end`,
    { method: "POST", headers: authHeader(adminToken) }
  );
}

// ─── 3.0 Quiz CRUD (Admin) ────────────────────────────────────────────────────

/** Backend'den gelen soru seçeneği */
export type ApiQuizOption = {
  id: string;
  text: string;
  isCorrect: boolean;
};

/** Backend'den gelen soru */
export type ApiQuestion = {
  id: string;
  order: number;
  text: string;
  timeLimit: number;
  points: number;
  options: ApiQuizOption[];
};

export type QuestionOptionInput = {
  id: string;
  text: string;
  isCorrect: boolean;
};

type ApiQuestionWire = {
  id: string;
  order?: number;
  text: string;
  timeLimit: number;
  points: number;
  answerOptions?: ApiQuizOption[];
  options?: ApiQuizOption[];
};

/** Quiz özet (liste için) */
export type ApiQuizSummary = {
  id: string;
  title: string;
  description?: string;
  questionCount: number;
  isActive: boolean;
  createdAt: string;
};

/** Quiz detay (editör için, sorular dahil) */
export type ApiQuizDetail = ApiQuizSummary & {
  questions: ApiQuestion[];
};

type ApiQuizDetailWire = Omit<ApiQuizDetail, "questions"> & {
  questions: ApiQuestionWire[];
};

/** Quiz oluşturma / güncelleme request body */
export type UpsertQuizBody = {
  title: string;
  description?: string;
};

/** Soru oluşturma request body */
export type CreateQuestionBody = {
  text: string;
  timeLimit: number;
  points?: number;
  options: QuestionOptionInput[];
};

/** Soru güncelleme request body */
export type UpdateQuestionBody = {
  text: string;
  timeLimit: number;
  points?: number;
  options: QuestionOptionInput[];
};

type UpsertQuestionWireBody = {
  text: string;
  timeLimit: number;
  points?: number;
  answerOptions: { id: string; text: string; isCorrect: boolean }[];
};

function mapQuestionFromApi(question: ApiQuestionWire): ApiQuestion {
  return {
    id: question.id,
    order: question.order ?? 0,
    text: question.text,
    timeLimit: question.timeLimit,
    points: question.points,
    options: question.answerOptions ?? question.options ?? [],
  };
}

function mapQuizDetailFromApi(quiz: ApiQuizDetailWire): ApiQuizDetail {
  return {
    ...quiz,
    questions: (quiz.questions ?? []).map(mapQuestionFromApi),
  };
}

function mapQuestionToApi(
  body: CreateQuestionBody | UpdateQuestionBody
): UpsertQuestionWireBody {
  return {
    text: body.text,
    timeLimit: body.timeLimit,
    points: body.points,
    answerOptions: body.options,
  };
}

// ── Quiz List ──────────────────────────────────────────────────────────────────

export async function getQuizzes(
  adminToken: string
): Promise<ApiQuizSummary[]> {
  return apiFetch<ApiQuizSummary[]>("/api/admin/quizzes", {
    headers: authHeader(adminToken),
  });
}

// ── Quiz Detay ─────────────────────────────────────────────────────────────────

export async function getQuizDetail(
  id: string,
  adminToken: string
): Promise<ApiQuizDetail> {
  const quiz = await apiFetch<ApiQuizDetailWire>(`/api/admin/quizzes/${id}`, {
    headers: authHeader(adminToken),
  });
  return mapQuizDetailFromApi(quiz);
}

// ── Quiz Oluştur ───────────────────────────────────────────────────────────────

export async function createQuiz(
  body: UpsertQuizBody,
  adminToken: string
): Promise<ApiQuizDetail> {
  const quiz = await apiFetch<ApiQuizDetailWire>("/api/admin/quizzes", {
    method: "POST",
    headers: authHeader(adminToken),
    body: JSON.stringify(body),
  });
  return mapQuizDetailFromApi(quiz);
}

// ── Quiz Güncelle ──────────────────────────────────────────────────────────────

export async function updateQuiz(
  id: string,
  body: UpsertQuizBody,
  adminToken: string
): Promise<ApiQuizDetail> {
  const quiz = await apiFetch<ApiQuizDetailWire>(`/api/admin/quizzes/${id}`, {
    method: "PUT",
    headers: authHeader(adminToken),
    body: JSON.stringify(body),
  });
  return mapQuizDetailFromApi(quiz);
}

// ── Quiz Sil (pasif yap) ───────────────────────────────────────────────────────

export async function deleteQuiz(
  id: string,
  adminToken: string
): Promise<void> {
  return apiFetch<void>(`/api/admin/quizzes/${id}`, {
    method: "DELETE",
    headers: authHeader(adminToken),
  });
}

// ── Soru Ekle ─────────────────────────────────────────────────────────────────

export async function addQuestion(
  quizId: string,
  body: CreateQuestionBody,
  adminToken: string
): Promise<ApiQuestion> {
  const question = await apiFetch<ApiQuestionWire>(
    `/api/admin/quizzes/${quizId}/questions`,
    {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify(mapQuestionToApi(body)),
    }
  );
  return mapQuestionFromApi(question);
}

// ── Soru Güncelle ─────────────────────────────────────────────────────────────

export async function updateQuestion(
  quizId: string,
  questionId: string,
  body: UpdateQuestionBody,
  adminToken: string
): Promise<ApiQuestion> {
  const question = await apiFetch<ApiQuestionWire>(
    `/api/admin/quizzes/${quizId}/questions/${questionId}`,
    {
      method: "PUT",
      headers: authHeader(adminToken),
      body: JSON.stringify(mapQuestionToApi(body)),
    }
  );
  return mapQuestionFromApi(question);
}

// ── Soru Sil ──────────────────────────────────────────────────────────────────

export async function deleteQuestion(
  quizId: string,
  questionId: string,
  adminToken: string
): Promise<void> {
  return apiFetch<void>(
    `/api/admin/quizzes/${quizId}/questions/${questionId}`,
    {
      method: "DELETE",
      headers: authHeader(adminToken),
    }
  );
}

export async function reorderQuestions(
  quizId: string,
  questionIds: string[],
  adminToken: string
): Promise<void> {
  return apiFetch<void>(`/api/admin/quizzes/${quizId}/questions/reorder`, {
    method: "POST",
    headers: authHeader(adminToken),
    body: JSON.stringify({ questionIds }),
  });
}

export async function banPlayer(
  gamePin: string,
  nickname: string,
  adminToken: string
): Promise<void> {
  return apiFetch<void>(`/api/gamesession/${gamePin}/ban-player`, {
    method: "POST",
    headers: authHeader(adminToken),
    body: JSON.stringify({ nickname }),
  });
}
