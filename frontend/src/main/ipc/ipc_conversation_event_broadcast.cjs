/**
 * Provides the ipc conversation event broadcast module for the Electron main process.
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
  });
}

module.exports = {
  buildConversationEventFromBackendEvent,
};
