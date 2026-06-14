/**
 * Provides the ipc transcript session sync module for the Electron main process.
 */

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function hasOwnProperty(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function normalizeTranscriptSessionSyncPayload(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const hasConversationRef = (
    hasOwnProperty(payload, 'conversationRef')
    || hasOwnProperty(payload, 'conversation_ref')
  );
  const hasUserId = hasOwnProperty(payload, 'userId') || hasOwnProperty(payload, 'user_id');

  if (!hasConversationRef && !hasUserId) {
    return null;
  }

  const rawConversationRef = hasOwnProperty(payload, 'conversationRef')
    ? payload.conversationRef
    : payload.conversation_ref;
  const rawUserId = hasOwnProperty(payload, 'userId') ? payload.userId : payload.user_id;

  return {
    conversationRef: hasConversationRef
      ? (
        rawConversationRef === null
          ? null
          : normalizeOptionalString(rawConversationRef)
      )
      : undefined,
    userId: hasUserId
      ? (
        rawUserId === null
          ? null
          : normalizeOptionalString(rawUserId)
      )
      : undefined,
  };
}

function applyTranscriptSessionSync({
  payload,
  sender = null,
  currentConversationRef,
  currentUserId,
  broadcastToRenderers,
}) {
  const normalizedPayload = normalizeTranscriptSessionSyncPayload(payload);
  if (!normalizedPayload) {
    return null;
  }

  const nextConversationRef = normalizedPayload.conversationRef !== undefined
    ? normalizedPayload.conversationRef
    : currentConversationRef;
  const nextUserId = (
    typeof normalizedPayload.userId === 'string' && normalizedPayload.userId.length > 0
  )
    ? normalizedPayload.userId
    : currentUserId;

  broadcastToRenderers('transcript-session-sync', {
    conversationRef: nextConversationRef ?? null,
    userId: nextUserId ?? null,
  }, sender);

  return {
    normalizedPayload,
    nextConversationRef,
    nextUserId,
  };
}

module.exports = {
  applyTranscriptSessionSync,
};
