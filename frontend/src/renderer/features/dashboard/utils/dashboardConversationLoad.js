const MAX_RECENT_CHAT_RETRY_ATTEMPTS = 8;
const RECENT_CHAT_RETRY_BASE_DELAY_MS = 250;
const RECENT_CHAT_RETRY_MAX_DELAY_MS = 2000;

function isTransientRecentConversationsError(message) {
  if (typeof message !== 'string') {
    return false;
  }
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized.includes('local backend not ready')
    || normalized.includes('request timed out');
}

export function normalizeRecentConversations(conversations) {
  return (Array.isArray(conversations) ? conversations : [])
    .filter((conversation) => Boolean(conversation?.conversation_id))
    .sort((a, b) => {
      const aTime = Date.parse(a?.last_timestamp || '') || 0;
      const bTime = Date.parse(b?.last_timestamp || '') || 0;
      return bTime - aTime;
    });
}

export function prunePinnedConversationRefs(pinnedConversationRefs, recentConversations) {
  const knownIds = new Set(
    recentConversations
      .map((conversation) => conversation?.conversation_id)
      .filter(Boolean),
  );
  return pinnedConversationRefs.filter((conversationRef) => knownIds.has(conversationRef));
}

export function resolveRecentConversationsRetryDelayMs(
  retryAttempt,
  {
    baseDelayMs = RECENT_CHAT_RETRY_BASE_DELAY_MS,
    maxDelayMs = RECENT_CHAT_RETRY_MAX_DELAY_MS,
  } = {},
) {
  return Math.min(maxDelayMs, baseDelayMs * (2 ** retryAttempt));
}

export function shouldRetryRecentConversationsLoad({
  isLoadingRecentConversations,
  recentConversationsCount,
  recentConversationsError,
  retryAttempt,
  maxRetryAttempts = MAX_RECENT_CHAT_RETRY_ATTEMPTS,
}) {
  return (
    !isLoadingRecentConversations
    && recentConversationsCount === 0
    && isTransientRecentConversationsError(recentConversationsError)
    && retryAttempt < maxRetryAttempts
  );
}
