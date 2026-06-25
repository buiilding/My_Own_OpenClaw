/**
 * Owns Electron-main cached SDK live-turn and pending-turn state.
 */

function createIpcLiveTurnState({
  initialCurrentTurn = null,
  initialConversationView = null,
  initialPendingTurn = null,
} = {}) {
  let latestCurrentTurnProjection = initialCurrentTurn;
  let latestConversationView = initialConversationView;
  let latestPendingTurn = initialPendingTurn;

  function getLatestCurrentTurn() {
    return latestCurrentTurnProjection;
  }

  function setLatestCurrentTurn(currentTurnProjection) {
    latestCurrentTurnProjection = currentTurnProjection;
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
    latestCurrentTurnProjection = null;
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
