/**
 * Owns Electron-main cached SDK live-turn and pending-turn state.
 */

function createIpcLiveTurnState({
  initialCurrentTurn = null,
  initialPendingTurn = null,
} = {}) {
  let latestCurrentTurnProjection = initialCurrentTurn;
  let latestPendingTurn = initialPendingTurn;

  function getLatestCurrentTurn() {
    return latestCurrentTurnProjection;
  }

  function setLatestCurrentTurn(currentTurnProjection) {
    latestCurrentTurnProjection = currentTurnProjection;
  }

  function getLatestPendingTurn() {
    return latestPendingTurn;
  }

  function setLatestPendingTurn(pendingTurn) {
    latestPendingTurn = pendingTurn;
  }

  function reset() {
    latestCurrentTurnProjection = null;
    latestPendingTurn = null;
  }

  function resetPendingTurn() {
    latestPendingTurn = null;
  }

  return {
    getLatestCurrentTurn,
    getLatestPendingTurn,
    reset,
    resetPendingTurn,
    setLatestCurrentTurn,
    setLatestPendingTurn,
  };
}

module.exports = {
  createIpcLiveTurnState,
};
