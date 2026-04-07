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
  backendHttpUrl,
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

  const screenshotRef = payload.screenshot_ref || null;
  const screenshotUrl = payload.screenshot_url
    || (
      screenshotRef && typeof backendHttpUrl === 'string' && backendHttpUrl.trim().length > 0
        ? `${backendHttpUrl.replace(/\/$/, '')}/api/artifacts/${screenshotRef}`
        : null
    );

  return {
    type: 'local-user-message',
    ...queryContext,
    payload: {
      text: payload.text,
      screenshot_ref: screenshotRef,
      screenshot_refs: Array.isArray(payload.screenshot_refs) ? payload.screenshot_refs : null,
      screenshot_url: screenshotUrl,
      attachment_filenames: Array.isArray(payload.attachment_filenames)
        ? payload.attachment_filenames
        : null,
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
      message: "Your message wasn't sent because WindieOS isn't connected right now. Try again when the backend reconnects.",
    },
  };
}

module.exports = {
  resolveConversationRef,
  buildLocalUserMessage,
  buildQuerySendFailure,
};
