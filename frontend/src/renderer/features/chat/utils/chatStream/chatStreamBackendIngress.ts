import { getActiveConversationRef, updateTranscriptSession } from '../../../../infrastructure/transcript/TranscriptWriter';
import type { BackendEvent } from '../../../../types/backendEvents';

type IngressDeps = {
  syncActiveConversationProjection: (event: BackendEvent, conversationRef: string | null) => void;
  registerTurnConversationRef: (turnRef: string, conversationRef: string) => void;
  enableTranscript: boolean;
  dispatchEvent: (event: BackendEvent) => void;
};

export const ingestBackendEvent = (
  event: BackendEvent,
  conversationRef: string | null,
  deps: IngressDeps,
) => {
  const {
    syncActiveConversationProjection,
    registerTurnConversationRef,
    enableTranscript,
    dispatchEvent,
  } = deps;

  try {
    syncActiveConversationProjection(event, conversationRef);
  } catch {
    // Projection updates are best-effort. Stream event dispatch must continue.
  }
  if (conversationRef && event.turn_ref) {
    try {
      registerTurnConversationRef(event.turn_ref, conversationRef);
    } catch {
      // Turn-map registration is best-effort. Stream event dispatch must continue.
    }
  }
  if (enableTranscript) {
    try {
      const activeConversationRef = getActiveConversationRef();
      updateTranscriptSession(activeConversationRef || conversationRef || undefined, event.user_id);
    } catch {
      // Transcript session sync is best-effort. Stream event dispatch must continue.
    }
  }
  dispatchEvent(event);
};
