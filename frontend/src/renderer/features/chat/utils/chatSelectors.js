import { selectActiveWorkspaceState } from '../stores/chatWorkspaceState';
import { replaceCurrentTurnMessagesWithProjection } from './state/chatBoxResponseState';

function projectDashboardMessages(activeWorkspace) {
  return replaceCurrentTurnMessagesWithProjection(
    activeWorkspace.messages,
    activeWorkspace.currentTurnProjection,
  );
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
