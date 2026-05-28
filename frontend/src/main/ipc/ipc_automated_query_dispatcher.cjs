function createAutomatedQueryDispatcher({
  prepareAutomatedQueryPayload,
  ensureBackendConnection,
  ensureInitialSettingsSync,
  getPendingSettingsSyncPromise,
  buildQueryPayload,
  buildQueryPayloadContext,
  getSystemState,
  searchMemory,
  attachAgentDefinitionContext,
  sendQueryToBackend,
  getState,
  setCurrentConversationRef,
  setFirstQuery,
  uuidGenerator,
  log,
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
    const builtQuery = await buildQueryPayload({
      basePayload: {},
      text: preparedQuery.text,
      conversationRef,
      attachmentContext: preparedQuery.attachmentContext,
      memoryRetrievalEnabled: preparedQuery.memoryRetrievalEnabled,
      currentUserId: state.currentUserId,
      isFirstQuery: state.isFirstQuery,
      buildQueryPayloadContext,
      getSystemState,
      searchMemory,
      log,
    });

    const payload = {
      text: preparedQuery.text,
      conversation_ref: conversationRef,
      ...builtQuery.payload,
    };
    if (preparedQuery.attachmentFilenames.length > 0) {
      payload.attachment_filenames = preparedQuery.attachmentFilenames;
    }
    const payloadWithAgentDefinition = attachAgentDefinitionContext(payload);

    const queryMessageId = uuidGenerator();
    const messageId = await sendQueryToBackend({
      payload: payloadWithAgentDefinition,
      messageId: queryMessageId,
    });
    if (!messageId) {
      return { ok: false, error: 'Failed to send query to backend' };
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

module.exports = {
  createAutomatedQueryDispatcher,
};
