/**
 * Coordinates the desktop chat stream terminal handoff runtime for the renderer UI.
 */

import type { StreamPhase } from './desktopChatStreamTrackingRuntime';

type StreamGuardMessage = {
  sender?: string | null;
  isComplete?: boolean | null;
  turnRef?: string | null;
};

type StreamGuardPendingTurn = {
  turnRef?: string | null;
};

export type StreamGuardWorkspace = {
  messages: StreamGuardMessage[];
  pendingTurn?: StreamGuardPendingTurn | null;
  streamTracking: {
    phase: StreamPhase;
    activeTurnRef?: string | null;
  };
};

const TERMINAL_PENDING_HANDOFF_PHASES: ReadonlySet<StreamPhase> = new Set([
  'idle',
  'complete',
  'error',
]);

function normalizeTurnRef(turnRef: string | null | undefined): string {
  return typeof turnRef === 'string' ? turnRef.trim() : '';
}

function hasPendingTurn(workspace: StreamGuardWorkspace): boolean {
  return normalizeTurnRef(workspace.pendingTurn?.turnRef).length > 0;
}

function isAwaitingFirstChunkMismatch(
  workspace: StreamGuardWorkspace,
  eventTurnRef: string,
  activeTurnRef: string,
): boolean {
  return (
    hasPendingTurn(workspace)
    && workspace.streamTracking.phase === 'awaiting-first-chunk'
    && activeTurnRef.length > 0
    && eventTurnRef !== activeTurnRef
  );
}

function hasTerminalPendingHandoff(workspace: StreamGuardWorkspace): boolean {
  return (
    hasPendingTurn(workspace)
    && TERMINAL_PENDING_HANDOFF_PHASES.has(workspace.streamTracking.phase)
  );
}

function hasOptimisticPendingUserTurn(workspace: StreamGuardWorkspace): boolean {
  const lastMessage = workspace.messages[workspace.messages.length - 1];
  return lastMessage?.sender === 'user';
}

function hasIncompleteCurrentTurnAssistantPlaceholder(
  workspace: StreamGuardWorkspace,
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
  workspace: StreamGuardWorkspace,
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

export const DesktopChatStreamTerminalHandoffRuntime = Object.freeze({
  normalizeTurnRef,
  isAwaitingFirstChunkMismatch,
  hasTerminalPendingHandoff,
  shouldIgnoreForTerminalPendingHandoff,
});
