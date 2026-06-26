/**
 * Coordinates the desktop chat stream ingress runtime for the renderer UI.
 */

import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopConversationSessionRuntimeClient } from './desktopConversationSessionRuntimeClient';
import { DesktopChatStreamEventRuntime } from './desktopChatStreamEventRuntime';
import { DesktopChatStreamEventPayloadRuntime } from './desktopChatStreamEventPayloadRuntime';
import {
  type ConversationEvent,
} from './desktopConversationRuntimeContracts';

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

const {
  resolveConversationStreamEventIdentity,
} = DesktopChatStreamEventRuntime;
const {
  resolveConversationStreamEventUserId,
} = DesktopChatStreamEventPayloadRuntime;

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

function handleConversationEventIngress(
  event: ConversationEvent | null,
  deps: HandleConversationEventIngressDeps,
): boolean {
  if (!event || typeof event !== 'object') {
    return false;
  }
  const eventIdentity = resolveConversationStreamEventIdentity(event);
  const conversationRef = eventIdentity.conversationRef;
  if (!conversationRef) {
    return false;
  }
  runBestEffort(() => {
    const activeConversationRef = deps.getActiveConversationRef();
    DesktopConversationSessionRuntimeClient.applyEventChatConversationProjection({
      eventType: event.type,
      explicitConversationRef: conversationRef,
      resolvedConversationRef: conversationRef,
      activeConversationRef,
      setChatConversationRef: deps.setActiveConversationRef,
    });
  });
  const turnRef = eventIdentity.turnRef;
  if (turnRef) {
    runBestEffort(() => {
      deps.registerTurnConversationRef(turnRef, conversationRef);
    });
  }
  if (deps.enableTranscript) {
    runBestEffort(() => {
      syncTranscriptSessionFromConversationEvent({
        eventType: event.type,
        eventUserId: resolveConversationStreamEventUserId(event),
        resolvedConversationRef: conversationRef,
        activeConversationRef: DesktopTranscriptSessionRuntimeClient.getActiveConversationRef(),
      });
    });
  }
  return deps.dispatchConversationEvent(event, conversationRef);
}

export const DesktopChatStreamIngressRuntime = Object.freeze({
  handleConversationEventIngress,
});
