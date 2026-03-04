type ConversationRefSource = 'transcript' | 'store' | 'generated';

export function normalizeConversationRef(value: unknown): string | null {
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

