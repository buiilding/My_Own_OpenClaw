/**
 * Owns Electron-main cached SDK live-turn and pending-turn state.
 */

function createIpcLiveTurnState({
  initialCurrentTurn = null,
  initialPendingTurn = null,
} = {}) {
  let latestCurrentTurnProjection = initialCurrentTurn;
  let latestPendingTurn = initialPendingTurn;
  let supersededTurnRefs = {};

  function normalizeTurnRef(turnRef) {
    return typeof turnRef === 'string' && turnRef.trim() ? turnRef.trim() : null;
  }

  function addSupersededTurnRef(turnRef) {
    const normalizedTurnRef = normalizeTurnRef(turnRef);
    if (!normalizedTurnRef || supersededTurnRefs[normalizedTurnRef]) {
      return false;
    }
    supersededTurnRefs = {
      ...supersededTurnRefs,
      [normalizedTurnRef]: true,
    };
    return true;
  }

  function removeSupersededTurnRef(turnRef) {
    const normalizedTurnRef = normalizeTurnRef(turnRef);
    if (!normalizedTurnRef || !supersededTurnRefs[normalizedTurnRef]) {
      return false;
    }
    const next = { ...supersededTurnRefs };
    delete next[normalizedTurnRef];
    supersededTurnRefs = next;
    return true;
  }

  function isSupersededTurnRef(turnRef) {
    const normalizedTurnRef = normalizeTurnRef(turnRef);
    return Boolean(normalizedTurnRef && supersededTurnRefs[normalizedTurnRef]);
  }

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
    if (pendingTurn && typeof pendingTurn === 'object') {
      addSupersededTurnRef(pendingTurn.supersededTurnRef);
      removeSupersededTurnRef(pendingTurn.turnRef);
    }
  }

  function reset() {
    latestCurrentTurnProjection = null;
    latestPendingTurn = null;
    supersededTurnRefs = {};
  }

  function resetPendingTurn() {
    latestPendingTurn = null;
  }

  return {
    addSupersededTurnRef,
    getLatestCurrentTurn,
    getLatestPendingTurn,
    isSupersededTurnRef,
    removeSupersededTurnRef,
    reset,
    resetPendingTurn,
    setLatestCurrentTurn,
    setLatestPendingTurn,
  };
}

module.exports = {
  createIpcLiveTurnState,
};
