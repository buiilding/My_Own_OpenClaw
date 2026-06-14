/**
 * Handles ipc chat query handlers events for the Electron main process.
 */

const {
  handleRendererQuerySendFailure,
  prepareRendererQuerySend,
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
  attachAgentDefinitionContext,
  ensureInstallAuthState,
  isBackendRuntimeConnected,
  ensureBackendConnection,
  ensureInitialSettingsSync,
  getPendingSettingsSyncPromise,
  sendQueryToBackend,
  stopQuery,
  setResponseOverlayPhase,
  resolvePreferredArtifactHttpUrl,
  deps,
}) {
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
      preparedQuery = await prepareRendererQuerySend({
        event,
        payload,
        currentConversationRef: state.currentConversationRef,
        currentSessionId: state.currentSessionId,
        currentServerUserId: state.currentServerUserId,
        currentUserId: state.currentUserId,
        backendHttpUrl: resolvePreferredArtifactHttpUrl(),
        isFirstQuery: state.isFirstQuery,
        deps,
      });
    } catch (error) {
      deps.log(`Rejected renderer query: ${error?.message || error}`);
      setResponseOverlayPhase('error', 'query-missing-conversation-ref');
      return { ok: false, error: error?.message || 'Rejected renderer query' };
    }

    payload = attachAgentDefinitionContext(preparedQuery.payload);
    setCurrentConversationRef(preparedQuery.conversationRef);
    queryMessageId = preparedQuery.queryMessageId;
    queryUsedInitialContext = preparedQuery.queryUsedInitialContext;
    setActiveQueryContext({
      queryMessageId,
      conversationRef: preparedQuery.conversationRef,
      accepted: false,
    });
    deps.traceFrontendQuery?.({
      payload,
      conversationRef: preparedQuery.conversationRef,
      queryMessageId,
    });
    deps.log('Received query from renderer');
    deps.log('Complete user message built successfully');

    let backendConnectionReady = true;
    if (!isBackendRuntimeConnected()) {
      try {
        await ensureBackendConnection('query');
      } catch (error) {
        backendConnectionReady = false;
        deps.log(`Failed to connect backend for query: ${error?.message || error}`);
      }
    }

    if (backendConnectionReady) {
      await ensureInitialSettingsSync();
      const pendingSettingsSyncPromise = getPendingSettingsSyncPromise();
      if (pendingSettingsSyncPromise) {
        await pendingSettingsSyncPromise;
      }
    }

    let messageId = null;
    if (backendConnectionReady) {
      messageId = await sendQueryToBackend({
        payload,
        messageId: queryMessageId,
      });
    }

    const latestState = getState();
    if (!messageId) {
      setActiveQueryContext(null);
      handleRendererQuerySendFailure({
        payload,
        queryMessageId,
        currentSessionId: latestState.currentSessionId,
        currentServerUserId: latestState.currentServerUserId,
        currentUserId: latestState.currentUserId,
        currentConversationRef: latestState.currentConversationRef,
        deps,
      });
      return { ok: false, error: 'Failed to send query to backend' };
    }

    if (queryUsedInitialContext) {
      setFirstQuery(false);
    }
    return { ok: true, messageId, queryMessageId };
  }

  async function handleRendererStopQuery(payloadInput = {}) {
    const payload = normalizePayload(payloadInput);
    const stopped = await stopQuery(payload);
    setResponseOverlayPhase('complete', 'stop-query');
    return { ok: Boolean(stopped), stopped: Boolean(stopped) };
  }

  return {
    handleRendererChatQuery,
    handleRendererStopQuery,
  };
}

module.exports = {
  createChatQueryHandlers,
};
