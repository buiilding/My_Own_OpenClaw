"use strict";
/**
 * Provides the metadata module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyConversationMetadataPagination = applyConversationMetadataPagination;
exports.searchConversationMetadata = searchConversationMetadata;
function normalizePaginationLimit(limit) {
    if (typeof limit !== 'number') {
        return null;
    }
    if (!Number.isFinite(limit) || limit <= 0) {
        return 0;
    }
    return Math.floor(limit);
}
function applyConversationMetadataPagination(metadata, options = {}) {
    const cursorIndex = typeof options.cursor === 'string'
        ? metadata.findIndex(entry => entry.conversationRef === options.cursor)
        : -1;
    const afterCursor = cursorIndex >= 0 ? metadata.slice(cursorIndex + 1) : metadata;
    const limit = normalizePaginationLimit(options.limit);
    return limit === null ? afterCursor : afterCursor.slice(0, limit);
}
function searchConversationMetadata(metadata, options) {
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
