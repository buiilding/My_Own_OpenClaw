/**
 * Handles client session snapshot and transcript session sync IPC events.
 */

const {
  applyTranscriptSessionSync,
} = require('./ipc_transcript_session_sync.cjs');

function buildClientSessionSnapshot({
  currentUserId = null,
  currentConversationRef = null,
  currentServerUserId = null,
  currentSessionId = null,
  isConnected = false,
  runtimeWsUrl = null,
  runtimeHttpUrl = null,
  globalAgentStopShortcutStatus = null,
} = {}) {
  return {
    userId: currentUserId,
    conversationRef: currentConversationRef,
    serverUserId: currentServerUserId,
    sessionId: currentSessionId,
    isConnected,
    runtimeWsUrl,
    runtimeHttpUrl,
    globalAgentStopShortcutStatus,
  };
}

function registerClientSessionHandlers({
  ipcMain,
  getClientSessionState,
  getRuntimeEndpointSnapshot,
  setTranscriptSessionState,
  broadcastToRenderers,
  applyTranscriptSync = applyTranscriptSessionSync,
}) {
  ipcMain.handle('get-client-user-id', async () => {
    const state = getClientSessionState();
    const endpoints = getRuntimeEndpointSnapshot();
    return buildClientSessionSnapshot({
      ...state,
      ...endpoints,
    });
  });

  ipcMain.on('transcript-session-sync', (event, payload = {}) => {
    const state = getClientSessionState();
    const syncResult = applyTranscriptSync({
      payload,
      sender: event?.sender || null,
      currentConversationRef: state.currentConversationRef,
      currentUserId: state.currentUserId,
      broadcastToRenderers,
    });
    if (!syncResult) {
      return;
    }

    setTranscriptSessionState({
      currentConversationRef: syncResult.nextConversationRef,
      currentUserId: syncResult.nextUserId,
    });
  });
}

function createClientSessionHandlersRuntime({
  getClientSessionState,
  getRuntimeEndpointSnapshot,
  setTranscriptSessionState,
  broadcastToRenderers,
  applyTranscriptSync = applyTranscriptSessionSync,
} = {}) {
  function register({ ipcMain } = {}) {
    return registerClientSessionHandlers({
      ipcMain,
      getClientSessionState,
      getRuntimeEndpointSnapshot,
      setTranscriptSessionState,
      broadcastToRenderers,
      applyTranscriptSync,
    });
  }

  return {
    register,
  };
}

module.exports = {
  createClientSessionHandlersRuntime,
};
