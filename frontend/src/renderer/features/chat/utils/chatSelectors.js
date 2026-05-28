import { selectActiveWorkspaceState } from '../stores/chatWorkspaceState';

export function selectChatInterfaceState(state) {
  const activeWorkspace = selectActiveWorkspaceState(state);
  return {
    messages: activeWorkspace.messages,
    isSending: activeWorkspace.isSending,
    thinkingStatus: activeWorkspace.thinkingStatus,
    thinkingSourceEventType: activeWorkspace.thinkingSourceEventType,
    compactionDebugInfo: activeWorkspace.compactionDebugInfo,
    tokenCounts: activeWorkspace.tokenCounts,
    streamTracking: activeWorkspace.streamTracking,
    currentTurnProjection: activeWorkspace.currentTurnProjection,
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
