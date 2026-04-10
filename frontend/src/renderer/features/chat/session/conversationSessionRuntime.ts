type ConversationRefSource = 'transcript' | 'store' | 'generated';

type TranscriptSessionUpdater = (
  conversationRef?: string | null,
  userId?: string | null,
) => void;

export type MainSessionSnapshot = {
  conversationRef: string | null;
  userId: string | null;
};

export const EMPTY_MAIN_SESSION_SNAPSHOT: MainSessionSnapshot = Object.freeze({
  conversationRef: null,
  userId: null,
});

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

type RendererConversationSelectionOptions = {
  conversationRef: string | null;
  userId?: string | null;
  updateTranscriptSession: TranscriptSessionUpdater;
  setChatConversationRef?: ((conversationRef: string | null) => void) | null;
};

type HydrateMainSessionSnapshotOptions = SessionProjectionCallbacks & {
  loadMainSessionSnapshot: () => Promise<unknown>;
  markConversationInferenceSessionUnknown?: (conversationRef: string | null) => void;
  onError?: (error: unknown) => void;
};

type EnsureConversationRefForSendOptions = {
  transcriptConversationRef: unknown;
  storeConversationRef: unknown;
  setTranscriptConversationRef: (conversationRef: string) => void;
  setChatConversationRef: (conversationRef: string) => void;
  hydrateMainSessionSnapshot: () => Promise<MainSessionSnapshot>;
  createConversationRef: () => string;
  markConversationInferenceSessionLocalOnly: (conversationRef: string | null) => void;
};

type TranscriptSessionUserBindingOptions = {
  userId: unknown;
  updateTranscriptSession: TranscriptSessionUpdater;
};

type BackendEventTranscriptSessionSyncOptions = {
  eventType: string;
  eventUserId?: string | null;
  resolvedConversationRef: unknown;
  activeConversationRef: unknown;
  updateTranscriptSession: TranscriptSessionUpdater;
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

export function applyRendererConversationSelection({
  conversationRef,
  userId,
  updateTranscriptSession,
  setChatConversationRef,
}: RendererConversationSelectionOptions): void {
  updateTranscriptSession(conversationRef, userId ?? undefined);
  setChatConversationRef?.(conversationRef);
}

export function applyTranscriptSessionUserBinding({
  userId,
  updateTranscriptSession,
}: TranscriptSessionUserBindingOptions): boolean {
  const normalizedUserId = normalizeConversationRef(userId);
  if (!normalizedUserId) {
    return false;
  }

  updateTranscriptSession(undefined, normalizedUserId);
  return true;
}

export function syncTranscriptSessionFromBackendEvent({
  eventType,
  eventUserId,
  resolvedConversationRef,
  activeConversationRef,
  updateTranscriptSession,
}: BackendEventTranscriptSessionSyncOptions): void {
  const normalizedResolvedConversationRef = normalizeConversationRef(resolvedConversationRef);
  const normalizedActiveConversationRef = normalizeConversationRef(activeConversationRef);
  const transcriptConversationRef = (
    eventType === 'local-user-message' && normalizedResolvedConversationRef
      ? normalizedResolvedConversationRef
      : normalizedActiveConversationRef ?? normalizedResolvedConversationRef ?? undefined
  );

  updateTranscriptSession(transcriptConversationRef, eventUserId ?? undefined);
}

export async function hydrateConversationSessionFromMainSnapshot({
  loadMainSessionSnapshot,
  markConversationInferenceSessionUnknown,
  onError,
  ...callbacks
}: HydrateMainSessionSnapshotOptions): Promise<MainSessionSnapshot> {
  try {
    const snapshot = normalizeMainSessionSnapshot(await loadMainSessionSnapshot());
    if (!snapshot.conversationRef && !snapshot.userId) {
      return snapshot;
    }
    const appliedSnapshot = applyMainSessionSnapshot(snapshot, callbacks);
    markConversationInferenceSessionUnknown?.(appliedSnapshot.conversationRef);
    return appliedSnapshot;
  } catch (error) {
    onError?.(error);
    return EMPTY_MAIN_SESSION_SNAPSHOT;
  }
}

export async function ensureConversationRefForSend({
  transcriptConversationRef,
  storeConversationRef,
  setTranscriptConversationRef,
  setChatConversationRef,
  hydrateMainSessionSnapshot,
  createConversationRef,
  markConversationInferenceSessionLocalOnly,
}: EnsureConversationRefForSendOptions): Promise<string> {
  const resolvedConversationRef = resolveConversationRefForSend(
    transcriptConversationRef,
    storeConversationRef,
  );
  if (resolvedConversationRef.conversationRef) {
    if (resolvedConversationRef.source === 'store') {
      setTranscriptConversationRef(resolvedConversationRef.conversationRef);
    }
    setChatConversationRef(resolvedConversationRef.conversationRef);
    return resolvedConversationRef.conversationRef;
  }

  const hydratedSnapshot = await hydrateMainSessionSnapshot();
  if (hydratedSnapshot.conversationRef) {
    return hydratedSnapshot.conversationRef;
  }

  const generatedConversationRef = createConversationRef();
  setTranscriptConversationRef(generatedConversationRef);
  setChatConversationRef(generatedConversationRef);
  markConversationInferenceSessionLocalOnly(generatedConversationRef);
  return generatedConversationRef;
}
