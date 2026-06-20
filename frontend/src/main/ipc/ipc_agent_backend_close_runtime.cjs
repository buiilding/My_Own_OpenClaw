/**
 * Handles Agent SDK backend close cleanup for Electron main.
 */

const INTERRUPTIBLE_BACKEND_CLOSE_PHASES = new Set([
  'awaiting-first-chunk',
  'streaming',
  'tool-call',
  'tool-output',
]);

function shouldInterruptActiveQueryOnClose({ activeQueryContext = null, activePhase = null } = {}) {
  return Boolean(
    activeQueryContext
    && INTERRUPTIBLE_BACKEND_CLOSE_PHASES.has(activePhase),
  );
}

function handleAgentBackendCloseEvent(event = {}, deps = {}) {
  const {
    setConnected = () => {},
    markInferenceContextsStale = () => {},
    resetSettingsSyncState = () => {},
    getResponseOverlayPhase = () => null,
    getActiveQueryContext = () => null,
    setActiveQueryContext = () => {},
    getCurrentSessionId = () => null,
    getCurrentServerUserId = () => null,
    getCurrentUserId = () => null,
    getQueryEventsCopy = () => ({}),
    buildQueryInterrupted = () => null,
    handleAgentBackendEvent = () => {},
    setResponseOverlayPhase = () => {},
    resetBackendSessionState = () => {},
    clearEventReplayState = () => {},
    log = () => {},
    broadcastConnectionStatus = () => {},
  } = deps;

  setConnected(false);
  markInferenceContextsStale();
  resetSettingsSyncState();

  const activePhase = getResponseOverlayPhase();
  const activeQueryContext = getActiveQueryContext();
  const hadInterruptedQuery = shouldInterruptActiveQueryOnClose({
    activeQueryContext,
    activePhase,
  });

  if (hadInterruptedQuery) {
    const interruptedEvent = buildQueryInterrupted({
      queryMessageId: activeQueryContext.queryMessageId,
      conversationRef: activeQueryContext.conversationRef,
      currentSessionId: getCurrentSessionId(),
      currentServerUserId: getCurrentServerUserId(),
      currentUserId: getCurrentUserId(),
      accepted: activeQueryContext.accepted,
      copy: getQueryEventsCopy(),
    });
    log(
      `Active query interrupted by backend disconnect `
      + `(turn_ref=${activeQueryContext.queryMessageId}, `
      + `accepted=${activeQueryContext.accepted ? 'true' : 'false'}).`,
    );
    handleAgentBackendEvent(interruptedEvent);
    setActiveQueryContext(null);
  } else {
    setResponseOverlayPhase('idle', 'ws-close');
  }

  resetBackendSessionState();
  clearEventReplayState();
  if (event.shouldReconnect) {
    log('Disconnected from agent backend. Attempting to reconnect...');
  } else {
    log(`Disconnected from agent backend (${event.closeReason || 'idle'}).`);
  }
  broadcastConnectionStatus(false);

  return {
    interrupted: hadInterruptedQuery,
  };
}

function createAgentBackendCloseRuntime(deps = {}) {
  function handle(event = {}) {
    return handleAgentBackendCloseEvent(event, deps);
  }

  return {
    handle,
  };
}

module.exports = {
  createAgentBackendCloseRuntime,
  handleAgentBackendCloseEvent,
  shouldInterruptActiveQueryOnClose,
};
