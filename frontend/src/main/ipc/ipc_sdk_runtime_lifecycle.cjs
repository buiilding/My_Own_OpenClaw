function createSdkRuntimeLifecycle({
  WebSocketImpl,
  createMessageId,
  createWindieSdkMainRuntime,
  buildWindieSdkMainHandshake,
  buildQueryInterrupted,
  persistMemoryStoreEvent,
  processBackendMessageData,
  normalizeBackendPayload,
  executeToolForBackend,
  storeMemory,
  getEndpoint,
  getHeaders,
  beforeConnect,
  getOperatingSystem,
  getFrontendConfig,
  getUserId,
  getCurrentConversationRef,
  getCurrentSessionId,
  getCurrentServerUserId,
  getActiveQueryContext,
  setActiveQueryContext,
  markActiveQueryAccepted,
  setConnected,
  setFirstQuery,
  resetSettingsSyncState,
  resetBackendSessionState,
  getResponseOverlayPhase,
  setResponseOverlayPhase,
  shouldHoldOpen,
  advanceEndpoint,
  appendReplayEvent,
  clearReplayEvents,
  noteBackendTraffic,
  notifyBackendMessageObservers,
  resolveSettingsSync,
  setCurrentSessionId,
  setCurrentServerUserId,
  setCurrentConversationRef,
  broadcastToRenderers,
  broadcastConnectionStatus,
  flushPendingListModelsRequest,
  connectTimeoutMs,
  reconnectIntervalMs,
  idleDisconnectTimeoutMs,
  log,
}) {
  let runtime = null;

  async function buildHandshake() {
    return buildWindieSdkMainHandshake({
      userId: getUserId(),
      operatingSystem: getOperatingSystem(),
      frontendConfig: getFrontendConfig(),
      log,
    });
  }

  function handleEvent(rendererData) {
    const activeQueryContext = getActiveQueryContext();
    if (
      rendererData
      && typeof rendererData === 'object'
      && rendererData.type === 'query-accepted'
      && activeQueryContext
      && typeof rendererData.turn_ref === 'string'
      && rendererData.turn_ref === activeQueryContext.queryMessageId
    ) {
      markActiveQueryAccepted();
    }
    appendReplayEvent(rendererData);
    noteBackendTraffic(`message:${rendererData?.type || 'unknown'}`);
    notifyBackendMessageObservers(rendererData);
    processBackendMessageData(rendererData, {
      setCurrentSessionId,
      setCurrentServerUserId,
      setCurrentConversationRef,
      resolveSettingsSync,
      setResponseOverlayPhase,
      getResponseOverlayPhase,
      onMemoryStoreEvent: (eventData) => {
        persistMemoryStoreEvent(eventData, { storeMemory, log });
      },
      broadcastToRenderers,
      log,
    });

    const currentActiveQueryContext = getActiveQueryContext();
    if (
      currentActiveQueryContext
      && rendererData
      && typeof rendererData === 'object'
      && typeof rendererData.turn_ref === 'string'
      && rendererData.turn_ref === currentActiveQueryContext.queryMessageId
      && (rendererData.type === 'streaming-complete' || rendererData.type === 'error')
    ) {
      setActiveQueryContext(null);
      clearReplayEvents();
    }
  }

  function getRuntime() {
    if (runtime) {
      return runtime;
    }
    runtime = createWindieSdkMainRuntime({
      WebSocketImpl,
      createMessageId,
      getEndpoint,
      getHeaders,
      beforeConnect,
      shouldHoldOpen,
      buildHandshake,
      executeLocalTool: executeToolForBackend,
      getUserId,
      getCurrentConversationRef,
      normalizePayload: normalizeBackendPayload,
      advanceEndpoint,
      connectTimeoutMs,
      reconnectIntervalMs,
      idleDisconnectTimeoutMs,
      onOpen: () => {
        setConnected(true);
        setFirstQuery(true);
        resetSettingsSyncState();
        setResponseOverlayPhase('idle', 'ws-open');
        clearReplayEvents();
        log('Successfully connected to Python backend through Windie SDK runtime.');
        log(`Handshake sent with authenticated user_id: ${getUserId()}`);
        broadcastConnectionStatus(true);
        flushPendingListModelsRequest();
      },
      onHandshakeError: (error) => {
        log(`Error sending handshake: ${error}`);
      },
      onEvent: handleEvent,
      onConversationRuntimeUpdated: (payload) => {
        broadcastToRenderers('conversation-runtime-updated', payload);
      },
      onConversationEvent: ({ conversationEvent }) => {
        broadcastToRenderers('conversation-event', conversationEvent);
      },
      onMessageError: (error) => {
        log(`Error parsing message from backend: ${error}`);
      },
      onClose: ({ closeReason, shouldReconnect }) => {
        setConnected(false);
        resetSettingsSyncState();
        const activePhase = getResponseOverlayPhase();
        const activeQueryContext = getActiveQueryContext();
        const hadInterruptedQuery = Boolean(
          activeQueryContext
          && (
            activePhase === 'awaiting-first-chunk'
            || activePhase === 'streaming'
            || activePhase === 'tool-call'
            || activePhase === 'tool-output'
          ),
        );
        if (hadInterruptedQuery) {
          const interruptedEvent = buildQueryInterrupted({
            queryMessageId: activeQueryContext.queryMessageId,
            conversationRef: activeQueryContext.conversationRef,
            currentSessionId: getCurrentSessionId(),
            currentServerUserId: getCurrentServerUserId(),
            currentUserId: getUserId(),
            accepted: activeQueryContext.accepted,
          });
          log(
            `Active query interrupted by backend disconnect `
            + `(turn_ref=${activeQueryContext.queryMessageId}, `
            + `accepted=${activeQueryContext.accepted ? 'true' : 'false'}).`,
          );
          handleEvent(interruptedEvent);
          setActiveQueryContext(null);
        } else {
          setResponseOverlayPhase('idle', 'ws-close');
        }
        resetBackendSessionState();
        clearReplayEvents();
        if (shouldReconnect) {
          log('Disconnected from Python backend. Attempting to reconnect...');
        } else {
          log(`Disconnected from Python backend (${closeReason || 'idle'}).`);
        }
        broadcastConnectionStatus(false);
      },
      onError: ({ error }) => {
        log(`WebSocket error: ${error.message}`);
      },
      onFallback: () => {
        log(`Primary backend unavailable. Falling back to ${getEndpoint().wsUrl}.`);
      },
      onSend: (type) => {
        noteBackendTraffic(`send:${type}`);
      },
      log,
    });
    return runtime;
  }

  function isRuntimeOpen() {
    return Boolean(runtime?.isOpen?.());
  }

  function closeRuntime(reason) {
    const currentRuntime = runtime;
    runtime = null;
    currentRuntime?.close?.(reason);
  }

  return {
    buildHandshake,
    handleEvent,
    getRuntime,
    isRuntimeOpen,
    closeRuntime,
  };
}

module.exports = {
  createSdkRuntimeLifecycle,
};
