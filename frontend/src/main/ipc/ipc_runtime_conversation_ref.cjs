/**
 * Resolves Agent SDK runtime conversation identity at the Electron main boundary.
 */

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveRuntimeConversationRef(input = {}, fallbackConversationRef = null) {
  const payload = input && typeof input === 'object' && !Array.isArray(input)
    ? input.payload
    : null;
  const fromPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload.conversation_ref
    : null;
  const direct = input && typeof input === 'object' && !Array.isArray(input)
    ? (input.conversation_ref || input.conversationRef)
    : null;

  return normalizeOptionalString(fromPayload)
    || normalizeOptionalString(direct)
    || normalizeOptionalString(fallbackConversationRef)
    || null;
}

function createRuntimeConversationRefRuntime({
  getFallbackConversationRef = () => null,
} = {}) {
  function resolve(input = {}) {
    return resolveRuntimeConversationRef(input, getFallbackConversationRef());
  }

  return {
    resolve,
  };
}

module.exports = {
  createRuntimeConversationRefRuntime,
};
