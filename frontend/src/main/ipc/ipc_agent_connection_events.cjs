/**
 * Handles Agent SDK backend connection events for Electron main.
 */

function resolveHandshakeUserId(event = {}) {
  return event.handshake && typeof event.handshake.user_id === 'string'
    ? event.handshake.user_id
    : null;
}

function stringifyErrorMessage(error) {
  return JSON.stringify(error?.message || String(error || 'unknown'));
}

function handleAgentConnectionEvent(event = {}, deps = {}) {
  const {
    getCurrentUserId = () => null,
    setCurrentServerUserId = () => {},
    setConnected = () => {},
    setFirstQuery = () => {},
    traceBackendConnection = () => {},
    resetSettingsSyncState = () => {},
    setResponseOverlayPhase = () => {},
    clearEventReplayState = () => {},
    logMainRuntime = () => {},
    log = () => {},
    broadcastConnectionStatus = () => {},
    handleAgentBackendClose = () => {},
  } = deps;

  if (event.type === 'open') {
    const handshakeUserId = resolveHandshakeUserId(event);
    if (handshakeUserId) {
      setCurrentServerUserId(handshakeUserId);
    }
    setConnected(true);
    setFirstQuery(true);
    traceBackendConnection(event);
    resetSettingsSyncState();
    setResponseOverlayPhase('idle', 'ws-open');
    clearEventReplayState();
    logMainRuntime(`[Main][Backend] connected user=${handshakeUserId || getCurrentUserId() || 'unknown'}`);
    log('Successfully connected to agent backend through Agent SDK runtime.');
    log(`Handshake sent with authenticated user_id: ${handshakeUserId || getCurrentUserId() || 'unknown'}`);
    broadcastConnectionStatus(true);
    return;
  }

  if (event.type === 'close') {
    traceBackendConnection(event);
    logMainRuntime(`[Main][Backend] closed code=${event.code ?? 'unknown'} reason=${event.reason || 'unknown'}`);
    handleAgentBackendClose(event);
    return;
  }

  if (event.type === 'error') {
    traceBackendConnection(event);
    logMainRuntime(`[Main][Backend] error message=${stringifyErrorMessage(event.error)}`);
    log(`WebSocket error: ${event.error?.message || event.error}`);
    return;
  }

  if (event.type === 'handshake-error') {
    traceBackendConnection(event);
    logMainRuntime(`[Main][Backend] handshake_error message=${stringifyErrorMessage(event.error)}`);
    log(`Error sending handshake: ${event.error}`);
    return;
  }

  if (event.type === 'message-error') {
    traceBackendConnection(event);
    logMainRuntime(`[Main][Backend] message_error message=${stringifyErrorMessage(event.error)}`);
    log(`Error parsing message from backend: ${event.error}`);
  }
}

function resolveBackendFallbackIndex(endpointPayload = {}, candidates = []) {
  return candidates.findIndex(candidate => (
    candidate.wsUrl === endpointPayload.wsUrl
    || candidate.httpUrl === endpointPayload.httpBaseUrl
    || candidate.httpUrl === endpointPayload.httpUrl
    || candidate.httpUrl === endpointPayload.backendUrl
  ));
}

function handleAgentBackendFallbackEvent(endpointPayload = {}, deps = {}) {
  const {
    getEndpointCandidates = () => [],
    setActiveBackendEndpoint = () => {},
    advanceToNextBackendEndpoint = () => {},
    getCurrentEndpoint = () => ({}),
    logMainRuntime = () => {},
    log = () => {},
  } = deps;
  const candidates = getEndpointCandidates();
  const fallbackIndex = resolveBackendFallbackIndex(endpointPayload, candidates);
  if (fallbackIndex >= 0) {
    setActiveBackendEndpoint(fallbackIndex);
  } else {
    advanceToNextBackendEndpoint();
  }
  const endpoint = getCurrentEndpoint();
  logMainRuntime(`[Main][Backend] fallback ws=${endpoint.wsUrl}`);
  log(`Primary backend unavailable. Falling back to ${endpoint.wsUrl}.`);
}

function createAgentConnectionEventsRuntime(deps = {}) {
  function handleConnection(event = {}) {
    return handleAgentConnectionEvent(event, deps);
  }

  function handleBackendFallback(endpointPayload = {}) {
    return handleAgentBackendFallbackEvent(endpointPayload, deps);
  }

  return {
    handleBackendFallback,
    handleConnection,
  };
}

module.exports = {
  createAgentConnectionEventsRuntime,
  handleAgentBackendFallbackEvent,
  handleAgentConnectionEvent,
  resolveBackendFallbackIndex,
  resolveHandshakeUserId,
};
