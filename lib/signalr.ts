// QuizETU — SignalR Hub Client
// Sadece client-side kullanım (typeof window !== "undefined" kontrolü)

import type { LeaderboardEntry } from "./api";

const HUB_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : "http://localhost:8080") + "/hubs/game";

// ─── Event payload tipleri ────────────────────────────────────────────────────

export type PlayerJoinedPayload = {
  nickname: string;
  playerCount: number;
};

export type NextQuestionPayload = {
  gamePin: string;
  questionId: string;
  questionIndex: number;
  totalQuestions: number;
  text: string;
  timeLimit: number;
  points: number;
  options: { id: string; text: string }[];
};

export type ShowCorrectAnswerPayload = {
  gamePin: string;
  questionId: string;
  correctOptionId: string;
  correctOptionText: string;
};

export type ShowLeaderboardPayload = {
  gamePin: string;
  roundIndex: number;
  top10: LeaderboardEntry[];
};

export type EndGamePayload = {
  gamePin: string;
  status: string;
  finalTop10: LeaderboardEntry[];
};

// ─── Hub event handler'ları ───────────────────────────────────────────────────

export type HubHandlers = {
  onPlayerJoined?: (payload: PlayerJoinedPayload) => void;
  onNextQuestion?: (payload: NextQuestionPayload) => void;
  onShowCorrectAnswer?: (payload: ShowCorrectAnswerPayload) => void;
  onShowLeaderboard?: (payload: ShowLeaderboardPayload) => void;
  onEndGame?: (payload: EndGamePayload) => void;
};

// ─── Hub bağlantısı oluştur ve başlat ────────────────────────────────────────

export async function createAndStartHub(
  token: string,
  gamePin: string,
  handlers: HubHandlers
): Promise<() => Promise<void>> {
  // Dynamic import — SSR sırasında yüklenmez
  const { HubConnectionBuilder, LogLevel } = await import("@microsoft/signalr");

  const connection = new HubConnectionBuilder()
    .withUrl(HUB_URL, { accessTokenFactory: () => token })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build();

  // Event kayıt
  if (handlers.onPlayerJoined)
    connection.on("PlayerJoined", handlers.onPlayerJoined);
  if (handlers.onNextQuestion)
    connection.on("NextQuestion", handlers.onNextQuestion);
  if (handlers.onShowCorrectAnswer)
    connection.on("ShowCorrectAnswer", handlers.onShowCorrectAnswer);
  if (handlers.onShowLeaderboard)
    connection.on("ShowLeaderboard", handlers.onShowLeaderboard);
  if (handlers.onEndGame)
    connection.on("EndGame", handlers.onEndGame);

  await connection.start();
  await connection.invoke("JoinGameGroup", gamePin);

  // Bağlantıyı kapat fonksiyonu döndür
  return async () => {
    await connection.stop();
  };
}
