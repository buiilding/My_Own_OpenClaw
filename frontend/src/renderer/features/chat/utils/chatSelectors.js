import { selectActiveWorkspaceState } from '../stores/chatWorkspaceState';
import { replaceCurrentTurnMessagesWithProjection } from './state/chatBoxResponseState';

let lastDashboardMessagesInput = null;
let lastDashboardProjectionInput = null;
let lastDashboardMessagesOutput = null;

function projectDashboardMessages(activeWorkspace) {
  if (
    lastDashboardMessagesInput === activeWorkspace.messages
    && lastDashboardProjectionInput === activeWorkspace.currentTurnProjection
    && lastDashboardMessagesOutput
  ) {
    return lastDashboardMessagesOutput;
  }

  const projectedMessages = replaceCurrentTurnMessagesWithProjection(
    activeWorkspace.messages,
    activeWorkspace.currentTurnProjection,
  );
  lastDashboardMessagesInput = activeWorkspace.messages;
  lastDashboardProjectionInput = activeWorkspace.currentTurnProjection;
  lastDashboardMessagesOutput = projectedMessages;
  return projectedMessages;
}

export function selectChatInterfaceState(state) {
  const activeWorkspace = selectActiveWorkspaceState(state);
  return {
    messages: projectDashboardMessages(activeWorkspace),
    isSending: activeWorkspace.isSending,
    thinkingStatus: activeWorkspace.thinkingStatus,
    thinkingSourceEventType: activeWorkspace.thinkingSourceEventType,
    compactionDebugInfo: activeWorkspace.compactionDebugInfo,
    tokenCounts: activeWorkspace.tokenCounts,
    streamPhase: activeWorkspace.streamTracking?.phase ?? 'idle',
  };
}

export function selectChatBoxState(state) {
  const activeWorkspace = selectActiveWorkspaceState(state);
  return {
    messages: activeWorkspace.messages,
    isSending: activeWorkspace.isSending,
    thinkingStatus: activeWorkspace.thinkingStatus,
    thinkingSourceEventType: activeWorkspace.thinkingSourceEventType,
    currentTurnProjection: activeWorkspace.currentTurnProjection,
  };
}
