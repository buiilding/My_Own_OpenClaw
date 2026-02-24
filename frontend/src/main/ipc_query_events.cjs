function resolveConversationRef(payload, currentConversationRef) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return currentConversationRef || null;
  }
  return payload.conversation_ref || currentConversationRef || null;
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

function buildLocalUserMessage({
  payload,
  queryMessageId,
  conversationRef,
  currentSessionId,
  currentServerUserId,
  currentUserId,
}) {
  if (!payload?.text) {
    return null;
  }

  const queryContext = buildQueryContextFields({
    queryMessageId,
    conversationRef,
    currentSessionId,
    currentServerUserId,
    currentUserId,
  });

  return {
    type: 'local-user-message',
    ...queryContext,
    payload: {
      text: payload.text,
      screenshot_ref: payload.screenshot_ref || null,
      screenshot_url: payload.screenshot_url || null,
      timestamp: new Date().toISOString(),
      session_id: queryContext.session_id,
      user_id: queryContext.user_id,
      conversation_ref: queryContext.conversation_ref,
    },
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
    ...queryContext,
    payload: {
      message: 'Unable to send query: backend connection is unavailable.',
    },
  };
}

module.exports = {
  resolveConversationRef,
  buildLocalUserMessage,
  buildQuerySendFailure,
};

