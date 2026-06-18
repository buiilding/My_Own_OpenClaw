/**
 * Provides the ipc query broadcast module for the Electron main process.
 */

const {
  createConversationEvent,
} = require('../../../../packages/windie-sdk-js/cjs/index.js');
const {
  DESKTOP_RUNTIME_ON_CHANNELS,
} = require('./ipc_desktop_runtime_channels.cjs');

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

  const failurePayload = queryFailure?.payload && typeof queryFailure.payload === 'object'
    ? queryFailure.payload
    : {};
  const message = typeof failurePayload.message === 'string'
    ? failurePayload.message
    : "Your message wasn't sent because the app isn't connected right now. Try again when the connection is restored.";
  const conversationEvent = createConversationEvent({
    eventId: queryFailure?.event_id || (queryMessageId ? `${queryMessageId}:query-send-failed` : 'query-send-failed'),
    type: 'turn_error',
    conversationRef: queryFailure?.conversation_ref || conversationRef,
    turnRef: queryFailure?.turn_ref || queryMessageId || null,
    source: 'electron-main',
    payload: {
      message,
      content: typeof failurePayload.content === 'string' ? failurePayload.content : message,
      userId: typeof queryFailure?.user_id === 'string' ? queryFailure.user_id : null,
      sourceEventType: 'query-send-failed',
    },
  });
  if (conversationEvent) {
    broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT, conversationEvent);
  }
}

module.exports = {
  broadcastQuerySendFailure,
};
