import type { BackendEvent } from '../../../../types/backendEvents';

type ResolveConversationRefWithTurnFallbackArgs = {
  explicitConversationRef?: string | null;
  turnRef?: string | null | undefined;
  resolveConversationRefForTurn?: ((turnRef: string) => string | null | undefined) | null;
  fallbackConversationRef?: string | null;
};

export function resolveConversationRefWithTurnFallback({
  explicitConversationRef,
  turnRef,
  resolveConversationRefForTurn = null,
  fallbackConversationRef = null,
}: ResolveConversationRefWithTurnFallbackArgs): string | null {
  const normalizedConversationRef = (
    typeof explicitConversationRef === 'string'
      ? explicitConversationRef.trim()
      : ''
  );
  if (normalizedConversationRef) {
    return normalizedConversationRef;
  }

  const normalizedTurnRef = typeof turnRef === 'string' ? turnRef.trim() : '';
  if (normalizedTurnRef && typeof resolveConversationRefForTurn === 'function') {
    const mappedConversationRef = resolveConversationRefForTurn(normalizedTurnRef);
    if (typeof mappedConversationRef === 'string' && mappedConversationRef.trim()) {
      return mappedConversationRef.trim();
    }
  }

  if (typeof fallbackConversationRef === 'string' && fallbackConversationRef.trim()) {
    return fallbackConversationRef.trim();
  }
  return null;
}

export function resolveEventConversationRef(event: BackendEvent): string | null {
  const explicitConversationRef = (
    typeof event.conversation_ref === 'string'
      ? event.conversation_ref.trim()
      : ''
  );
  if (explicitConversationRef.length > 0) {
    return explicitConversationRef;
  }
  if (event.type === 'memory-store') {
    const payloadSessionId = (
      typeof event.payload?.session_id === 'string'
        ? event.payload.session_id.trim()
        : ''
    );
    if (payloadSessionId.length > 0) {
      return payloadSessionId;
    }
    const eventSessionId = (
      typeof event.session_id === 'string'
        ? event.session_id.trim()
        : ''
    );
    if (eventSessionId.length > 0) {
      return eventSessionId;
    }
    return null;
  }
  if (event.type !== 'local-user-message') {
    return null;
  }
  const payloadConversationRef = (
    typeof event.payload?.conversation_ref === 'string'
      ? event.payload.conversation_ref.trim()
      : ''
  );
  if (payloadConversationRef.length === 0) {
    return null;
  }
  return payloadConversationRef;
}
