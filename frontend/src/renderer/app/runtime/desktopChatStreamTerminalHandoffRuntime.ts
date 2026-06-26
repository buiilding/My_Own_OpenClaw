/**
 * Coordinates the desktop chat stream terminal handoff runtime for the renderer UI.
 */

import type { StreamPhase } from './desktopChatStreamTrackingRuntime';

type StreamGuardPendingTurn = {
  turnRef?: string | null;
};

export type StreamGuardWorkspace = {
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

function getPendingTurnRef(workspace: StreamGuardWorkspace): string {
  return normalizeTurnRef(workspace.pendingTurn?.turnRef);
}

function hasPendingTurn(workspace: StreamGuardWorkspace): boolean {
  return getPendingTurnRef(workspace).length > 0;
}

function isAwaitingFirstChunkMismatch(
  workspace: StreamGuardWorkspace,
  eventTurnRef: string,
  activeTurnRef: string,
): boolean {
  const pendingTurnRef = getPendingTurnRef(workspace);
  return (
    pendingTurnRef.length > 0
    && workspace.streamTracking.phase === 'awaiting-first-chunk'
    && activeTurnRef.length > 0
    && eventTurnRef !== activeTurnRef
    && eventTurnRef === pendingTurnRef
  );
}

function hasTerminalPendingHandoff(workspace: StreamGuardWorkspace): boolean {
  return (
    hasPendingTurn(workspace)
    && TERMINAL_PENDING_HANDOFF_PHASES.has(workspace.streamTracking.phase)
  );
}

function shouldIgnoreForTerminalPendingHandoff(
  workspace: StreamGuardWorkspace,
  eventTurnRef: string,
  activeTurnRef: string,
): boolean {
  const pendingTurnRef = getPendingTurnRef(workspace);
  if (eventTurnRef !== activeTurnRef && eventTurnRef !== pendingTurnRef) {
    return true;
  }
  if (eventTurnRef === pendingTurnRef && eventTurnRef !== activeTurnRef) {
    return false;
  }
  if (workspace.streamTracking.phase === 'idle') {
    return false;
  }
  if (!activeTurnRef || eventTurnRef !== activeTurnRef) {
    return false;
  }
  return eventTurnRef !== pendingTurnRef;
}

export const DesktopChatStreamTerminalHandoffRuntime = Object.freeze({
  normalizeTurnRef,
  isAwaitingFirstChunkMismatch,
  hasTerminalPendingHandoff,
  shouldIgnoreForTerminalPendingHandoff,
});
