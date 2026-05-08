// QuizETU — SignalR Hub Client
// Sadece client-side kullanım (typeof window !== "undefined" kontrolü)

import type { LeaderboardEntry } from "./api";

const PUBLIC_API_URL =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_URL?.trim() : "";
const API_BASE_URL = PUBLIC_API_URL ? PUBLIC_API_URL.replace(/\/+$/, "") : "";
const HUB_URL = `${API_BASE_URL}/hubs/game`;

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
  startedAtUtc: string;
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

export type LobbySnapshotPayload = {
  gamePin: string;
  players: string[];
  playerCount: number;
  status: string;
  currentQuestion?: NextQuestionPayload;
};

export type PlayerRemovedPayload = {
  gamePin: string;
  nickname: string;
  playerCount: number;
};

// ─── Hub event handler'ları ───────────────────────────────────────────────────

export type HubHandlers = {
  onPlayerJoined?: (payload: PlayerJoinedPayload) => void;
  onLobbySnapshot?: (payload: LobbySnapshotPayload) => void;
  onConnectionIssue?: (isStuck: boolean) => void;
  onPlayerRemoved?: (payload: PlayerRemovedPayload) => void;
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
  const tryLoadLobbySnapshot = async () => {
    if (!handlers.onLobbySnapshot) return;
    try {
      const snapshot = await connection.invoke<LobbySnapshotPayload>(
        "GetLobbySnapshot",
        gamePin
      );
      handlers.onLobbySnapshot(snapshot);
    } catch (error) {
      // Eski backend versiyonunda method olmayabilir; baglantiyi bozmayalim.
      console.warn("Lobby snapshot alinamadi:", error);
    }
  };

  // Dynamic import — SSR sırasında yüklenmez
  const { HubConnectionBuilder, LogLevel } = await import("@microsoft/signalr");

  const connection = new HubConnectionBuilder()
    .withUrl(HUB_URL, { accessTokenFactory: () => token })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build();

  let reconnectWarningTimer: ReturnType<typeof setTimeout> | null = null;
  const clearReconnectWarning = () => {
    if (reconnectWarningTimer) {
      clearTimeout(reconnectWarningTimer);
      reconnectWarningTimer = null;
    }
    handlers.onConnectionIssue?.(false);
  };

  const armReconnectWarning = () => {
    if (reconnectWarningTimer) return;
    reconnectWarningTimer = setTimeout(() => {
      handlers.onConnectionIssue?.(true);
    }, 30000);
  };

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
  if (handlers.onPlayerRemoved)
    connection.on("PlayerRemoved", handlers.onPlayerRemoved);

  connection.onreconnecting(() => {
    armReconnectWarning();
  });

  connection.onreconnected(async () => {
    clearReconnectWarning();
    try {
      await connection.invoke("JoinGameGroup", gamePin);
      await tryLoadLobbySnapshot();
    } catch {
      armReconnectWarning();
    }
  });

  connection.onclose(() => {
    armReconnectWarning();
  });

  await connection.start();
  clearReconnectWarning();
  await connection.invoke("JoinGameGroup", gamePin);
  await tryLoadLobbySnapshot();

  // Bağlantıyı kapat fonksiyonu döndür
  return async () => {
    clearReconnectWarning();
    await connection.stop();
  };
}
