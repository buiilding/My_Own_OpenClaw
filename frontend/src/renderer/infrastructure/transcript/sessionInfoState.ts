import type { SessionInfo } from './types';

type ReadSessionInfo = () => SessionInfo;

export type TranscriptSessionState = {
  get: () => SessionInfo;
  resolve: (override?: Partial<SessionInfo>) => SessionInfo;
  update: (conversationRef?: string | null, userId?: string | null) => SessionInfo;
};

export function createTranscriptSessionState(readStoredSessionInfo: ReadSessionInfo): TranscriptSessionState {
  let currentConversationRef: string | null = null;
  let currentUserId: string | null = null;

  const ensureLoaded = () => {
    if (currentConversationRef || currentUserId) {
      return;
    }

    const stored = readStoredSessionInfo();
    currentConversationRef = stored.conversationRef;
    currentUserId = stored.userId;
  };

  const get = (): SessionInfo => {
    ensureLoaded();
    return { conversationRef: currentConversationRef, userId: currentUserId };
  };

  const resolve = (override?: Partial<SessionInfo>): SessionInfo => {
    const current = get();
    return {
      conversationRef: override?.conversationRef ?? current.conversationRef,
      userId: override?.userId ?? current.userId,
    };
  };

  const update = (conversationRef?: string | null, userId?: string | null): SessionInfo => {
    ensureLoaded();

    const nextConversationRef = conversationRef === undefined
      ? currentConversationRef
      : conversationRef;
    const nextUserId = userId || currentUserId;

    currentConversationRef = nextConversationRef;

    if (nextUserId) {
      currentUserId = nextUserId;
    }

    return { conversationRef: currentConversationRef, userId: currentUserId };
  };

  return {
    get,
    resolve,
    update,
  };
}
