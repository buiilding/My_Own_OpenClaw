/**
 * Resolves main-process stop targets for SDK conversation turns.
 */

function readExactNonEmptyString(value) {
  return typeof value === 'string' && value && value.trim() === value ? value : null;
}

function isPendingTurn(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && readExactNonEmptyString(value.conversationRef)
      && readExactNonEmptyString(value.turnRef)
  );
}

function isStoppableConversationView(conversationView) {
  return Boolean(
    conversationView
      && typeof conversationView === 'object'
      && conversationView.liveTurn?.canStop === true
      && readExactNonEmptyString(conversationView.conversationRef)
      && readExactNonEmptyString(conversationView.liveTurn?.turnRef)
  );
}

function resolveMainStopTarget({
  latestConversationView = null,
  latestPendingTurn = null,
} = {}) {
  if (isStoppableConversationView(latestConversationView)) {
    return {
      source: 'conversation-view',
      conversationRef: readExactNonEmptyString(latestConversationView.conversationRef),
      turnRef: readExactNonEmptyString(latestConversationView.liveTurn?.turnRef),
      canStop: true,
    };
  }

  if (latestConversationView && typeof latestConversationView === 'object') {
    if (isPendingTurn(latestPendingTurn)) {
      return {
        source: 'pending-turn',
        conversationRef: readExactNonEmptyString(latestPendingTurn.conversationRef),
        turnRef: readExactNonEmptyString(latestPendingTurn.turnRef),
        canStop: true,
      };
    }
    return null;
  }

  if (isPendingTurn(latestPendingTurn)) {
    return {
      source: 'pending-turn',
      conversationRef: readExactNonEmptyString(latestPendingTurn.conversationRef),
      turnRef: readExactNonEmptyString(latestPendingTurn.turnRef),
      canStop: true,
    };
  }
  return null;
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
  getLatestPendingTurn,
  stopQueryThroughAgentSdkRuntime,
  setResponseOverlayPhase,
} = {}) {
  function resolve() {
    return resolveMainStopTarget({
      latestConversationView: typeof getLatestConversationView === 'function'
        ? getLatestConversationView()
        : null,
      latestPendingTurn: typeof getLatestPendingTurn === 'function'
        ? getLatestPendingTurn()
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
