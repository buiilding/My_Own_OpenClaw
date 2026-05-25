import { type BackendEventType } from '../../types/backendEvents';
import { applyTrackingEvent, type StreamTrackingOptions } from './desktopChatStreamTrackingRuntime';
import { isStaleTurnForActiveStream } from './desktopChatStreamTurnGuardRuntime';
import {
  hasTerminalPendingHandoff,
  isAwaitingFirstChunkMismatch,
  normalizeTurnRef,
  shouldIgnoreForTerminalPendingHandoff,
  type StreamGuardWorkspace,
} from './desktopChatStreamTerminalHandoffRuntime';

type ShouldIgnoreForStaleTurnDeps = {
  getWorkspaceState: (conversationRef?: string | null) => StreamGuardWorkspace;
};

type TurnRefEvent = {
  turn_ref?: string | null;
};

type ConversationTurnRefEvent = {
  turnRef?: string | null;
};

export function shouldIgnoreForStaleTurn(
  event: TurnRefEvent,
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
