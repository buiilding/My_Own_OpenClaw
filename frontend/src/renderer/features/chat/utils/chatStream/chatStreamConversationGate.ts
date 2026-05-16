import type { BackendEvent } from '../../../../types/backendEvents';

type ResolveConversationRefWithTurnFallbackArgs = {
  explicitConversationRef?: string | null;
  turnRef?: string | null | undefined;
  resolveConversationRefForTurn?: ((turnRef: string) => string | null | undefined) | null;
};

export function resolveConversationRefWithTurnFallback({
  explicitConversationRef,
  turnRef,
  resolveConversationRefForTurn = null,
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
