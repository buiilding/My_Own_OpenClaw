/**
 * Builds SDK conversation events from backend event envelopes for replay.
 */

const {
  normalizeBackendEventToConversationEvent,
} = require('../../../../packages/windie-sdk-js/cjs/transport/backendEventNormalizer.js');

function buildConversationEventFromBackendEvent(event, options = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return null;
  }
  return normalizeBackendEventToConversationEvent(event, {
    fallbackConversationRef: options.fallbackConversationRef,
    fallbackRevisionId: options.fallbackRevisionId,
    fallbackTurnRef: options.fallbackTurnRef,
  });
}

module.exports = {
  buildConversationEventFromBackendEvent,
};
