const {
  buildConversationEventFromBackendEvent,
} = require('../ipc_conversation_event_broadcast.cjs');

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
  const conversationEvent = buildConversationEventFromBackendEvent(localUserMessage, {
    fallbackConversationRef: conversationRef,
  });
  if (conversationEvent) {
    broadcastToRenderers({
      channel: 'conversation-event',
      payload: conversationEvent,
      sourceWebContents,
    });
  }
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
  const conversationEvent = buildConversationEventFromBackendEvent(queryFailure, {
    fallbackConversationRef: conversationRef,
  });
  if (conversationEvent) {
    broadcastToRenderers({
      channel: 'conversation-event',
      payload: conversationEvent,
    });
  }
}

module.exports = {
  broadcastLocalUserMessage,
  broadcastQuerySendFailure,
};
