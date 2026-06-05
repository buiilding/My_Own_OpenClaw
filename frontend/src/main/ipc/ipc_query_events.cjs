function resolveConversationRef(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
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
      message: "Your message wasn't sent because WindieOS isn't connected right now. Try again when the backend reconnects.",
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
    ? 'WindieOS lost connection before the response finished. Retry this message after reconnecting.'
    : 'WindieOS lost connection before confirming the message was received. Retry this message after reconnecting.';

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
