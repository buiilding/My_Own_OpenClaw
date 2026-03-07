import { type BackendEvent, type BackendEventType } from '../../../../types/backendEvents';
import { useChatStore } from '../../stores/chatStore';
import { applyTrackingEvent, type StreamTrackingOptions } from './chatStreamTracking';
import { isStaleTurnForActiveStream } from './chatStreamTurnGuard';
import {
  resolveConversationRefWithTurnFallback,
  resolveEventConversationRef,
} from './chatStreamConversationGate';

type ChatStoreState = ReturnType<typeof useChatStore.getState>;
type ChatWorkspaceState = ReturnType<ChatStoreState['getWorkspaceState']>;
type StreamPhase = ChatWorkspaceState['streamTracking']['phase'];

const TERMINAL_PENDING_HANDOFF_PHASES: ReadonlySet<StreamPhase> = new Set([
  'idle',
  'complete',
  'error',
]);

function normalizeTurnRef(turnRef: string | null | undefined): string {
  return typeof turnRef === 'string' ? turnRef.trim() : '';
}

function isAwaitingFirstChunkMismatch(
  workspace: ChatWorkspaceState,
  eventTurnRef: string,
  activeTurnRef: string,
): boolean {
  return (
    workspace.isSending === true
    && workspace.streamTracking.phase === 'awaiting-first-chunk'
    && activeTurnRef.length > 0
    && eventTurnRef !== activeTurnRef
  );
}

function hasTerminalPendingHandoff(workspace: ChatWorkspaceState): boolean {
  return (
    workspace.isSending === true
    && TERMINAL_PENDING_HANDOFF_PHASES.has(workspace.streamTracking.phase)
  );
}

function hasOptimisticPendingUserTurn(workspace: ChatWorkspaceState): boolean {
  const lastMessage = workspace.messages[workspace.messages.length - 1];
  return lastMessage?.sender === 'user';
}

function hasIncompleteCurrentTurnAssistantPlaceholder(
  workspace: ChatWorkspaceState,
  eventTurnRef: string,
): boolean {
  const lastMessage = workspace.messages[workspace.messages.length - 1];
  return (
    lastMessage?.sender === 'assistant'
    && lastMessage?.isComplete === false
    && normalizeTurnRef(lastMessage?.turnRef) === eventTurnRef
  );
}

function shouldIgnoreForTerminalPendingHandoff(
  workspace: ChatWorkspaceState,
  eventTurnRef: string,
  activeTurnRef: string,
): boolean {
  if (workspace.streamTracking.phase === 'idle') {
    return false;
  }
  if (!activeTurnRef || eventTurnRef !== activeTurnRef) {
    return false;
  }
  if (hasIncompleteCurrentTurnAssistantPlaceholder(workspace, eventTurnRef)) {
    return false;
  }
  return hasOptimisticPendingUserTurn(workspace) === false;
}

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
