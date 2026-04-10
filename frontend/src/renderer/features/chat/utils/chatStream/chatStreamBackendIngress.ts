import { getActiveConversationRef, updateTranscriptSession } from '../../../../infrastructure/transcript/TranscriptWriter';
import { syncTranscriptSessionFromBackendEvent } from '../../session/conversationSessionRuntime';
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
  const normalizedConversationRef = (
    typeof conversationRef === 'string'
      ? conversationRef.trim()
      : ''
  ) || null;
  const normalizedTurnRef = (
    typeof event.turn_ref === 'string'
      ? event.turn_ref.trim()
      : ''
  );

  try {
    syncActiveConversationProjection(event, normalizedConversationRef);
  } catch {
    // Projection updates are best-effort. Stream event dispatch must continue.
  }
  if (normalizedConversationRef && normalizedTurnRef) {
    try {
      registerTurnConversationRef(normalizedTurnRef, normalizedConversationRef);
    } catch {
      // Turn-map registration is best-effort. Stream event dispatch must continue.
    }
  }
  if (enableTranscript) {
    try {
      syncTranscriptSessionFromBackendEvent({
        eventType: event.type,
        eventUserId: event.user_id,
        resolvedConversationRef: normalizedConversationRef,
        activeConversationRef: getActiveConversationRef(),
        updateTranscriptSession,
      });
    } catch {
      // Transcript session sync is best-effort. Stream event dispatch must continue.
    }
  }
  dispatchEvent(event);
};
