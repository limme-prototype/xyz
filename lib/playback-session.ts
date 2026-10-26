export interface PlaybackSession {
  id: number;
  videoId: string;
  attempt: number;
  createdAt: number;
}

export function createPlaybackSession(videoId: string, attempt = 0): PlaybackSession {
  const normalizedAttempt = Number.isFinite(attempt) ? Math.max(0, Math.trunc(attempt)) : 0;
  return {
    id: normalizedAttempt,
    videoId,
    attempt: normalizedAttempt,
    createdAt: Date.now(),
  };
}

export function isPlaybackSessionCurrent(
  session: PlaybackSession | null | undefined,
  videoId: string,
  currentId?: number
): boolean {
  if (!session) return false;
  if (session.videoId !== videoId) return false;
  const activeId = currentId ?? session.id;
  return session.id === activeId;
}
