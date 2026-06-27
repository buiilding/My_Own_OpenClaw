/**
 * Owns Electron-main cached SDK live-turn and pending-turn state.
 */

function createIpcLiveTurnState({
  initialSdkLiveTurn = null,
  initialConversationView = null,
  initialPendingTurn = null,
} = {}) {
  let latestSdkLiveTurn = initialSdkLiveTurn;
  let latestConversationView = initialConversationView;
  let latestPendingTurn = initialPendingTurn;

  function getLatestCurrentTurn() {
    return latestSdkLiveTurn;
  }

  function setLatestCurrentTurn(sdkLiveTurn) {
    latestSdkLiveTurn = sdkLiveTurn;
  }

  function getLatestConversationView() {
    return latestConversationView;
  }

  function setLatestConversationView(conversationView) {
    latestConversationView = conversationView;
  }

  function getLatestPendingTurn() {
    return latestPendingTurn;
  }

  function setLatestPendingTurn(pendingTurn) {
    latestPendingTurn = pendingTurn;
  }

  function reset() {
    latestSdkLiveTurn = null;
    latestConversationView = null;
    latestPendingTurn = null;
  }

  function resetPendingTurn() {
    latestPendingTurn = null;
  }

  return {
    getLatestConversationView,
    getLatestCurrentTurn,
    getLatestPendingTurn,
    reset,
    resetPendingTurn,
    setLatestConversationView,
    setLatestCurrentTurn,
    setLatestPendingTurn,
  };
}

module.exports = {
  createIpcLiveTurnState,
};
