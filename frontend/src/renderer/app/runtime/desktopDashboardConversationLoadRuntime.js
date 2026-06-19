/**
 * Provides dashboard conversation load rules for the renderer app runtime.
 */

const MAX_RECENT_CHAT_RETRY_ATTEMPTS = 8;
const RECENT_CHAT_RETRY_BASE_DELAY_MS = 250;
const RECENT_CHAT_RETRY_MAX_DELAY_MS = 2000;

export function metadataToDashboardConversation(metadata) {
  return {
    conversation_id: metadata?.conversationRef,
    record_kind: 'chat_event',
    title: metadata?.title || metadata?.conversationRef || '',
    last_message: metadata?.lastMessage || '',
    last_timestamp: metadata?.updatedAt || '',
    entry_count: metadata?.eventCount || 0,
    workspace_path: metadata?.workspacePath || '',
    workspace_name: metadata?.workspaceName || '',
    snippet: metadata?.snippet || '',
    matched_role: metadata?.matchedRole || '',
  };
}

export function metadataListToDashboardConversations(metadataList) {
  return (Array.isArray(metadataList) ? metadataList : [])
    .map(metadataToDashboardConversation);
}

function isGenericTransientRecentConversationsError(message) {
  if (typeof message !== 'string') {
    return false;
  }
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized.includes('request timed out')
    || normalized.includes('failed to fetch')
    || normalized.includes('fetch failed')
    || normalized.includes('econnrefused');
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
  isTransientError = isGenericTransientRecentConversationsError,
}) {
  return (
    !isLoadingRecentConversations
    && recentConversationsCount === 0
    && isTransientError(recentConversationsError)
    && retryAttempt < maxRetryAttempts
  );
}
