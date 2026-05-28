async function prepareRendererQuerySend({
  event,
  payload,
  currentConversationRef,
  currentSessionId,
  currentServerUserId,
  currentUserId,
  isFirstQuery,
  deps,
}) {
  const {
    BrowserWindow,
    screen,
    runBeforeOverlayQueryCapture,
    onBeforeOverlayQueryCapture,
    log,
    prepareRendererQueryPayload,
    resolveConversationRefFromPayload,
    uuidGenerator,
    logChatPillMainTrace,
    setResponseOverlayPhase,
    buildConversationEventFromBackendEvent,
    buildLocalUserMessage,
    broadcastToRenderers,
    resolvePreferredArtifactHttpUrl,
    getWindows,
    setActiveDisplayAffinity,
    resolveActiveSurfaceDisplayAffinity,
    ipcEventReplayState,
    buildQueryPayload,
    buildQueryPayloadContext,
    getSystemState,
    searchMemory,
  } = deps;

  await runBeforeOverlayQueryCapture({
    webContents: event.sender,
    onBeforeOverlayQueryCapture,
    log,
  });

  const preparedQuery = prepareRendererQueryPayload(
    payload,
    currentConversationRef,
    resolveConversationRefFromPayload,
  );
  const {
    payload: preparedPayload,
    attachmentContext,
    conversationRef,
    memoryRetrievalEnabled,
  } = preparedQuery;

  const queryMessageId = preparedQuery.queryMessageId || uuidGenerator();
  logChatPillMainTrace({
    source: 'ipc',
    action: 'query-send-accepted',
    turnId: queryMessageId,
  });
  setResponseOverlayPhase('awaiting-first-chunk', 'query');

  const { mainWindow, chatWindow } = getWindows();
  setActiveDisplayAffinity(resolveActiveSurfaceDisplayAffinity({
    BrowserWindow,
    screen,
    webContents: event.sender,
    chatWindow,
    mainWindow,
  }));

  ipcEventReplayState.startTurn(queryMessageId);

  if (
    typeof buildLocalUserMessage === 'function'
    && typeof buildConversationEventFromBackendEvent === 'function'
    && typeof broadcastToRenderers === 'function'
  ) {
    const localUserMessage = buildLocalUserMessage({
      payload: preparedPayload,
      queryMessageId,
      conversationRef,
      currentSessionId,
      currentServerUserId,
      currentUserId,
      backendHttpUrl: typeof resolvePreferredArtifactHttpUrl === 'function'
        ? resolvePreferredArtifactHttpUrl()
        : null,
    });
    const conversationEvent = buildConversationEventFromBackendEvent(localUserMessage, {
      fallbackConversationRef: conversationRef,
    });
    if (conversationEvent) {
      broadcastToRenderers('windie:conversation-event', conversationEvent);
    }
  }

  const preparedContent = await buildQueryPayload({
    basePayload: preparedPayload,
    text: preparedPayload.text,
    conversationRef,
    attachmentContext,
    memoryRetrievalEnabled,
    currentUserId,
    isFirstQuery,
    buildQueryPayloadContext,
    getSystemState,
    searchMemory,
    log,
  });

  return {
    payload: {
      ...preparedPayload,
      ...preparedContent.payload,
    },
    queryMessageId,
    queryUsedInitialContext: preparedContent.queryUsedInitialContext,
    conversationRef,
  };
}

function handleRendererQuerySendFailure({
  payload,
  queryMessageId,
  currentConversationRef,
  currentSessionId,
  currentServerUserId,
  currentUserId,
  deps,
}) {
  const {
    resolveConversationRefFromPayload,
    ipcEventReplayState,
    broadcastQuerySendFailureRuntime,
    buildQuerySendFailure,
    setResponseOverlayPhase,
    broadcastToRenderers,
  } = deps;

  ipcEventReplayState.clear();
  broadcastQuerySendFailureRuntime({
    queryMessageId,
    conversationRef: resolveConversationRefFromPayload(payload, currentConversationRef),
    currentSessionId,
    currentServerUserId,
    currentUserId,
    buildQuerySendFailure,
    setResponseOverlayPhase,
    broadcastToRenderers: ({ channel, payload: messagePayload, sourceWebContents }) => {
      broadcastToRenderers(channel, messagePayload, sourceWebContents);
    },
  });
}

module.exports = {
  handleRendererQuerySendFailure,
  prepareRendererQuerySend,
};
