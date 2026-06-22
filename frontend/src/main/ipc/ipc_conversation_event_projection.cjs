/**
 * Builds SDK conversation events from backend event envelopes for replay.
 */

const {
  normalizeBackendEventToConversationEvent,
} = require('../../../../packages/windie-sdk-js/cjs/transport/backendEventNormalizer.js');

const hasOwn = Object.prototype.hasOwnProperty;

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

function createConversationEventProjectionRuntime({
  getFallbackConversationRef = () => null,
  getFallbackRevisionId = () => null,
  getFallbackTurnRef = () => null,
} = {}) {
  function build(event, options = {}) {
    return buildConversationEventFromBackendEvent(event, {
      fallbackConversationRef: hasOwn.call(options, 'fallbackConversationRef')
        ? options.fallbackConversationRef
        : getFallbackConversationRef(),
      fallbackRevisionId: hasOwn.call(options, 'fallbackRevisionId')
        ? options.fallbackRevisionId
        : getFallbackRevisionId(),
      fallbackTurnRef: hasOwn.call(options, 'fallbackTurnRef')
        ? options.fallbackTurnRef
        : getFallbackTurnRef(),
    });
  }

  return {
    build,
  };
}

module.exports = {
  createConversationEventProjectionRuntime,
};
