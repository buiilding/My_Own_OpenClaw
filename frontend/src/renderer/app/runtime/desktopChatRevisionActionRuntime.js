/**
 * Builds SDK conversation revision command inputs for ChatInterface.
 */

function normalizeRevisionId(revisionId) {
  return typeof revisionId === 'string' && revisionId.trim() ? revisionId.trim() : null;
}

function normalizeConversationRef(conversationRef) {
  return typeof conversationRef === 'string' && conversationRef.trim()
    ? conversationRef.trim()
    : null;
}

function sanitizeRefPart(value, fallback) {
  const sanitized = String(value || fallback).replace(/[^a-zA-Z0-9_-]+/g, '-');
  return sanitized || fallback;
}

function buildForkConversationRef(conversationRef, revisionId, now = Date.now) {
  const source = sanitizeRefPart(conversationRef, 'conversation');
  const revision = sanitizeRefPart(revisionId, 'revision');
  return `${source}-fork-${revision}-${now().toString(36)}`;
}

function resolveUserId(userId) {
  return typeof userId === 'string' && userId.trim() ? userId.trim() : 'default_user';
}

function buildRevisionCheckoutCommand({
  activeConversationRef = null,
  revisionId = null,
  userId = null,
} = {}) {
  const normalizedConversationRef = normalizeConversationRef(activeConversationRef);
  const normalizedRevisionId = normalizeRevisionId(revisionId);
  if (!normalizedConversationRef || !normalizedRevisionId) {
    return null;
  }
  return {
    actionId: `checkout:${normalizedRevisionId}`,
    input: {
      userId: resolveUserId(userId),
      conversationRef: normalizedConversationRef,
      revisionId: normalizedRevisionId,
    },
  };
}

function buildRevisionForkCommand({
  activeConversationRef = null,
  now = Date.now,
  revision = null,
  userId = null,
} = {}) {
  const normalizedConversationRef = normalizeConversationRef(activeConversationRef);
  const normalizedRevisionId = normalizeRevisionId(revision?.revisionId);
  if (!normalizedConversationRef || !normalizedRevisionId) {
    return null;
  }
  return {
    actionId: `fork:${normalizedRevisionId}`,
    input: {
      userId: resolveUserId(userId),
      conversationRef: normalizedConversationRef,
      sourceRevisionId: normalizedRevisionId,
      newConversationRef: buildForkConversationRef(
        normalizedConversationRef,
        normalizedRevisionId,
        now,
      ),
    },
  };
}

export const DesktopChatRevisionActionRuntime = Object.freeze({
  buildForkConversationRef,
  buildRevisionCheckoutCommand,
  buildRevisionForkCommand,
  normalizeRevisionId,
});
