import { useChatStore } from '../../stores/chatStore';
import {
  normalizeTurnRef,
  shouldIgnoreForTerminalPendingHandoff,
} from '../chatStream/chatStreamTerminalHandoffGuard';
import { isTerminalStreamPhase } from '../state/streamPhaseState';
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
  const workspace = useChatStore.getState()
    .getWorkspaceState(trackedExecution.conversationRef);
  const streamTracking = workspace.streamTracking;
  const trackedTurnRef = normalizeTurnRef(trackedExecution.turnRef);
  const activeTurnRef = normalizeTurnRef(streamTracking.activeTurnRef);
  if (
    trackedTurnRef
    && activeTurnRef
    && trackedTurnRef !== activeTurnRef
  ) {
    trackedExecutions.delete(correlationId);
    return false;
  }
  if (
    trackedTurnRef
    && activeTurnRef === trackedTurnRef
    && isTerminalStreamPhase(streamTracking.phase)
  ) {
    const shouldIgnore = shouldIgnoreForTerminalPendingHandoff(
      workspace,
      trackedTurnRef,
      activeTurnRef,
    );
    if (shouldIgnore) {
      trackedExecutions.delete(correlationId);
      return false;
    }
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
