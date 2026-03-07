import { type ToolBundleEvent, type ToolCallEvent } from '../../../../types/backendEvents';
import { useChatStore } from '../../stores/chatStore';
import { resolveConversationRefWithTurnFallback } from '../chatStream/chatStreamConversationGate';
import {
  normalizeTurnRef,
  shouldIgnoreForTerminalPendingHandoff,
} from '../chatStream/chatStreamTerminalHandoffGuard';
import { isTerminalStreamPhase } from '../state/streamPhaseState';

type ToolEventRef = Pick<ToolCallEvent | ToolBundleEvent, 'conversation_ref' | 'turn_ref'>;

export function resolveToolEventConversationRef(
  event: ToolEventRef,
): string | null {
  const store = useChatStore.getState();
  return resolveConversationRefWithTurnFallback({
    explicitConversationRef: event.conversation_ref,
    turnRef: event.turn_ref,
    resolveConversationRefForTurn: store.resolveConversationRefForTurn,
    fallbackConversationRef: store.activeConversationRef,
  });
}

export function shouldIgnoreToolEventForTurn(
  turnRef: string | null | undefined,
  conversationRef: string | null,
): boolean {
  const normalizedTurnRef = normalizeTurnRef(turnRef);
  if (!normalizedTurnRef) {
    return false;
  }
  const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
  const activeTurnRef = normalizeTurnRef(workspace.streamTracking.activeTurnRef);
  if (!activeTurnRef) {
    return true;
  }
  if (activeTurnRef !== normalizedTurnRef) {
    return true;
  }
  if (!isTerminalStreamPhase(workspace.streamTracking.phase)) {
    return false;
  }
  return shouldIgnoreForTerminalPendingHandoff(
    workspace,
    normalizedTurnRef,
    activeTurnRef,
  );
}
