import { useChatStore } from '../stores/chatStore';
import { isTerminalStreamPhase } from './streamPhaseState';
import {
  type TrackedExecution,
  isTrackedExecution,
} from './toolRunnerTracking';

export function shouldAcceptExecutionResult(
  trackedExecutions: Map<string, TrackedExecution>,
  correlationId: string | null | undefined,
): boolean {
  if (!isTrackedExecution(trackedExecutions, correlationId)) {
    return false;
  }
  if (!correlationId) {
    return true;
  }
  const trackedExecution = trackedExecutions.get(correlationId);
  if (!trackedExecution) {
    return false;
  }
  const streamTracking = useChatStore.getState()
    .getWorkspaceState(trackedExecution.conversationRef)
    .streamTracking;
  if (
    trackedExecution.turnRef
    && streamTracking.activeTurnRef
    && trackedExecution.turnRef !== streamTracking.activeTurnRef
  ) {
    trackedExecutions.delete(correlationId);
    return false;
  }
  if (
    trackedExecution.turnRef
    && streamTracking.activeTurnRef === trackedExecution.turnRef
    && isTerminalStreamPhase(streamTracking.phase)
  ) {
    trackedExecutions.delete(correlationId);
    return false;
  }
  return true;
}

export function resolveExecutionConversationRef(
  trackedExecutions: Map<string, TrackedExecution>,
  correlationId: string | null | undefined,
): string | null {
  if (!correlationId) {
    return null;
  }
  return trackedExecutions.get(correlationId)?.conversationRef || null;
}
