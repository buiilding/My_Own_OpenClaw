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
  // Conversation-scoped backend events are the authoritative active-chat signal
  // for each renderer window. This lets late-mounted overlay windows re-anchor
  // to the current stream even if they missed the initial local-user-message.
  setActiveConversationRef(conversationRef);
}

export function shouldIgnoreForStaleTurn(
  event: BackendEvent,
  conversationRef?: string | null,
): boolean {
  const eventTurnRef = (
    typeof event.turn_ref === 'string'
      ? event.turn_ref.trim()
      : ''
  );
  if (!eventTurnRef) {
    return false;
  }
  const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
  const activeTurnRef = workspace.streamTracking.activeTurnRef;
  const normalizedActiveTurnRef = (
    typeof activeTurnRef === 'string'
      ? activeTurnRef.trim()
      : ''
  );
  // During awaiting-first-chunk, fail-open on turn-ref mismatch so the first real
  // backend packets can re-anchor stream state if optimistic local turn wiring
  // never seeded this workspace with the current turn ref.
  if (
    workspace.isSending === true
    && workspace.streamTracking.phase === 'awaiting-first-chunk'
    && normalizedActiveTurnRef
    && eventTurnRef !== normalizedActiveTurnRef
  ) {
    return false;
  }
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
    const lastMessage = workspace.messages[workspace.messages.length - 1];
    const isPendingOptimisticUserTurn = lastMessage?.sender === 'user';
    // Idle+isSending is used by the sending renderer before local-user-message
    // replays back through main. Once metadata or chunks have re-anchored the
    // workspace to the current turn, same-turn packets must continue through.
    if (workspace.streamTracking.phase === 'idle') {
      return false;
    }
    if (normalizedActiveTurnRef && eventTurnRef === normalizedActiveTurnRef) {
      return !isPendingOptimisticUserTurn;
    }
    return false;
  }
  return isStaleTurnForActiveStream(eventTurnRef, activeTurnRef);
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
