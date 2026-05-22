import type {
  ConversationMetadata,
  ListConversationOptions,
  SearchConversationOptions,
} from './types.js';

export function applyConversationMetadataPagination<T extends { conversationRef: string }>(
  metadata: T[],
  options: ListConversationOptions = {},
): T[] {
  const cursorIndex = typeof options.cursor === 'string'
    ? metadata.findIndex(entry => entry.conversationRef === options.cursor)
    : -1;
  const afterCursor = cursorIndex >= 0 ? metadata.slice(cursorIndex + 1) : metadata;
  return typeof options.limit === 'number' ? afterCursor.slice(0, options.limit) : afterCursor;
}

export function searchConversationMetadata(
  metadata: ConversationMetadata[],
  options: SearchConversationOptions,
): ConversationMetadata[] {
  const normalizedQuery = options.query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }
  const matches = metadata.filter(entry => [
    entry.conversationRef,
    entry.title,
    entry.lastMessage,
  ].some(value => String(value ?? '').toLowerCase().includes(normalizedQuery)));
  return applyConversationMetadataPagination(matches, options);
}
