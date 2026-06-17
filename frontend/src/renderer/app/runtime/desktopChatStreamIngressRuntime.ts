/**
 * Coordinates the desktop chat stream ingress runtime for the renderer UI.
 */

import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import {
  type ConversationEvent,
} from '../../infrastructure/api/agentSdkClient';
import {
  applyEventChatConversationProjection,
} from '../../features/chat/session/conversationSessionRuntime';

type HandleConversationEventIngressDeps = {
  getActiveConversationRef: () => string | null | undefined;
  setActiveConversationRef: (conversationRef: string | null) => void;
  registerTurnConversationRef: (turnRef: string, conversationRef: string) => void;
  enableTranscript: boolean;
  dispatchConversationEvent: (
    event: ConversationEvent,
    conversationRef: string | null,
  ) => boolean;
};

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function runBestEffort(callback: () => void): void {
  try {
    callback();
  } catch {
    // Ingress side channels must not suppress the primary conversation event.
  }
}

function syncTranscriptSessionFromConversationEvent({
  eventType,
  eventUserId,
  resolvedConversationRef,
  activeConversationRef,
}: {
  eventType: string;
  eventUserId?: string | null;
  resolvedConversationRef: unknown;
  activeConversationRef: unknown;
}): void {
  const normalizedResolvedConversationRef = optionalString(resolvedConversationRef);
  const normalizedActiveConversationRef = optionalString(activeConversationRef);
  const transcriptConversationRef = (
    eventType === 'user_message' && normalizedResolvedConversationRef
      ? normalizedResolvedConversationRef
      : normalizedActiveConversationRef ?? normalizedResolvedConversationRef ?? undefined
  );

  DesktopTranscriptSessionRuntimeClient.updateTranscriptSession(
    transcriptConversationRef,
    eventUserId ?? undefined,
  );
}

export function handleConversationEventIngress(
  event: ConversationEvent | null,
  deps: HandleConversationEventIngressDeps,
): boolean {
  if (!event || typeof event !== 'object') {
    return false;
  }
  const conversationRef = optionalString(event.conversationRef);
  if (!conversationRef) {
    return false;
  }
  runBestEffort(() => {
    const activeConversationRef = deps.getActiveConversationRef();
    applyEventChatConversationProjection({
      eventType: event.type,
      explicitConversationRef: event.conversationRef,
      resolvedConversationRef: conversationRef,
      activeConversationRef,
      setChatConversationRef: deps.setActiveConversationRef,
    });
  });
  if (event.turnRef) {
    runBestEffort(() => {
      deps.registerTurnConversationRef(event.turnRef as string, conversationRef);
    });
  }
  if (deps.enableTranscript) {
    runBestEffort(() => {
      syncTranscriptSessionFromConversationEvent({
        eventType: event.type,
        eventUserId: typeof event.payload?.userId === 'string' ? event.payload.userId : null,
        resolvedConversationRef: conversationRef,
        activeConversationRef: DesktopTranscriptSessionRuntimeClient.getActiveConversationRef(),
      });
    });
  }
  return deps.dispatchConversationEvent(event, conversationRef);
}
