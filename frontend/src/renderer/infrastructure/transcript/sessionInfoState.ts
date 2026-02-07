import type { SessionInfo } from './types';

type ReadSessionInfo = () => SessionInfo;

export type TranscriptSessionState = {
  get: () => SessionInfo;
  resolve: (override?: Partial<SessionInfo>) => SessionInfo;
  update: (sessionId?: string | null, userId?: string | null) => SessionInfo;
};

export function createTranscriptSessionState(readStoredSessionInfo: ReadSessionInfo): TranscriptSessionState {
  let currentSessionId: string | null = null;
  let currentUserId: string | null = null;

  const ensureLoaded = () => {
    if (currentSessionId || currentUserId) {
      return;
    }

    const stored = readStoredSessionInfo();
    currentSessionId = stored.sessionId;
    currentUserId = stored.userId;
  };

  const get = (): SessionInfo => {
    ensureLoaded();
    return { sessionId: currentSessionId, userId: currentUserId };
  };

  const resolve = (override?: Partial<SessionInfo>): SessionInfo => {
    const current = get();
    return {
      sessionId: override?.sessionId ?? current.sessionId,
      userId: override?.userId ?? current.userId,
    };
  };

  const update = (sessionId?: string | null, userId?: string | null): SessionInfo => {
    ensureLoaded();

    const nextSessionId = sessionId || currentSessionId;
    const nextUserId = userId || currentUserId;

    if (nextSessionId) {
      currentSessionId = nextSessionId;
    }

    if (nextUserId && !currentUserId) {
      currentUserId = nextUserId;
    }

    return { sessionId: currentSessionId, userId: currentUserId };
  };

  return {
    get,
    resolve,
    update,
  };
}
