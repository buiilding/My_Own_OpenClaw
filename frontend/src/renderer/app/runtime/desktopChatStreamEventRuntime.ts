import { type BackendEvent, type BackendEventType } from '../../types/backendEvents';
import { applyTrackingEvent, type StreamTrackingOptions } from './desktopChatStreamTrackingRuntime';
import { isStaleTurnForActiveStream } from './desktopChatStreamTurnGuardRuntime';
import {
  resolveConversationRefWithTurnFallback,
  resolveEventConversationRef,
} from './desktopChatStreamConversationGateRuntime';
import {
  hasTerminalPendingHandoff,
  isAwaitingFirstChunkMismatch,
  normalizeTurnRef,
  shouldIgnoreForTerminalPendingHandoff,
  type StreamGuardWorkspace,
} from './desktopChatStreamTerminalHandoffRuntime';

type ResolveTargetConversationRefDeps = {
  resolveConversationRefForTurn: (turnRef: string) => string | null | undefined;
};

type SyncActiveConversationProjectionDeps = {
  activeConversationRef: string | null | undefined;
  setActiveConversationRef: (conversationRef: string | null) => void;
};

type ShouldIgnoreForStaleTurnDeps = {
  getWorkspaceState: (conversationRef?: string | null) => StreamGuardWorkspace;
};

type ConversationTurnRefEvent = {
  turnRef?: string | null;
};

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveTargetConversationRef(
  event: BackendEvent,
  deps: ResolveTargetConversationRefDeps,
): string | null {
  return resolveConversationRefWithTurnFallback({
    explicitConversationRef: resolveEventConversationRef(event),
    turnRef: event.turn_ref,
    resolveConversationRefForTurn: deps.resolveConversationRefForTurn,
  });
}

export function syncActiveConversationProjection(
  event: BackendEvent,
  conversationRef: string | null,
  deps: SyncActiveConversationProjectionDeps,
): void {
  const normalizedResolvedConversationRef = optionalString(conversationRef);
  if (!normalizedResolvedConversationRef) {
    return;
  }
  if (!optionalString(resolveEventConversationRef(event))) {
    return;
  }
  const normalizedActiveConversationRef = optionalString(deps.activeConversationRef);
  if (normalizedActiveConversationRef === normalizedResolvedConversationRef) {
    return;
  }
  if (event.type !== 'local-user-message' && normalizedActiveConversationRef) {
    return;
  }
  // Only user-initiated local sends or an empty renderer session may project a
  // new active conversation. Background stream events must stay scoped to their
  // own workspace instead of stealing foreground chat focus.
  deps.setActiveConversationRef(normalizedResolvedConversationRef);
}

export function shouldIgnoreForStaleTurn(
  event: BackendEvent,
  conversationRef?: string | null,
  deps?: ShouldIgnoreForStaleTurnDeps,
): boolean {
  const eventTurnRef = normalizeTurnRef(event.turn_ref);
  if (!eventTurnRef) {
    return false;
  }
  const workspace = deps?.getWorkspaceState(conversationRef);
  if (!workspace) {
    return false;
  }
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

export function shouldIgnoreConversationEventForStaleTurn(
  event: ConversationTurnRefEvent,
  conversationRef?: string | null,
  deps?: ShouldIgnoreForStaleTurnDeps,
): boolean {
  return shouldIgnoreForStaleTurn({
    type: 'system-prompt',
    turn_ref: event.turnRef ?? undefined,
  }, conversationRef, deps);
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
