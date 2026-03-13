import { type BackendEvent, type BackendEventType } from '../../../../types/backendEvents';
import { useChatStore } from '../../stores/chatStore';
import { applyTrackingEvent, type StreamTrackingOptions } from './chatStreamTracking';
import { isStaleTurnForActiveStream } from './chatStreamTurnGuard';
import {
  resolveConversationRefWithTurnFallback,
  resolveEventConversationRef,
} from './chatStreamConversationGate';
import {
  hasTerminalPendingHandoff,
  isAwaitingFirstChunkMismatch,
  normalizeTurnRef,
  shouldIgnoreForTerminalPendingHandoff,
} from './chatStreamTerminalHandoffGuard';

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
  const rawActiveConversationRef = useChatStore.getState().activeConversationRef;
  const activeConversationRef = (
    typeof rawActiveConversationRef === 'string'
      ? rawActiveConversationRef.trim()
      : ''
  ) || null;
  if (activeConversationRef === conversationRef) {
    return;
  }
  if (event.type !== 'local-user-message' && activeConversationRef) {
    return;
  }
  // Only user-initiated local sends or an empty renderer session may project a
  // new active conversation. Background stream events must stay scoped to their
  // own workspace instead of stealing foreground chat focus.
  setActiveConversationRef(conversationRef);
}

export function shouldIgnoreForStaleTurn(
  event: BackendEvent,
  conversationRef?: string | null,
): boolean {
  const eventTurnRef = normalizeTurnRef(event.turn_ref);
  if (!eventTurnRef) {
    return false;
  }
  const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
  const activeTurnRef = workspace.streamTracking.activeTurnRef;
  const normalizedActiveTurnRef = normalizeTurnRef(activeTurnRef);
  // During awaiting-first-chunk, fail-open on turn-ref mismatch so the first real
  // backend packets can re-anchor stream state if optimistic local turn wiring
  // never seeded this workspace with the current turn ref.
  if (isAwaitingFirstChunkMismatch(workspace, eventTurnRef, normalizedActiveTurnRef)) {
    return false;
  }
  // Keep first packets of the next turn when UI has already entered "sending" but
  // stream-tracking still points at a completed previous turn.
  if (hasTerminalPendingHandoff(workspace)) {
    return shouldIgnoreForTerminalPendingHandoff(
      workspace,
      eventTurnRef,
      normalizedActiveTurnRef,
    );
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
