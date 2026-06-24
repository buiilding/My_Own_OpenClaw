/**
 * Resolves main-process stop targets for SDK conversation turns.
 */

const STOPPABLE_CURRENT_TURN_PHASES = new Set([
  'awaiting',
  'streaming',
  'tool_call',
  'tool_output',
]);

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isStoppableCurrentTurnProjection(currentTurnProjection) {
  if (!currentTurnProjection || typeof currentTurnProjection !== 'object') {
    return false;
  }
  const phase = normalizeOptionalString(currentTurnProjection.phase);
  return STOPPABLE_CURRENT_TURN_PHASES.has(phase);
}

function isPendingTurn(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && normalizeOptionalString(value.conversationRef)
      && normalizeOptionalString(value.turnRef)
  );
}

function isStoppableConversationView(conversationView) {
  return Boolean(
    conversationView
      && typeof conversationView === 'object'
      && conversationView.liveTurn?.canStop === true
      && normalizeOptionalString(conversationView.conversationRef)
      && normalizeOptionalString(conversationView.liveTurn?.turnRef)
  );
}

function resolveMainStopTarget({
  latestConversationView = null,
  latestCurrentTurnProjection = null,
  latestPendingTurn = null,
  currentConversationRef = null,
} = {}) {
  if (isStoppableConversationView(latestConversationView)) {
    return {
      source: 'conversation-view',
      conversationRef: normalizeOptionalString(latestConversationView.conversationRef),
      turnRef: normalizeOptionalString(latestConversationView.liveTurn?.turnRef),
      canStop: true,
    };
  }

  if (latestConversationView && typeof latestConversationView === 'object') {
    if (isPendingTurn(latestPendingTurn)) {
      return {
        source: 'pending-turn',
        conversationRef: normalizeOptionalString(latestPendingTurn.conversationRef),
        turnRef: normalizeOptionalString(latestPendingTurn.turnRef),
        canStop: true,
      };
    }
    return {
      source: 'idle',
      conversationRef: normalizeOptionalString(latestConversationView.conversationRef)
        || normalizeOptionalString(currentConversationRef),
      turnRef: normalizeOptionalString(latestConversationView.liveTurn?.turnRef),
      canStop: false,
    };
  }

  if (isStoppableCurrentTurnProjection(latestCurrentTurnProjection)) {
    const conversationRef = normalizeOptionalString(latestCurrentTurnProjection.conversationRef)
      || normalizeOptionalString(currentConversationRef);
    return {
      source: 'sdk-current-turn',
      conversationRef,
      turnRef: normalizeOptionalString(latestCurrentTurnProjection.turnRef),
      canStop: Boolean(conversationRef),
    };
  }
  if (isPendingTurn(latestPendingTurn)) {
    return {
      source: 'pending-turn',
      conversationRef: normalizeOptionalString(latestPendingTurn.conversationRef),
      turnRef: normalizeOptionalString(latestPendingTurn.turnRef),
      canStop: true,
    };
  }
  const conversationRef = normalizeOptionalString(currentConversationRef);
  return {
    source: 'idle',
    conversationRef,
    turnRef: null,
    canStop: Boolean(conversationRef),
  };
}

async function triggerMainStopTarget({
  stopTarget,
  stopQueryThroughAgentSdkRuntime,
  setResponseOverlayPhase,
} = {}) {
  if (!stopTarget?.canStop) {
    return false;
  }
  if (typeof stopQueryThroughAgentSdkRuntime !== 'function') {
    throw new Error('Main stop target runtime requires stopQueryThroughAgentSdkRuntime');
  }
  const stopped = await stopQueryThroughAgentSdkRuntime({
    conversation_ref: stopTarget.conversationRef,
    turn_ref: stopTarget.turnRef,
  });
  if (!stopped) {
    return false;
  }
  if (typeof setResponseOverlayPhase === 'function') {
    setResponseOverlayPhase('complete', 'stop-query');
  }
  return true;
}

function createMainStopTargetRuntime({
  getLatestConversationView,
  getLatestCurrentTurnProjection,
  getLatestPendingTurn,
  getCurrentConversationRef,
  stopQueryThroughAgentSdkRuntime,
  setResponseOverlayPhase,
} = {}) {
  function resolve() {
    return resolveMainStopTarget({
      latestConversationView: typeof getLatestConversationView === 'function'
        ? getLatestConversationView()
        : null,
      latestCurrentTurnProjection: typeof getLatestCurrentTurnProjection === 'function'
        ? getLatestCurrentTurnProjection()
        : null,
      latestPendingTurn: typeof getLatestPendingTurn === 'function'
        ? getLatestPendingTurn()
        : null,
      currentConversationRef: typeof getCurrentConversationRef === 'function'
        ? getCurrentConversationRef()
        : null,
    });
  }

  function trigger() {
    return triggerMainStopTarget({
      stopTarget: resolve(),
      stopQueryThroughAgentSdkRuntime,
      setResponseOverlayPhase,
    });
  }

  return {
    resolve,
    trigger,
  };
}

module.exports = {
  createMainStopTargetRuntime,
};
