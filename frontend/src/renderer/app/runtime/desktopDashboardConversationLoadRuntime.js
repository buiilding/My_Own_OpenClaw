/**
 * Provides dashboard conversation load rules for the renderer app runtime.
 */

const MAX_RECENT_CHAT_RETRY_ATTEMPTS = 8;
const RECENT_CHAT_RETRY_BASE_DELAY_MS = 250;
const RECENT_CHAT_RETRY_MAX_DELAY_MS = 2000;
const TITLE_VISIBILITY_POLL_MAX_ATTEMPTS = 240;
const TITLE_VISIBILITY_POLL_DELAY_MS = 1250;
const CONVERSATION_SEARCH_DEBOUNCE_DELAY_MS = 180;
const RECENT_CONVERSATION_REFRESH_DEBOUNCE_DELAY_MS = 200;

const RECENT_CONVERSATION_EVENT_ACTION = Object.freeze({
  NONE: 'none',
  RELOAD: 'reload',
  POLL_TITLE_VISIBILITY: 'poll-title-visibility',
});

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : '';
}

function metadataToDashboardConversation(metadata) {
  return {
    conversation_id: metadata?.conversationRef || metadata?.conversation_id,
    record_kind: 'chat_event',
    title: metadata?.title || metadata?.conversationRef || metadata?.conversation_id || '',
    last_message: metadata?.lastMessage || metadata?.last_message || '',
    last_timestamp: metadata?.updatedAt || metadata?.last_timestamp || '',
    entry_count: metadata?.eventCount || metadata?.entry_count || 0,
    workspace_path: metadata?.workspacePath || metadata?.workspace_path || '',
    workspace_name: metadata?.workspaceName || metadata?.workspace_name || '',
    snippet: metadata?.snippet || '',
    matched_role: metadata?.matchedRole || metadata?.matched_role || '',
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
    };
  }
  if (eventType !== 'assistant_message') {
    return {
      action: RECENT_CONVERSATION_EVENT_ACTION.NONE,
      conversationRef: null,
    };
  }
  if (!conversationRef) {
    return {
      action: RECENT_CONVERSATION_EVENT_ACTION.RELOAD,
      conversationRef: null,
    };
  }
  return {
    action: RECENT_CONVERSATION_EVENT_ACTION.POLL_TITLE_VISIBILITY,
    conversationRef,
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

function resolveTimerApi(timerApi) {
  if (timerApi) {
    return timerApi;
  }
  return globalThis.window || globalThis;
}

function scheduleTimer({
  timerApi,
  callback,
  delayMs,
}) {
  const api = resolveTimerApi(timerApi);
  if (typeof callback !== 'function') {
    return null;
  }
  if (!api || typeof api.setTimeout !== 'function') {
    callback();
    return null;
  }
  return api.setTimeout(callback, delayMs);
}

function clearTimer(timerId, timerApi) {
  const api = resolveTimerApi(timerApi);
  if (timerId == null || !api || typeof api.clearTimeout !== 'function') {
    return;
  }
  api.clearTimeout(timerId);
}

function scheduleRecentConversationsRetryTimer({
  callback,
  delayMs,
  timerApi,
} = {}) {
  return scheduleTimer({
    timerApi,
    callback,
    delayMs,
  });
}

function clearRecentConversationsRetryTimer(timerId, { timerApi } = {}) {
  clearTimer(timerId, timerApi);
}

function clearTitleVisibilityPollTimer({
  pendingTimers,
  conversationRef,
  timerApi,
} = {}) {
  const targetRef = normalizeOptionalString(conversationRef);
  if (!pendingTimers || typeof pendingTimers.get !== 'function' || !targetRef) {
    return;
  }
  const timerId = pendingTimers.get(targetRef);
  clearTimer(timerId, timerApi);
  if (typeof pendingTimers.delete === 'function') {
    pendingTimers.delete(targetRef);
  }
}

function scheduleTitleVisibilityPollTimer({
  pendingTimers,
  conversationRef,
  callback,
  delayMs = TITLE_VISIBILITY_POLL_DELAY_MS,
  timerApi,
} = {}) {
  const targetRef = normalizeOptionalString(conversationRef);
  if (!pendingTimers || typeof pendingTimers.set !== 'function' || !targetRef) {
    return null;
  }
  clearTitleVisibilityPollTimer({
    pendingTimers,
    conversationRef: targetRef,
    timerApi,
  });
  const timerId = scheduleTimer({
    timerApi,
    callback,
    delayMs,
  });
  if (timerId != null) {
    pendingTimers.set(targetRef, timerId);
  }
  return timerId;
}

function clearAllTitleVisibilityPollTimers({
  pendingTimers,
  timerApi,
} = {}) {
  if (!pendingTimers || typeof pendingTimers.values !== 'function') {
    return;
  }
  for (const timerId of pendingTimers.values()) {
    clearTimer(timerId, timerApi);
  }
  if (typeof pendingTimers.clear === 'function') {
    pendingTimers.clear();
  }
}

function scheduleConversationSearchDebounce({
  callback,
  delayMs = CONVERSATION_SEARCH_DEBOUNCE_DELAY_MS,
  timerApi,
} = {}) {
  return scheduleTimer({
    timerApi,
    callback,
    delayMs,
  });
}

function clearConversationSearchDebounce(timerId, { timerApi } = {}) {
  clearTimer(timerId, timerApi);
}

function scheduleRecentConversationsRefreshTimer({
  callback,
  delayMs = RECENT_CONVERSATION_REFRESH_DEBOUNCE_DELAY_MS,
  timerApi,
} = {}) {
  return scheduleTimer({
    timerApi,
    callback,
    delayMs,
  });
}

function clearRecentConversationsRefreshTimer(timerId, { timerApi } = {}) {
  clearTimer(timerId, timerApi);
}

export const DesktopDashboardConversationLoadRuntime = Object.freeze({
  clearAllTitleVisibilityPollTimers,
  clearConversationSearchDebounce,
  clearRecentConversationsRefreshTimer,
  clearRecentConversationsRetryTimer,
  clearTitleVisibilityPollTimer,
  getDashboardConversationRef,
  getDashboardConversationRenamePromptValue,
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
  scheduleConversationSearchDebounce,
  scheduleRecentConversationsRefreshTimer,
  scheduleRecentConversationsRetryTimer,
  scheduleTitleVisibilityPollTimer,
  shouldContinueTitleVisibilityPoll,
  shouldReloadRecentConversationsForEventAction,
  shouldRetryRecentConversationsLoad,
  togglePinnedConversationRef,
});
