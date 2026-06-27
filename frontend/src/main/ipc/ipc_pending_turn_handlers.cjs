/**
 * Handles pending-turn IPC events for the Electron main process.
 */

const {
  DESKTOP_RUNTIME_SEND_CHANNELS,
  DESKTOP_RUNTIME_ON_CHANNELS,
} = require('./ipc_desktop_runtime_channels.cjs');

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizePendingTurnPayload(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const pendingTurn = source.pendingTurn && typeof source.pendingTurn === 'object'
    ? source.pendingTurn
    : source;
  const conversationRef = normalizeOptionalString(pendingTurn.conversationRef);
  const turnRef = normalizeOptionalString(pendingTurn.turnRef);
  const userMessageId = normalizeOptionalString(pendingTurn.userMessageId);
  const text = typeof pendingTurn.text === 'string' ? pendingTurn.text : null;
  const timestamp = typeof pendingTurn.timestamp === 'string' && pendingTurn.timestamp.trim()
    ? pendingTurn.timestamp
    : null;
  if (!conversationRef || !turnRef || !userMessageId || text === null || !timestamp) {
    return null;
  }
  return {
    conversationRef,
    turnRef,
    userMessageId,
    text,
    timestamp,
  };
}

function pendingTurnMatchesCurrentTurn(pendingTurn, currentTurn) {
  return Boolean(
    pendingTurn
      && currentTurn
      && pendingTurn.conversationRef === currentTurn.conversationRef
      && pendingTurn.turnRef === currentTurn.turnRef,
  );
}

function pendingTurnMatchesTarget(pendingTurn, input = {}) {
  if (!pendingTurn) {
    return false;
  }
  const conversationRef = normalizeOptionalString(input.conversationRef);
  const turnRef = normalizeOptionalString(input.turnRef);
  return (
    (!conversationRef || pendingTurn.conversationRef === conversationRef)
    && (!turnRef || pendingTurn.turnRef === turnRef)
  );
}

function clearPendingTurnState({
  getLatestPendingTurn,
  setLatestPendingTurn,
  broadcastToRenderers,
  broadcast = false,
  conversationRef = null,
  turnRef = null,
} = {}) {
  const pendingTurn = typeof getLatestPendingTurn === 'function'
    ? getLatestPendingTurn()
    : null;
  if (!pendingTurn || !pendingTurnMatchesTarget(pendingTurn, { conversationRef, turnRef })) {
    return false;
  }
  setLatestPendingTurn(null);
  if (broadcast === true) {
    broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.PENDING_TURN, {
      type: 'clear',
      conversationRef: normalizeOptionalString(conversationRef) || pendingTurn.conversationRef,
      turnRef: normalizeOptionalString(turnRef) || pendingTurn.turnRef,
    });
  }
  return true;
}

function registerPendingTurnHandlers({
  ipcMain,
  setLatestPendingTurn,
  clearLatestPendingTurn,
  broadcastToRenderers,
}) {
  ipcMain.on(DESKTOP_RUNTIME_SEND_CHANNELS.PENDING_TURN, (_event, payload = {}) => {
    const source = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : {};
    if (source.type === 'clear') {
      if (
        Object.prototype.hasOwnProperty.call(source, 'conversation_ref')
        || Object.prototype.hasOwnProperty.call(source, 'turn_ref')
      ) {
        return;
      }
      const conversationRef = normalizeOptionalString(source.conversationRef);
      const turnRef = normalizeOptionalString(source.turnRef);
      clearLatestPendingTurn({ conversationRef, turnRef });
      broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.PENDING_TURN, {
        type: 'clear',
        conversationRef,
        turnRef,
      });
      return;
    }
    const pendingTurn = normalizePendingTurnPayload(source);
    if (!pendingTurn) {
      return;
    }
    setLatestPendingTurn(pendingTurn);
    broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.PENDING_TURN, {
      type: 'pending',
      pendingTurn,
    });
  });
}

function createPendingTurnRuntime({
  liveTurnState,
  broadcastToRenderers,
} = {}) {
  function getLatestPendingTurn() {
    return typeof liveTurnState?.getLatestPendingTurn === 'function'
      ? liveTurnState.getLatestPendingTurn()
      : null;
  }

  function setLatestPendingTurn(pendingTurn) {
    if (typeof liveTurnState?.setLatestPendingTurn === 'function') {
      liveTurnState.setLatestPendingTurn(pendingTurn);
    }
  }

  function clear(input = {}) {
    return clearPendingTurnState({
      ...input,
      getLatestPendingTurn,
      setLatestPendingTurn,
      broadcastToRenderers,
    });
  }

  function register({ ipcMain } = {}) {
    registerPendingTurnHandlers({
      ipcMain,
      setLatestPendingTurn,
      clearLatestPendingTurn: clear,
      broadcastToRenderers,
    });
  }

  function matchesCurrentTurn(pendingTurn, currentTurn) {
    return pendingTurnMatchesCurrentTurn(pendingTurn, currentTurn);
  }

  return {
    clear,
    matchesCurrentTurn,
    register,
  };
}

module.exports = {
  createPendingTurnRuntime,
};
