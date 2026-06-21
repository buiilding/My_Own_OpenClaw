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
  return (
    STOPPABLE_CURRENT_TURN_PHASES.has(phase)
    || currentTurnProjection.presentation?.isBusy === true
  );
}

function resolveMainStopTarget({
  latestCurrentTurnProjection = null,
  latestPendingTurn = null,
  currentConversationRef = null,
} = {}) {
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
  if (latestPendingTurn) {
    return {
      source: 'pending-turn',
      conversationRef: latestPendingTurn.conversationRef,
      turnRef: latestPendingTurn.turnRef,
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
  getLatestCurrentTurnProjection,
  getLatestPendingTurn,
  getCurrentConversationRef,
  stopQueryThroughAgentSdkRuntime,
  setResponseOverlayPhase,
} = {}) {
  function resolve() {
    return resolveMainStopTarget({
      latestCurrentTurnProjection: getLatestCurrentTurnProjection(),
      latestPendingTurn: getLatestPendingTurn(),
      currentConversationRef: getCurrentConversationRef(),
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
