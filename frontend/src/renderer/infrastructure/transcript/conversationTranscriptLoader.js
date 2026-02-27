import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_PAGES = 250;

function resolveMemoryMessageIndex(memory) {
  const value = memory?.message_index;
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

/**
 * Load one full transcript conversation from local DB via paginated get-conversation RPC.
 * Uses message_index cursor pagination to avoid the fixed 1000-row cap.
 */
export async function loadConversationTranscriptMemories({
  userId,
  conversationRef,
  recordKind = 'transcript',
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
}) {
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  const normalizedConversationRef = typeof conversationRef === 'string'
    ? conversationRef.trim()
    : '';
  if (!normalizedUserId || !normalizedConversationRef) {
    return [];
  }

  const allMemories = [];
  let afterMessageIndex = null;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await IpcBridge.invoke(INVOKE_CHANNELS.GET_CONVERSATION, {
      userId: normalizedUserId,
      conversationId: normalizedConversationRef,
      limit: pageSize,
      recordKind,
      afterMessageIndex,
    });
    if (!result || result.success === false) {
      throw new Error(result?.error || 'Failed to load conversation');
    }

    const memories = Array.isArray(result?.data?.memories) ? result.data.memories : [];
    if (memories.length === 0) {
      break;
    }

    allMemories.push(...memories);
    if (memories.length < pageSize) {
      break;
    }

    const lastMemory = memories[memories.length - 1];
    const nextMessageIndex = resolveMemoryMessageIndex(lastMemory);
    if (nextMessageIndex === null || nextMessageIndex === afterMessageIndex) {
      break;
    }
    afterMessageIndex = nextMessageIndex;
  }

  return allMemories;
}
