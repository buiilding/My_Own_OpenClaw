async function prepareRendererQuerySend({
  event,
  payload,
  currentConversationRef,
  currentSessionId,
  currentServerUserId,
  currentUserId,
  backendHttpUrl,
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
    getWindows,
    setActiveDisplayAffinity,
    resolveActiveSurfaceDisplayAffinity,
    broadcastLocalUserMessageRuntime,
    buildLocalUserMessage,
    broadcastToRenderers,
    ipcEventReplayState,
    buildQueryPayload,
    buildQueryPayloadContent,
    getSystemState,
    searchMemory,
    generateUserId,
    osUserInfo,
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

  const queryMessageId = uuidGenerator();
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

  const localUserMessage = broadcastLocalUserMessageRuntime({
    sourceWebContents: event.sender,
    payload: preparedPayload,
    queryMessageId,
    conversationRef,
    currentSessionId,
    currentServerUserId,
    currentUserId,
    backendHttpUrl,
    buildLocalUserMessage,
    broadcastToRenderers: ({ channel, payload: messagePayload, sourceWebContents }) => {
      broadcastToRenderers(channel, messagePayload, sourceWebContents);
    },
  });
  ipcEventReplayState.startTurn(queryMessageId, localUserMessage);

  const preparedContent = await buildQueryPayload({
    basePayload: preparedPayload,
    text: preparedPayload.text,
    conversationRef,
    attachmentContext,
    memoryRetrievalEnabled,
    currentUserId,
    isFirstQuery,
    buildQueryPayloadContent,
    getSystemState,
    searchMemory,
    generateUserId,
    osUserInfo,
    uuidGenerator,
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
