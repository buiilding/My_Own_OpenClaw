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

function rejectRemovedSessionIdentityKeys(payload) {
  if (hasOwnProperty(payload, 'sessionId') || hasOwnProperty(payload, 'session_id')) {
    throw new Error('Transcript session sync payloads must use conversationRef; sessionId and session_id are not supported.');
  }
  if (hasOwnProperty(payload, 'conversation_ref') || hasOwnProperty(payload, 'user_id')) {
    throw new Error('Transcript session sync payloads must use conversationRef and userId; conversation_ref and user_id are not supported.');
  }
}

function normalizeTranscriptSessionSyncPayload(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  rejectRemovedSessionIdentityKeys(payload);

  const hasConversationRef = hasOwnProperty(payload, 'conversationRef');
  const hasUserId = hasOwnProperty(payload, 'userId');

  if (!hasConversationRef && !hasUserId) {
    return null;
  }

  return {
    conversationRef: hasConversationRef
      ? (
        payload.conversationRef === null
          ? null
          : normalizeOptionalString(payload.conversationRef)
      )
      : undefined,
    userId: hasUserId
      ? (
        payload.userId === null
          ? null
          : normalizeOptionalString(payload.userId)
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
