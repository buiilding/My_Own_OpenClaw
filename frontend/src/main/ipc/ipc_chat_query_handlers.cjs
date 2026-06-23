/**
 * Handles ipc chat query handlers events for the Electron main process.
 */

const {
  createRendererQuerySendRuntime,
} = require('./ipc_query_send_runtime.cjs');

function normalizePayload(payloadInput) {
  return (
    payloadInput
    && typeof payloadInput === 'object'
    && !Array.isArray(payloadInput)
  ) ? { ...payloadInput } : {};
}

function createChatQueryHandlers({
  getState,
  setCurrentConversationRef,
  setActiveQueryContext,
  setFirstQuery,
  attachAgentDefinitionContextToPayload,
  ensureInstallAuthState,
  isBackendRuntimeConnected,
  ensureBackendConnection,
  ensureInitialSettingsSync,
  getPendingSettingsSyncPromise,
  sendQueryThroughAgentSdkRuntime,
  stopQueryThroughAgentSdkRuntime,
  setResponseOverlayPhase,
  resolvePreferredArtifactHttpUrl,
  deps,
}) {
  const rendererQuerySendRuntime = createRendererQuerySendRuntime({ deps });

  async function handleRendererChatQuery(event, payloadInput = {}) {
    let payload = normalizePayload(payloadInput);
    let queryMessageId = null;
    let queryUsedInitialContext = false;
    const initialState = getState();

    if (!initialState.currentUserId) {
      try {
        await ensureInstallAuthState();
      } catch (error) {
        deps.log(`Failed to resolve authenticated user before query: ${error?.message || error}`);
      }
    }

    const state = getState();
    let preparedQuery = null;
    try {
      preparedQuery = await rendererQuerySendRuntime.prepare({
        event,
        payload,
        currentConversationRef: state.currentConversationRef,
        currentSessionId: state.currentSessionId,
        currentServerUserId: state.currentServerUserId,
        currentUserId: state.currentUserId,
        backendHttpUrl: resolvePreferredArtifactHttpUrl(),
        isFirstQuery: state.isFirstQuery,
      });
    } catch (error) {
      deps.log(`Rejected renderer query: ${error?.message || error}`);
      setResponseOverlayPhase('error', 'query-missing-conversation-ref');
      return { ok: false, error: error?.message || 'Rejected renderer query' };
    }

    setCurrentConversationRef(preparedQuery.conversationRef);
    queryMessageId = preparedQuery.queryMessageId;
    queryUsedInitialContext = preparedQuery.queryUsedInitialContext;
    setActiveQueryContext({
      queryMessageId,
      conversationRef: preparedQuery.conversationRef,
      accepted: false,
    });
    deps.log('Received query from renderer');
    deps.log('Complete user message built successfully');

    let agentRuntimeConnectionReady = true;
    if (!isBackendRuntimeConnected()) {
      try {
        await ensureBackendConnection('query');
      } catch (error) {
        agentRuntimeConnectionReady = false;
        deps.log(`Failed to connect Agent SDK runtime for query: ${error?.message || error}`);
      }
    }

    if (agentRuntimeConnectionReady) {
      await ensureInitialSettingsSync();
      const pendingSettingsSyncPromise = getPendingSettingsSyncPromise();
      if (pendingSettingsSyncPromise) {
        await pendingSettingsSyncPromise;
      }
    }

    let messageId = null;
    if (agentRuntimeConnectionReady) {
      payload = attachAgentDefinitionContextToPayload(preparedQuery.payload);
      deps.traceRendererQuery?.({
        payload,
        conversationRef: preparedQuery.conversationRef,
        queryMessageId,
      });
      messageId = await sendQueryThroughAgentSdkRuntime({
        payload,
        messageId: queryMessageId,
      });
    }

    const latestState = getState();
    if (!messageId) {
      setActiveQueryContext(null);
      rendererQuerySendRuntime.handleFailure({
        payload,
        queryMessageId,
        currentSessionId: latestState.currentSessionId,
        currentServerUserId: latestState.currentServerUserId,
        currentUserId: latestState.currentUserId,
        currentConversationRef: latestState.currentConversationRef,
      });
      return { ok: false, error: 'Failed to send query through Agent SDK runtime' };
    }

    if (queryUsedInitialContext) {
      setFirstQuery(false);
    }
    return { ok: true, messageId, queryMessageId };
  }

  async function handleRendererStopQuery(payloadInput = {}) {
    const payload = normalizePayload(payloadInput);
    const stopped = await stopQueryThroughAgentSdkRuntime(payload);
    setResponseOverlayPhase('complete', 'stop-query');
    return { ok: Boolean(stopped), stopped: Boolean(stopped) };
  }

  return {
    handleRendererChatQuery,
    handleRendererStopQuery,
  };
}

function createChatQueryHandlerRuntime({
  getState,
  setCurrentConversationRef,
  setActiveQueryContext,
  setFirstQuery,
  attachAgentDefinitionContextToPayload,
  ensureInstallAuthState,
  isBackendRuntimeConnected,
  ensureBackendConnection,
  ensureInitialSettingsSync,
  getPendingSettingsSyncPromise,
  sendQueryThroughAgentSdkRuntime,
  stopQueryThroughAgentSdkRuntime,
  setResponseOverlayPhase,
  resolvePreferredArtifactHttpUrl,
  deps: baseDeps = {},
} = {}) {
  function createHandlers({
    getWindows,
    onBeforeOverlayQueryCapture,
  } = {}) {
    return createChatQueryHandlers({
      getState,
      setCurrentConversationRef,
      setActiveQueryContext,
      setFirstQuery,
      attachAgentDefinitionContextToPayload,
      ensureInstallAuthState,
      isBackendRuntimeConnected,
      ensureBackendConnection,
      ensureInitialSettingsSync,
      getPendingSettingsSyncPromise,
      sendQueryThroughAgentSdkRuntime,
      stopQueryThroughAgentSdkRuntime,
      setResponseOverlayPhase,
      resolvePreferredArtifactHttpUrl,
      deps: {
        ...baseDeps,
        getWindows,
        onBeforeOverlayQueryCapture,
      },
    });
  }

  return {
    createHandlers,
  };
}

module.exports = {
  createChatQueryHandlerRuntime,
};
