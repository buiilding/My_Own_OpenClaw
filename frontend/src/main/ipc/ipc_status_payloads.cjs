/**
 * Builds Electron main connection and client-session status payloads.
 */

function createIpcStatusPayloads(deps = {}) {
  const {
    getState = () => ({}),
    getRuntimeEndpointSnapshot = () => ({}),
    getGlobalAgentStopShortcutStatus = () => null,
  } = deps;

  function buildIpcStatusPayload(connected) {
    const state = getState();
    const endpoints = getRuntimeEndpointSnapshot();
    return {
      isConnected: connected,
      userId: state.currentUserId || null,
      runtimeWsUrl: endpoints.runtimeWsUrl || null,
      runtimeHttpUrl: endpoints.runtimeHttpUrl || null,
      globalAgentStopShortcutStatus: getGlobalAgentStopShortcutStatus(),
    };
  }

  function getClientSessionState() {
    const state = getState();
    return {
      currentUserId: state.currentUserId || null,
      currentConversationRef: state.currentConversationRef || null,
      currentServerUserId: state.currentServerUserId || null,
      currentSessionId: state.currentSessionId || null,
      isConnected: Boolean(state.isConnected),
      globalAgentStopShortcutStatus: getGlobalAgentStopShortcutStatus(),
    };
  }

  function getBackendConnectionState() {
    const state = getState();
    const endpoints = getRuntimeEndpointSnapshot();
    return {
      isConnected: Boolean(state.isConnected),
      userId: state.currentUserId || null,
      sessionId: state.currentSessionId || null,
      serverUserId: state.currentServerUserId || null,
      conversationRef: state.currentConversationRef || null,
      backendWsUrl: endpoints.runtimeWsUrl || null,
      backendHttpUrl: endpoints.runtimeHttpUrl || null,
      globalAgentStopShortcutStatus: getGlobalAgentStopShortcutStatus(),
    };
  }

  return {
    buildIpcStatusPayload,
    getClientSessionState,
    getBackendConnectionState,
    getRuntimeEndpointSnapshot,
  };
}

module.exports = {
  createIpcStatusPayloads,
};
