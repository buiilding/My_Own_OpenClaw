/**
 * Provides the ipc query broadcast module for the Electron main process.
 */

const {
  buildConversationEventFromBackendEvent,
} = require('./ipc_conversation_event_broadcast.cjs');
const {
  DESKTOP_AGENT_ON_CHANNELS,
} = require('./ipc_desktop_agent_channels.cjs');

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
    broadcastToRenderers(DESKTOP_AGENT_ON_CHANNELS.CONVERSATION_EVENT, conversationEvent);
  }
}

module.exports = {
  broadcastQuerySendFailure,
};
