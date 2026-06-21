/**
 * Provides dashboard conversation load rules for the renderer app runtime.
 */

const MAX_RECENT_CHAT_RETRY_ATTEMPTS = 8;
const RECENT_CHAT_RETRY_BASE_DELAY_MS = 250;
const RECENT_CHAT_RETRY_MAX_DELAY_MS = 2000;
const TITLE_VISIBILITY_POLL_MAX_ATTEMPTS = 240;
const TITLE_VISIBILITY_POLL_DELAY_MS = 1250;

const RECENT_CONVERSATION_EVENT_ACTION = Object.freeze({
  NONE: 'none',
  RELOAD: 'reload',
  POLL_TITLE_VISIBILITY: 'poll-title-visibility',
});

const RECENT_CONVERSATION_EVENT_RELOAD_REASON = Object.freeze({
  USER_MESSAGE: 'sdk-user-message',
  ASSISTANT_MESSAGE_WITHOUT_CONVERSATION: 'sdk-assistant-message-no-conversation',
});

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : '';
}

function metadataToDashboardConversation(metadata) {
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

function metadataListToDashboardConversations(metadataList) {
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

function normalizeRecentConversations(conversations) {
  return (Array.isArray(conversations) ? conversations : [])
    .filter((conversation) => Boolean(getDashboardConversationRef(conversation)))
    .sort((a, b) => {
      const aTime = Date.parse(a?.last_timestamp || '') || 0;
      const bTime = Date.parse(b?.last_timestamp || '') || 0;
      return bTime - aTime;
    });
}

function getDashboardConversationRef(conversation) {
  return normalizeOptionalString(conversation?.conversation_id);
}

function getDashboardConversationTitle(conversation) {
  return normalizeOptionalString(conversation?.title);
}

function getDashboardConversationRenamePromptValue(
  conversation,
  fallbackTitle = 'New chat',
) {
  return getDashboardConversationTitle(conversation) || fallbackTitle;
}

function isDashboardConversationRef(conversation, conversationRef) {
  return getDashboardConversationRef(conversation) === normalizeOptionalString(conversationRef);
}

function renameDashboardConversationInList(
  conversations,
  conversationRef,
  nextTitle,
) {
  const targetRef = normalizeOptionalString(conversationRef);
  const title = normalizeOptionalString(nextTitle);
  if (!targetRef || !title || !Array.isArray(conversations)) {
    return Array.isArray(conversations) ? conversations : [];
  }
  return conversations.map((conversation) => (
    isDashboardConversationRef(conversation, targetRef)
      ? { ...conversation, title }
      : conversation
  ));
}

function removeDashboardConversationFromList(conversations, conversationRef) {
  const targetRef = normalizeOptionalString(conversationRef);
  if (!targetRef || !Array.isArray(conversations)) {
    return Array.isArray(conversations) ? conversations : [];
  }
  return conversations.filter((conversation) => !isDashboardConversationRef(conversation, targetRef));
}

function prunePinnedConversationRefs(pinnedConversationRefs, recentConversations) {
  const knownIds = new Set(
    recentConversations
      .map(getDashboardConversationRef)
      .filter(Boolean),
  );
  return pinnedConversationRefs.filter((conversationRef) => knownIds.has(conversationRef));
}

function togglePinnedConversationRef(pinnedConversationRefs, conversationRef) {
  const targetRef = normalizeOptionalString(conversationRef);
  const source = Array.isArray(pinnedConversationRefs) ? pinnedConversationRefs : [];
  if (!targetRef) {
    return source;
  }
  if (source.includes(targetRef)) {
    return source.filter((id) => id !== targetRef);
  }
  return [targetRef, ...source];
}

function removePinnedConversationRef(pinnedConversationRefs, conversationRef) {
  const targetRef = normalizeOptionalString(conversationRef);
  const source = Array.isArray(pinnedConversationRefs) ? pinnedConversationRefs : [];
  if (!targetRef) {
    return source;
  }
  return source.filter((id) => id !== targetRef);
}

function resolveRecentConversationEventAction(event) {
  const eventType = normalizeOptionalString(event?.type);
  const conversationRef = normalizeOptionalString(event?.conversationRef);
  if (eventType === 'user_message') {
    return {
      action: RECENT_CONVERSATION_EVENT_ACTION.RELOAD,
      conversationRef: null,
      reloadReason: RECENT_CONVERSATION_EVENT_RELOAD_REASON.USER_MESSAGE,
    };
  }
  if (eventType !== 'assistant_message') {
    return {
      action: RECENT_CONVERSATION_EVENT_ACTION.NONE,
      conversationRef: null,
      reloadReason: '',
    };
  }
  if (!conversationRef) {
    return {
      action: RECENT_CONVERSATION_EVENT_ACTION.RELOAD,
      conversationRef: null,
      reloadReason: RECENT_CONVERSATION_EVENT_RELOAD_REASON.ASSISTANT_MESSAGE_WITHOUT_CONVERSATION,
    };
  }
  return {
    action: RECENT_CONVERSATION_EVENT_ACTION.POLL_TITLE_VISIBILITY,
    conversationRef,
    reloadReason: '',
  };
}

function shouldReloadRecentConversationsForEventAction(action) {
  return action?.action === RECENT_CONVERSATION_EVENT_ACTION.RELOAD;
}

function getTitleVisibilityPollConversationRef(action) {
  return action?.action === RECENT_CONVERSATION_EVENT_ACTION.POLL_TITLE_VISIBILITY
    ? action.conversationRef || null
    : null;
}

function getRecentConversationsReloadReasonForEventAction(action) {
  return action?.action === RECENT_CONVERSATION_EVENT_ACTION.RELOAD
    ? action.reloadReason || ''
    : '';
}

function getTitleVisibilityPollSchedule() {
  return {
    delayMs: TITLE_VISIBILITY_POLL_DELAY_MS,
    maxAttempts: TITLE_VISIBILITY_POLL_MAX_ATTEMPTS,
  };
}

function isConversationVisibleInRecentConversations(
  recentConversations,
  conversationRef,
) {
  const targetRef = normalizeOptionalString(conversationRef);
  if (!targetRef) {
    return false;
  }
  return (Array.isArray(recentConversations) ? recentConversations : []).some((conversation) => (
    normalizeOptionalString(conversation?.conversation_id) === targetRef
  ));
}

function shouldContinueTitleVisibilityPoll({
  recentConversations,
  conversationRef,
  attempts,
  maxAttempts = TITLE_VISIBILITY_POLL_MAX_ATTEMPTS,
}) {
  if (Number(attempts) >= maxAttempts) {
    return false;
  }
  return !isConversationVisibleInRecentConversations(recentConversations, conversationRef);
}

function resolveRecentConversationsRetryDelayMs(
  retryAttempt,
  {
    baseDelayMs = RECENT_CHAT_RETRY_BASE_DELAY_MS,
    maxDelayMs = RECENT_CHAT_RETRY_MAX_DELAY_MS,
  } = {},
) {
  return Math.min(maxDelayMs, baseDelayMs * (2 ** retryAttempt));
}

function shouldRetryRecentConversationsLoad({
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

export const DesktopDashboardConversationLoadRuntime = Object.freeze({
  getDashboardConversationRef,
  getDashboardConversationRenamePromptValue,
  getRecentConversationsReloadReasonForEventAction,
  getTitleVisibilityPollConversationRef,
  getTitleVisibilityPollSchedule,
  isConversationVisibleInRecentConversations,
  metadataListToDashboardConversations,
  metadataToDashboardConversation,
  normalizeRecentConversations,
  prunePinnedConversationRefs,
  removeDashboardConversationFromList,
  removePinnedConversationRef,
  renameDashboardConversationInList,
  resolveRecentConversationEventAction,
  resolveRecentConversationsRetryDelayMs,
  shouldContinueTitleVisibilityPoll,
  shouldReloadRecentConversationsForEventAction,
  shouldRetryRecentConversationsLoad,
  togglePinnedConversationRef,
});
