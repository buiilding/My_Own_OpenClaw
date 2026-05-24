import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import {
  type ConversationEvent,
  normalizeBackendEventToConversationEvent,
} from '../../infrastructure/api/windieSdkClient';
import {
  type BackendEvent,
  isBackendEvent,
} from '../../types/backendEvents';
import {
  resolveTargetConversationRef,
  syncActiveConversationProjection,
} from './desktopChatStreamEventRuntime';

type NormalizeBackendIngressEventOptions = {
  conversationRef?: string | null;
  revisionId?: string | null;
};

type IngressDeps = {
  syncActiveConversationProjection: (event: BackendEvent, conversationRef: string | null) => void;
  registerTurnConversationRef: (turnRef: string, conversationRef: string) => void;
  enableTranscript: boolean;
  dispatchEvent: (event: BackendEvent) => void;
};

type StreamIngressTracePhase = 'before' | 'after';

type StreamIngressTracePayload = {
  eventType: string;
  turnRef?: string | null;
  conversationRef: string | null;
  sdkEventType?: string | null;
};

type HandleBackendStreamIngressDeps = {
  resolveConversationRefForTurn: (turnRef: string) => string | null | undefined;
  getActiveConversationRef: () => string | null | undefined;
  setActiveConversationRef: (conversationRef: string | null) => void;
  registerTurnConversationRef: (turnRef: string, conversationRef: string) => void;
  enableTranscript: boolean;
  dispatchConversationEvent: (
    event: ConversationEvent | null,
    conversationRef: string | null,
  ) => boolean;
  logTrace?: (
    phase: StreamIngressTracePhase,
    payload: StreamIngressTracePayload,
  ) => void;
};

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function syncTranscriptSessionFromStreamEvent({
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
    eventType === 'local-user-message' && normalizedResolvedConversationRef
      ? normalizedResolvedConversationRef
      : normalizedActiveConversationRef ?? normalizedResolvedConversationRef ?? undefined
  );

  DesktopTranscriptSessionRuntimeClient.updateTranscriptSession(
    transcriptConversationRef,
    eventUserId ?? undefined,
  );
}

export function toBackendIngressEvent(data: unknown): BackendEvent | null {
  return isBackendEvent(data) ? data : null;
}

export function normalizeBackendIngressEvent(
  event: BackendEvent,
  options: NormalizeBackendIngressEventOptions = {},
): ConversationEvent | null {
  return normalizeBackendEventToConversationEvent(event, {
    fallbackConversationRef: optionalString(options.conversationRef) ?? undefined,
    fallbackRevisionId: optionalString(options.revisionId) ?? undefined,
  });
}

export const ingestBackendEvent = (
  event: BackendEvent,
  conversationRef: string | null,
  deps: IngressDeps,
): boolean => {
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

  if (!normalizedConversationRef) {
    return false;
  }

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
      syncTranscriptSessionFromStreamEvent({
        eventType: event.type,
        eventUserId: event.user_id,
        resolvedConversationRef: normalizedConversationRef,
        activeConversationRef: DesktopTranscriptSessionRuntimeClient.getActiveConversationRef(),
      });
    } catch {
      // Transcript session sync is best-effort. Stream event dispatch must continue.
    }
  }
  dispatchEvent(event);
  return true;
};

export function handleBackendStreamIngress(
  data: unknown,
  deps: HandleBackendStreamIngressDeps,
): boolean {
  const backendEvent = toBackendIngressEvent(data);
  if (!backendEvent) {
    return false;
  }
  const conversationRef = resolveTargetConversationRef(backendEvent, {
    resolveConversationRefForTurn: deps.resolveConversationRefForTurn,
  });
  const conversationEvent = normalizeBackendIngressEvent(
    backendEvent,
    { conversationRef },
  );
  const tracePayload: StreamIngressTracePayload = {
    eventType: backendEvent.type,
    turnRef: backendEvent.turn_ref,
    conversationRef,
    sdkEventType: conversationEvent?.type,
  };
  deps.logTrace?.('before', tracePayload);
  const accepted = ingestBackendEvent(backendEvent, conversationRef, {
    syncActiveConversationProjection: (event, resolvedConversationRef) => {
      syncActiveConversationProjection(event, resolvedConversationRef, {
        activeConversationRef: deps.getActiveConversationRef(),
        setActiveConversationRef: deps.setActiveConversationRef,
      });
    },
    registerTurnConversationRef: deps.registerTurnConversationRef,
    enableTranscript: deps.enableTranscript,
    dispatchEvent: () => {
      deps.dispatchConversationEvent(conversationEvent, conversationRef);
    },
  });
  deps.logTrace?.('after', tracePayload);
  return accepted;
}
