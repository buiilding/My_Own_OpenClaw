export type TrackedExecution = {
  turnRef: string | null;
  conversationRef: string | null;
};

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
