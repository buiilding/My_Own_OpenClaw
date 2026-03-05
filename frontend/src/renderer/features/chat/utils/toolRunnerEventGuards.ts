import { type ToolBundleEvent, type ToolCallEvent } from '../../../types/backendEvents';
import { useChatStore } from '../stores/chatStore';
import { resolveConversationRefWithTurnFallback } from './chatStreamConversationGate';
import { isTerminalStreamPhase } from './streamPhaseState';

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
  if (!turnRef) {
    return false;
  }
  const { streamTracking } = useChatStore.getState().getWorkspaceState(conversationRef);
  if (!streamTracking.activeTurnRef) {
    return true;
  }
  if (streamTracking.activeTurnRef !== turnRef) {
    return true;
  }
  return isTerminalStreamPhase(streamTracking.phase);
}
