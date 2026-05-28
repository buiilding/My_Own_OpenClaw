const {
  buildConversationEventFromBackendEvent,
} = require('../ipc_conversation_event_broadcast.cjs');

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

  const conversationEvent = buildConversationEventFromBackendEvent(queryFailure, {
    fallbackConversationRef: conversationRef,
  });
  if (conversationEvent) {
    broadcastToRenderers({
      channel: 'windie:conversation-event',
      payload: conversationEvent,
    });
  }
}

module.exports = {
  broadcastQuerySendFailure,
};
