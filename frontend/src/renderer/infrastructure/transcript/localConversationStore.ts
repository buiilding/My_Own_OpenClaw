import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_PAGES = 250;
const SDK_CONVERSATION_EVENT_RECORD_KIND = 'conversation_event';

function logLocalConversationStore(stage: string, payload: Record<string, unknown> = {}) {
  if (typeof console === 'undefined') {
    return;
  }
  console.log('[LocalConversationStore]', stage, payload);
}

type LocalConversationRecordKind = string;

type ListStoredConversationsOptions = {
  userId: string;
  limit?: number | null;
  recordKind?: LocalConversationRecordKind;
};

type SearchStoredConversationsOptions = {
  userId: string;
  query: string;
  limit?: number;
  recordKind?: LocalConversationRecordKind;
};

type LoadStoredConversationEntriesOptions = {
  userId: string;
  conversationRef: string;
  recordKind?: LocalConversationRecordKind;
  pageSize?: number;
  maxPages?: number;
};

function normalizeNonEmptyString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function resolveEntryMessageIndex(entry: Record<string, unknown>) {
  const value = entry?.message_index;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export async function listStoredConversations({
  userId,
  limit = null,
  recordKind = SDK_CONVERSATION_EVENT_RECORD_KIND,
}: ListStoredConversationsOptions): Promise<Array<Record<string, unknown>>> {
  const normalizedUserId = normalizeNonEmptyString(userId);
  if (!normalizedUserId) {
    return [];
  }

  const payload: Record<string, unknown> = {
    userId: normalizedUserId,
    recordKind,
  };
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    payload.limit = Math.floor(limit);
  }

  logLocalConversationStore('list-conversations-request', payload);
  const result = await IpcBridge.invoke(INVOKE_CHANNELS.LIST_CONVERSATIONS, payload);
  if (!result || result.success === false) {
    logLocalConversationStore('list-conversations-error', {
      userId: normalizedUserId,
      recordKind,
      error: result?.error || 'Failed to list stored conversations',
    });
    throw new Error(result?.error || 'Failed to list stored conversations');
  }

  const conversations = Array.isArray(result?.data?.conversations)
    ? result.data.conversations
    : [];
  logLocalConversationStore('list-conversations-response', {
    userId: normalizedUserId,
    recordKind,
    count: conversations.length,
    firstConversationIds: conversations.slice(0, 5).map((conversation) => (
      typeof conversation?.conversation_id === 'string'
        ? conversation.conversation_id
        : conversation?.conversationId
    )),
    firstTitles: conversations.slice(0, 5).map((conversation) => conversation?.title),
  });
  return conversations;
}

export async function searchStoredConversations({
  userId,
  query,
  limit = 60,
  recordKind = SDK_CONVERSATION_EVENT_RECORD_KIND,
}: SearchStoredConversationsOptions): Promise<Array<Record<string, unknown>>> {
  const normalizedUserId = normalizeNonEmptyString(userId);
  const normalizedQuery = normalizeNonEmptyString(query);
  if (!normalizedUserId || !normalizedQuery) {
    return [];
  }

  const result = await IpcBridge.invoke(INVOKE_CHANNELS.SEARCH_CONVERSATIONS, {
    userId: normalizedUserId,
    query: normalizedQuery,
    limit,
    recordKind,
  });
  if (!result || result.success === false) {
    throw new Error(result?.error || 'Failed to search stored conversations');
  }

  return Array.isArray(result?.data?.conversations)
    ? result.data.conversations
    : [];
}

/**
 * Load one full SDK conversation-event log from the local store via paginated get-conversation IPC.
 * Uses message_index cursor pagination to avoid the fixed 1000-row cap.
 */
export async function loadStoredConversationEntries({
  userId,
  conversationRef,
  recordKind = SDK_CONVERSATION_EVENT_RECORD_KIND,
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
}: LoadStoredConversationEntriesOptions): Promise<Array<Record<string, unknown>>> {
  const normalizedUserId = normalizeNonEmptyString(userId);
  const normalizedConversationRef = normalizeNonEmptyString(conversationRef);
  if (!normalizedUserId || !normalizedConversationRef) {
    return [];
  }

  const allEntries: Array<Record<string, unknown>> = [];
  let afterMessageIndex: number | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const result = await IpcBridge.invoke(INVOKE_CHANNELS.GET_CONVERSATION, {
      userId: normalizedUserId,
      conversationId: normalizedConversationRef,
      limit: pageSize,
      recordKind,
      afterMessageIndex,
    });
    if (!result || result.success === false) {
      throw new Error(result?.error || 'Failed to load stored conversation');
    }

    const entries = Array.isArray(result?.data?.memories) ? result.data.memories : [];
    if (entries.length === 0) {
      break;
    }

    allEntries.push(...entries);
    if (entries.length < pageSize) {
      break;
    }

    const lastEntry = entries[entries.length - 1];
    const nextMessageIndex = resolveEntryMessageIndex(lastEntry);
    if (nextMessageIndex === null || nextMessageIndex === afterMessageIndex) {
      break;
    }
    afterMessageIndex = nextMessageIndex;
  }

  return allEntries;
}
