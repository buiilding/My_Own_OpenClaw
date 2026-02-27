function broadcastLocalUserMessage({
  sourceWebContents,
  payload,
  queryMessageId,
  conversationRef,
  currentSessionId,
  currentServerUserId,
  currentUserId,
  buildLocalUserMessage,
  broadcastToRenderers,
}) {
  const localUserMessage = buildLocalUserMessage({
    payload,
    queryMessageId,
    conversationRef,
    currentSessionId,
    currentServerUserId,
    currentUserId,
  });

  if (!localUserMessage) {
    return;
  }

  broadcastToRenderers({
    channel: 'from-backend',
    payload: localUserMessage,
    sourceWebContents,
  });
}

function broadcastQuerySendFailure({
  queryMessageId,
  conversationRef,
  currentSessionId,
  currentServerUserId,
  currentUserId,
  buildQuerySendFailure,
  setResponseOverlayPhase,
  broadcastToRenderers,
}) {
  setResponseOverlayPhase('idle', 'query-send-failed');
  const queryFailure = buildQuerySendFailure({
    queryMessageId,
    conversationRef,
    currentSessionId,
    currentServerUserId,
    currentUserId,
  });

  broadcastToRenderers({
    channel: 'from-backend',
    payload: queryFailure,
  });
}

module.exports = {
  broadcastLocalUserMessage,
  broadcastQuerySendFailure,
};
