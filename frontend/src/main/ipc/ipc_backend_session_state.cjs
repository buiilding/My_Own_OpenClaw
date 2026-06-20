/**
 * Owns Electron-main cached backend session identity.
 */

function createBackendSessionState({
  initialSessionId = null,
  initialServerUserId = null,
  initialConversationRef = null,
} = {}) {
  let currentSessionId = initialSessionId;
  let currentServerUserId = initialServerUserId;
  let currentConversationRef = initialConversationRef;

  function getSessionId() {
    return currentSessionId;
  }

  function setSessionId(sessionId) {
    currentSessionId = sessionId;
  }

  function getServerUserId() {
    return currentServerUserId;
  }

  function setServerUserId(serverUserId) {
    currentServerUserId = serverUserId;
  }

  function getConversationRef() {
    return currentConversationRef;
  }

  function setConversationRef(conversationRef) {
    currentConversationRef = conversationRef;
  }

  function getSnapshot() {
    return {
      currentConversationRef,
      currentServerUserId,
      currentSessionId,
    };
  }

  function reset() {
    currentSessionId = null;
    currentServerUserId = null;
    currentConversationRef = null;
  }

  return {
    getConversationRef,
    getServerUserId,
    getSessionId,
    getSnapshot,
    reset,
    setConversationRef,
    setServerUserId,
    setSessionId,
  };
}

module.exports = {
  createBackendSessionState,
};
