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
  if (typeof event.conversation_ref === 'string' && event.conversation_ref.length > 0) {
    return event.conversation_ref;
  }
  if (event.type === 'memory-store') {
    const payloadSessionId = event.payload?.session_id;
    if (typeof payloadSessionId === 'string' && payloadSessionId.length > 0) {
      return payloadSessionId;
    }
    if (typeof event.session_id === 'string' && event.session_id.length > 0) {
      return event.session_id;
    }
    return null;
  }
  if (event.type !== 'local-user-message') {
    return null;
  }
  const payloadConversationRef = event.payload?.conversation_ref;
  if (typeof payloadConversationRef !== 'string' || payloadConversationRef.length === 0) {
    return null;
  }
  return payloadConversationRef;
}
