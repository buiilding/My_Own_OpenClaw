/**
 * Provides the ipc query events module for the Electron main process.
 */

function resolveConversationRef(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const nestedPayload = payload.payload && typeof payload.payload === 'object' && !Array.isArray(payload.payload)
    ? payload.payload
    : null;
  const nestedConversationRef = nestedPayload?.conversation_ref;
  if (typeof nestedConversationRef === 'string' && nestedConversationRef.trim()) {
    return nestedConversationRef.trim();
  }
  return typeof payload.conversation_ref === 'string' && payload.conversation_ref.trim()
    ? payload.conversation_ref.trim()
    : null;
}

function buildQueryContextFields({
  queryMessageId,
  conversationRef,
  currentSessionId,
  currentServerUserId,
  currentUserId,
  includeClientUserFallback = false,
}) {
  const serverUserId = currentServerUserId || null;
  const resolvedUserId = includeClientUserFallback
    ? (serverUserId || currentUserId || null)
    : serverUserId;

  return {
    turn_ref: queryMessageId || null,
    session_id: currentSessionId || null,
    user_id: resolvedUserId,
    conversation_ref: conversationRef,
  };
}

function buildQuerySendFailure({
  queryMessageId,
  conversationRef,
  currentSessionId,
  currentServerUserId,
  currentUserId,
  copy = {},
}) {
  const queryContext = buildQueryContextFields({
    queryMessageId,
    conversationRef,
    currentSessionId,
    currentServerUserId,
    currentUserId,
    includeClientUserFallback: true,
  });

  return {
    type: 'error',
    id: queryMessageId,
    event_id: queryMessageId ? `${queryMessageId}:query-send-failed` : 'query-send-failed',
    sequence: 1,
    ...queryContext,
    payload: {
      message: (
        copy.sendFailure
        || "Your message wasn't sent because the app isn't connected right now. Try again when the connection is restored."
      ),
    },
  };
}

function buildQueryInterrupted({
  queryMessageId,
  conversationRef,
  currentSessionId,
  currentServerUserId,
  currentUserId,
  accepted = false,
  copy = {},
}) {
  const queryContext = buildQueryContextFields({
    queryMessageId,
    conversationRef,
    currentSessionId,
    currentServerUserId,
    currentUserId,
    includeClientUserFallback: true,
  });

  const message = accepted
    ? (
      copy.interruptedAfterAccept
      || 'The app lost connection before the response finished. Retry this message after reconnecting.'
    )
    : (
      copy.interruptedBeforeAccept
      || 'The app lost connection before confirming the message was received. Retry this message after reconnecting.'
    );

  return {
    type: 'error',
    id: queryMessageId,
    ...queryContext,
    payload: {
      message,
      interrupted: true,
      accepted: Boolean(accepted),
    },
  };
}

module.exports = {
  resolveConversationRef,
  buildQuerySendFailure,
  buildQueryInterrupted,
};
