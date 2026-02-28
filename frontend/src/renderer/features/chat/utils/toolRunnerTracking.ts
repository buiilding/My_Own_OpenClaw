import { isTerminalStreamPhase } from './streamPhaseState';

export function trackExecutionTurn(
  trackedExecutionTurns: Map<string, string | null>,
  correlationId: string | null | undefined,
  turnRef: string | null,
): void {
  if (!correlationId) {
    return;
  }
  trackedExecutionTurns.set(correlationId, turnRef);
}

export function untrackExecutionTurn(
  trackedExecutionTurns: Map<string, string | null>,
  correlationId: string | null | undefined,
): void {
  if (!correlationId) {
    return;
  }
  trackedExecutionTurns.delete(correlationId);
}

export function isTrackedExecution(
  trackedExecutionTurns: Map<string, string | null>,
  correlationId: string | null | undefined,
): boolean {
  if (!correlationId) {
    return true;
  }
  return trackedExecutionTurns.has(correlationId);
}

export function pruneTrackedExecutionTurns(
  trackedExecutionTurns: Map<string, string | null>,
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
    for (const [correlationId, turnRef] of trackedExecutionTurns.entries()) {
      if (!turnRef || turnRef === activeTurnRef) {
        trackedExecutionTurns.delete(correlationId);
      }
    }
    return;
  }

  for (const [correlationId, turnRef] of trackedExecutionTurns.entries()) {
    if (turnRef && turnRef !== activeTurnRef) {
      trackedExecutionTurns.delete(correlationId);
    }
  }
}
