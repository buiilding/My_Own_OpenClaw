/**
 * Provides the chat selectors module for the renderer UI.
 */

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

export function selectLiveTurnSurfaceState(state) {
  const activeWorkspace = selectActiveWorkspaceState(state);
  return {
    messages: activeWorkspace.messages,
    isSending: activeWorkspace.isSending,
    thinkingStatus: activeWorkspace.thinkingStatus,
    thinkingSourceEventType: activeWorkspace.thinkingSourceEventType,
    currentTurnProjection: state.latestCurrentTurnProjection || activeWorkspace.currentTurnProjection,
  };
}
