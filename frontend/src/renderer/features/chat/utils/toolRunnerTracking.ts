import { isTerminalStreamPhase } from './streamPhaseState';

export type TrackedExecution = {
  turnRef: string | null;
  conversationRef: string | null;
};

function resolveTrackedTurnRef(trackedExecution: TrackedExecution | null | undefined): string | null {
  if (!trackedExecution || typeof trackedExecution !== 'object') {
    return null;
  }
  const turnRef = trackedExecution.turnRef;
  return typeof turnRef === 'string' && turnRef ? turnRef : null;
}

export function trackExecutionTurn(
  trackedExecutionTurns: Map<string, TrackedExecution>,
  correlationId: string | null | undefined,
  turnRef: string | null,
  conversationRef: string | null,
): void {
  if (!correlationId) {
    return;
  }
  trackedExecutionTurns.set(correlationId, { turnRef, conversationRef });
}

export function untrackExecutionTurn(
  trackedExecutionTurns: Map<string, TrackedExecution>,
  correlationId: string | null | undefined,
): void {
  if (!correlationId) {
    return;
  }
  trackedExecutionTurns.delete(correlationId);
}

export function isTrackedExecution(
  trackedExecutionTurns: Map<string, TrackedExecution>,
  correlationId: string | null | undefined,
): boolean {
  if (!correlationId) {
    return true;
  }
  return trackedExecutionTurns.has(correlationId);
}

export function pruneTrackedExecutionTurns(
  trackedExecutionTurns: Map<string, TrackedExecution>,
  activeTurnRef: string | null,
  streamPhase: string | null | undefined,
): void {
  if (trackedExecutionTurns.size === 0) {
    return;
  }

  if (!activeTurnRef) {
    if (isTerminalStreamPhase(streamPhase)) {
      trackedExecutionTurns.clear();
    }
    return;
  }

  if (isTerminalStreamPhase(streamPhase)) {
    for (const [correlationId, trackedExecution] of trackedExecutionTurns.entries()) {
      const trackedTurnRef = resolveTrackedTurnRef(trackedExecution);
      if (!trackedTurnRef || trackedTurnRef === activeTurnRef) {
        trackedExecutionTurns.delete(correlationId);
      }
    }
    return;
  }

  for (const [correlationId, trackedExecution] of trackedExecutionTurns.entries()) {
    const trackedTurnRef = resolveTrackedTurnRef(trackedExecution);
    if (trackedTurnRef && trackedTurnRef !== activeTurnRef) {
      trackedExecutionTurns.delete(correlationId);
    }
  }
}
