type ConversationRefSource = 'transcript' | 'store' | 'generated';

function normalizeConversationRef(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function shouldProjectSessionConversationRef(value: unknown): boolean {
  return Boolean(normalizeConversationRef(value));
}

export function resolveConversationRefForSend(
  transcriptConversationRef: unknown,
  storeConversationRef: unknown,
): {
  conversationRef: string | null;
  source: ConversationRefSource | null;
} {
  const normalizedTranscriptRef = normalizeConversationRef(transcriptConversationRef);
  if (normalizedTranscriptRef) {
    return {
      conversationRef: normalizedTranscriptRef,
      source: 'transcript',
    };
  }

  const normalizedStoreRef = normalizeConversationRef(storeConversationRef);
  if (normalizedStoreRef) {
    return {
      conversationRef: normalizedStoreRef,
      source: 'store',
    };
  }

  return {
    conversationRef: null,
    source: null,
  };
}

type MainSessionSnapshot = {
  conversationRef: string | null;
  userId: string | null;
};

export function normalizeMainSessionSnapshot(payload: unknown): MainSessionSnapshot {
  const source = (
    payload
    && typeof payload === 'object'
    && !Array.isArray(payload)
  ) ? payload as Record<string, unknown> : {};

  return {
    conversationRef: normalizeConversationRef(
      source.conversationRef ?? source.conversation_ref ?? source.sessionId ?? source.session_id,
    ),
    userId: normalizeConversationRef(
      source.userId ?? source.user_id,
    ),
  };
}

type SessionProjectionCallbacks = {
  setTranscriptConversationRef: (conversationRef: string) => void;
  setChatConversationRef: (conversationRef: string) => void;
  updateTranscriptSession: (conversationRef: string | null, userId: string | null) => void;
};

export function applyMainSessionSnapshot(
  snapshot: MainSessionSnapshot,
  callbacks: SessionProjectionCallbacks,
): MainSessionSnapshot {
  const {
    setTranscriptConversationRef,
    setChatConversationRef,
    updateTranscriptSession,
  } = callbacks;

  if (snapshot.conversationRef) {
    setTranscriptConversationRef(snapshot.conversationRef);
    setChatConversationRef(snapshot.conversationRef);
  }
  updateTranscriptSession(snapshot.conversationRef, snapshot.userId);
  return snapshot;
}
