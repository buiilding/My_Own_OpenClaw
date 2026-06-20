/**
 * Provides the ipc automated query dispatcher module for the Electron main process.
 */

function createAutomatedQueryDispatcher({
  prepareAutomatedQueryPayload,
  ensureBackendConnection,
  ensureInitialSettingsSync,
  getPendingSettingsSyncPromise,
  buildQueryPayload,
  attachAgentDefinitionContext,
  sendQueryThroughAgentSdkRuntime,
  getState,
  setCurrentConversationRef,
  setFirstQuery,
  uuidGenerator,
}) {
  async function sendAutomatedQuery(options = {}) {
    const preparedQuery = prepareAutomatedQueryPayload(options);
    if (!preparedQuery) {
      return { ok: false, error: 'Missing query text' };
    }

    try {
      await ensureBackendConnection('automated-query');
    } catch (error) {
      return {
        ok: false,
        error: error?.message || 'Backend websocket is not connected',
      };
    }

    await ensureInitialSettingsSync();
    const pendingSettingsSyncPromise = getPendingSettingsSyncPromise();
    if (pendingSettingsSyncPromise) {
      await pendingSettingsSyncPromise;
    }

    const state = getState();
    const conversationRef = preparedQuery.conversationRef || `vm-run-${uuidGenerator()}`;
    const basePayload = {
      text: preparedQuery.text,
      conversation_ref: conversationRef,
      memory_retrieval_enabled: preparedQuery.memoryRetrievalEnabled,
    };
    if (preparedQuery.attachmentContext) {
      basePayload.attachment_context = preparedQuery.attachmentContext;
    }
    if (preparedQuery.attachmentFilenames.length > 0) {
      basePayload.attachment_filenames = preparedQuery.attachmentFilenames;
    }
    const builtQuery = await buildQueryPayload({
      basePayload,
      conversationRef,
      currentUserId: state.currentUserId,
      isFirstQuery: state.isFirstQuery,
    });

    const payload = {
      ...builtQuery.payload,
    };
    const payloadWithAgentDefinition = attachAgentDefinitionContext(payload);

    const queryMessageId = uuidGenerator();
    const messageId = await sendQueryThroughAgentSdkRuntime({
      payload: payloadWithAgentDefinition,
      messageId: queryMessageId,
    });
    if (!messageId) {
      return { ok: false, error: 'Failed to send query through Agent SDK runtime' };
    }

    setCurrentConversationRef(conversationRef);
    if (builtQuery.queryUsedInitialContext) {
      setFirstQuery(false);
    }
    return {
      ok: true,
      messageId,
      queryMessageId,
      conversationRef,
      userId: builtQuery.userId,
    };
  }

  return {
    sendAutomatedQuery,
  };
}

function createAutomatedQueryRuntime(deps = {}) {
  const dispatcher = createAutomatedQueryDispatcher(deps);

  function sendAutomatedQuery(options = {}) {
    return dispatcher.sendAutomatedQuery(options);
  }

  return {
    sendAutomatedQuery,
  };
}

module.exports = {
  createAutomatedQueryDispatcher,
  createAutomatedQueryRuntime,
};
