import type { BackendEvent } from '../../../types/backendEvents';
import type { StreamPhase } from '../stores/chatStore';

const TERMINAL_STREAM_PHASES = new Set<StreamPhase>(['idle', 'complete', 'error']);

export function resolveEventConversationRef(event: BackendEvent): string | null {
  if (typeof event.conversation_ref === 'string' && event.conversation_ref.length > 0) {
    return event.conversation_ref;
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

export function shouldIgnoreEventForActiveConversation(
  event: BackendEvent,
  activeConversationRef: string | null,
  streamTracking: {
    activeTurnRef: string | null;
    phase: StreamPhase;
  },
): boolean {
  if (!activeConversationRef) {
    return false;
  }
  const eventConversationRef = resolveEventConversationRef(event);
  if (!eventConversationRef) {
    return false;
  }
  if (eventConversationRef === activeConversationRef) {
    return false;
  }
  if (event.type === 'local-user-message') {
    return false;
  }

  const hasActiveTurn = (
    typeof streamTracking.activeTurnRef === 'string'
    && streamTracking.activeTurnRef.length > 0
  );
  if (!hasActiveTurn) {
    return false;
  }
  return !TERMINAL_STREAM_PHASES.has(streamTracking.phase);
}
