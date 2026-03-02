import type { BackendEvent } from '../../../types/backendEvents';

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
