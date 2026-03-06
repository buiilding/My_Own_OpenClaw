import { type BackendEvent, type BackendEventType } from '../../../../types/backendEvents';
import { useChatStore } from '../../stores/chatStore';
import { applyTrackingEvent, type StreamTrackingOptions } from './chatStreamTracking';
import { isStaleTurnForActiveStream } from './chatStreamTurnGuard';
import {
  resolveConversationRefWithTurnFallback,
  resolveEventConversationRef,
} from './chatStreamConversationGate';

export function resolveTargetConversationRef(
  event: BackendEvent,
  fallbackConversationRef: string | null = null,
): string | null {
  const store = useChatStore.getState();
  return resolveConversationRefWithTurnFallback({
    explicitConversationRef: resolveEventConversationRef(event),
    turnRef: event.turn_ref,
    resolveConversationRefForTurn: store.resolveConversationRefForTurn,
    fallbackConversationRef,
  });
}

export function syncActiveConversationProjection(
  event: BackendEvent,
  conversationRef: string | null,
  setActiveConversationRef: (conversationRef: string | null) => void,
): void {
  if (!conversationRef) {
    return;
  }
  const explicitConversationRef = resolveEventConversationRef(event);
  if (!explicitConversationRef) {
    return;
  }
  const activeConversationRef = useChatStore.getState().activeConversationRef;
  if (activeConversationRef === conversationRef) {
    return;
  }
  if (!activeConversationRef || event.type === 'local-user-message') {
    setActiveConversationRef(conversationRef);
  }
}

export function shouldIgnoreForStaleTurn(
  event: BackendEvent,
  conversationRef?: string | null,
): boolean {
  if (!event.turn_ref) {
    return false;
  }
  const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
  const activeTurnRef = workspace.streamTracking.activeTurnRef;
  const isPendingNextTurnAfterTerminalPhase = (
    workspace.isSending === true
    && (
      workspace.streamTracking.phase === 'idle'
      || workspace.streamTracking.phase === 'complete'
      || workspace.streamTracking.phase === 'error'
    )
  );
  // Keep first packets of the next turn when UI has already entered "sending" but
  // stream-tracking still points at a completed previous turn.
  if (isPendingNextTurnAfterTerminalPhase) {
    if (activeTurnRef && event.turn_ref === activeTurnRef) {
      return true;
    }
    return false;
  }
  return isStaleTurnForActiveStream(event.turn_ref, activeTurnRef);
}

type UpdateStreamTracking = (
  updater: (current: any) => any,
  conversationRef?: string | null,
) => void;

export function recordTrackingEvent(
  updateStreamTracking: UpdateStreamTracking,
  eventType: BackendEventType,
  turnRef: string | null | undefined,
  options: StreamTrackingOptions = {},
  conversationRef?: string | null,
): void {
  const now = new Date().toISOString();
  updateStreamTracking(
    (current) => applyTrackingEvent(current, eventType, turnRef, now, options),
    conversationRef,
  );
}
