/**
 * Owns Electron main Agent SDK backend event relay bookkeeping.
 */

function isObjectEvent(event) {
  return Boolean(event && typeof event === 'object' && !Array.isArray(event));
}

function eventMatchesActiveTurn(event, activeQueryContext) {
  return Boolean(
    isObjectEvent(event)
    && activeQueryContext
    && typeof event.turn_ref === 'string'
    && event.turn_ref === activeQueryContext.queryMessageId,
  );
}

function isTerminalBackendEvent(event) {
  return isObjectEvent(event) && (
    event.type === 'streaming-complete'
    || event.type === 'error'
  );
}

function handleAgentBackendEventRuntime(event, deps = {}) {
  const {
    getActiveQueryContext = () => null,
    setActiveQueryContext = () => {},
    appendForActiveTurn = () => {},
    clearEventReplayState = () => {},
    noteBackendTraffic = () => {},
    notifyBackendMessageObservers = () => {},
    processBackendMessageData,
    processBackendMessageDeps = {},
  } = deps;

  const activeContext = getActiveQueryContext();
  if (
    isObjectEvent(event)
    && event.type === 'query-accepted'
    && eventMatchesActiveTurn(event, activeContext)
  ) {
    activeContext.accepted = true;
  }

  appendForActiveTurn(event);
  noteBackendTraffic(`message:${event?.type || 'unknown'}`);
  notifyBackendMessageObservers(event);
  processBackendMessageData(event, processBackendMessageDeps);

  const nextActiveContext = getActiveQueryContext();
  if (
    isTerminalBackendEvent(event)
    && eventMatchesActiveTurn(event, nextActiveContext)
  ) {
    setActiveQueryContext(null);
    clearEventReplayState();
  }
}

function createAgentBackendEventRuntime(deps = {}) {
  function handle(event) {
    return handleAgentBackendEventRuntime(event, deps);
  }

  return {
    handle,
  };
}

module.exports = {
  createAgentBackendEventRuntime,
  eventMatchesActiveTurn,
  isTerminalBackendEvent,
};
