/**
 * Composes Electron-main client/backend session context snapshots.
 */

function call(target, method, fallback = null) {
  if (target && typeof target[method] === 'function') {
    return target[method]();
  }
  return fallback;
}

function createIpcSessionContextRuntime({
  backendSessionState,
  installAuthContextRuntime,
  backendConnectionGateState,
  getActiveAgent = () => null,
} = {}) {
  function getCurrentUserId() {
    return call(installAuthContextRuntime, 'getCurrentUserId');
  }

  function getBackendSnapshot() {
    const snapshot = call(backendSessionState, 'getSnapshot', {});
    return snapshot && typeof snapshot === 'object' ? snapshot : {};
  }

  function getStatusState() {
    return {
      currentUserId: getCurrentUserId(),
      ...getBackendSnapshot(),
      isConnected: Boolean(call(backendConnectionGateState, 'getConnected', false)),
    };
  }

  function getQueryState() {
    return {
      ...getBackendSnapshot(),
      currentUserId: getCurrentUserId(),
      isFirstQuery: Boolean(call(backendConnectionGateState, 'getFirstQuery', true)),
    };
  }

  function getAgentSdkInvokeState() {
    return {
      currentConversationRef: call(backendSessionState, 'getConversationRef'),
      currentSessionId: call(backendSessionState, 'getSessionId'),
      currentUserId: getCurrentUserId(),
      isConnected: Boolean(call(backendConnectionGateState, 'getConnected', false)),
      agent: getActiveAgent(),
    };
  }

  function setTranscriptSessionState({
    currentConversationRef = null,
    currentUserId = null,
  } = {}) {
    if (backendSessionState && typeof backendSessionState.setConversationRef === 'function') {
      backendSessionState.setConversationRef(currentConversationRef);
    }
    if (
      installAuthContextRuntime
      && typeof installAuthContextRuntime.setCurrentUserId === 'function'
    ) {
      installAuthContextRuntime.setCurrentUserId(currentUserId);
    }
  }

  return {
    getAgentSdkInvokeState,
    getCurrentUserId,
    getQueryState,
    getStatusState,
    setTranscriptSessionState,
  };
}

module.exports = {
  createIpcSessionContextRuntime,
};
