import type { ChatMessage, StreamPhase } from '../../stores/chatStore';

type GuardWorkspace = {
  isSending: boolean;
  messages: ChatMessage[];
  streamTracking: {
    phase: StreamPhase;
  };
};

const TERMINAL_PENDING_HANDOFF_PHASES: ReadonlySet<StreamPhase> = new Set([
  'idle',
  'complete',
  'error',
]);

export function normalizeTurnRef(turnRef: string | null | undefined): string {
  return typeof turnRef === 'string' ? turnRef.trim() : '';
}

export function isAwaitingFirstChunkMismatch(
  workspace: GuardWorkspace,
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

export function hasTerminalPendingHandoff(workspace: GuardWorkspace): boolean {
  return (
    workspace.isSending === true
    && TERMINAL_PENDING_HANDOFF_PHASES.has(workspace.streamTracking.phase)
  );
}

function hasOptimisticPendingUserTurn(workspace: GuardWorkspace): boolean {
  const lastMessage = workspace.messages[workspace.messages.length - 1];
  return lastMessage?.sender === 'user';
}

function hasIncompleteCurrentTurnAssistantPlaceholder(
  workspace: GuardWorkspace,
  eventTurnRef: string,
): boolean {
  const lastMessage = workspace.messages[workspace.messages.length - 1];
  return (
    lastMessage?.sender === 'assistant'
    && lastMessage?.isComplete === false
    && normalizeTurnRef(lastMessage?.turnRef) === eventTurnRef
  );
}

export function shouldIgnoreForTerminalPendingHandoff(
  workspace: GuardWorkspace,
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
