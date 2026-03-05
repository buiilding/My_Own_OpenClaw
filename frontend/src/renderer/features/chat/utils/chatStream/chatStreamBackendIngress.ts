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

  syncActiveConversationProjection(event, conversationRef);
  if (conversationRef && event.turn_ref) {
    registerTurnConversationRef(event.turn_ref, conversationRef);
  }
  if (enableTranscript) {
    const activeConversationRef = getActiveConversationRef();
    updateTranscriptSession(activeConversationRef || conversationRef || undefined, event.user_id);
  }
  dispatchEvent(event);
};
