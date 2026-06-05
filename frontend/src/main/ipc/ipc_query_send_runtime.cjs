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
    getWindows,
    setActiveDisplayAffinity,
    resolveActiveSurfaceDisplayAffinity,
    ipcEventReplayState,
    buildQueryPayload,
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
    conversationRef,
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

  const preparedContent = await buildQueryPayload({
    basePayload: preparedPayload,
    conversationRef,
    currentUserId,
    isFirstQuery,
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
    broadcastToRenderers,
  });
}

module.exports = {
  handleRendererQuerySendFailure,
  prepareRendererQuerySend,
};
