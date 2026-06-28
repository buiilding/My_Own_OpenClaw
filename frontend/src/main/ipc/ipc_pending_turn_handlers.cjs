/**
 * Handles pending-turn IPC events for the Electron main process.
 */

const {
  DESKTOP_RUNTIME_SEND_CHANNELS,
  DESKTOP_RUNTIME_ON_CHANNELS,
} = require('./ipc_desktop_runtime_channels.cjs');

function readExactOptionalString(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

const PENDING_TURN_FIELDS = new Set([
  'conversationRef',
  'text',
  'timestamp',
  'turnRef',
  'userMessageId',
]);

const PENDING_TURN_CLEAR_FIELDS = new Set([
  'conversationRef',
  'turnRef',
  'type',
]);

function hasOnlyPendingTurnFields(source) {
  return Object.keys(source).every((key) => PENDING_TURN_FIELDS.has(key));
}

function hasOnlyPendingTurnClearFields(source) {
  return Object.keys(source).every((key) => PENDING_TURN_CLEAR_FIELDS.has(key));
}

function normalizePendingTurnPayload(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const pendingTurn = source.pendingTurn && typeof source.pendingTurn === 'object'
    ? source.pendingTurn
    : source;
  if (!hasOnlyPendingTurnFields(pendingTurn)) {
    return null;
  }
  const conversationRef = readExactOptionalString(pendingTurn.conversationRef);
  const turnRef = readExactOptionalString(pendingTurn.turnRef);
  const userMessageId = readExactOptionalString(pendingTurn.userMessageId);
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
  const hasConversationRefFilter = Object.prototype.hasOwnProperty.call(input, 'conversationRef')
    && input.conversationRef !== null
    && input.conversationRef !== undefined;
  const hasTurnRefFilter = Object.prototype.hasOwnProperty.call(input, 'turnRef')
    && input.turnRef !== null
    && input.turnRef !== undefined;
  const conversationRef = readExactOptionalString(input.conversationRef);
  const turnRef = readExactOptionalString(input.turnRef);
  if (
    (hasConversationRefFilter && !conversationRef)
    || (hasTurnRefFilter && !turnRef)
  ) {
    return false;
  }
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
      conversationRef: readExactOptionalString(conversationRef) || pendingTurn.conversationRef,
      turnRef: readExactOptionalString(turnRef) || pendingTurn.turnRef,
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
      if (!hasOnlyPendingTurnClearFields(source)) {
        return;
      }
      if (
        Object.prototype.hasOwnProperty.call(source, 'conversation_ref')
        || Object.prototype.hasOwnProperty.call(source, 'turn_ref')
      ) {
        return;
      }
      const conversationRef = readExactOptionalString(source.conversationRef);
      const turnRef = readExactOptionalString(source.turnRef);
      if (
        (source.conversationRef !== null && source.conversationRef !== undefined && !conversationRef)
        || (source.turnRef !== null && source.turnRef !== undefined && !turnRef)
      ) {
        return;
      }
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
