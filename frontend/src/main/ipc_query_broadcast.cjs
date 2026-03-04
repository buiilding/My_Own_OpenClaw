function broadcastLocalUserMessage({
  sourceWebContents,
  payload,
  queryMessageId,
  conversationRef,
  currentSessionId,
  currentServerUserId,
  currentUserId,
  backendHttpUrl,
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
    backendHttpUrl,
  });

  if (!localUserMessage) {
    return null;
  }

  broadcastToRenderers({
    channel: 'from-backend',
    payload: localUserMessage,
    sourceWebContents,
  });
  return localUserMessage;
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
