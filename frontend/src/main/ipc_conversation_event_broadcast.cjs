const {
  normalizeBackendEventToConversationEvent,
} = require('../../../packages/windie-sdk-js/src/transport/backendEventNormalizer.cjs');

function buildConversationEventFromBackendEvent(event, options = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return null;
  }
  return normalizeBackendEventToConversationEvent(event, {
    fallbackConversationRef: options.fallbackConversationRef,
    fallbackRevisionId: options.fallbackRevisionId,
  });
}

function broadcastConversationEvent({
  event,
  fallbackConversationRef = null,
  broadcastToRenderers,
  sourceWebContents = null,
}) {
  if (typeof broadcastToRenderers !== 'function') {
    return null;
  }
  const conversationEvent = buildConversationEventFromBackendEvent(event, {
    fallbackConversationRef,
  });
  if (!conversationEvent) {
    return null;
  }
  broadcastToRenderers('conversation-event', conversationEvent, sourceWebContents);
  return conversationEvent;
}

module.exports = {
  broadcastConversationEvent,
  buildConversationEventFromBackendEvent,
};
