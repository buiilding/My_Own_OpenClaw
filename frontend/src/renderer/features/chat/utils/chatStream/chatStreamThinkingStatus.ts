/**
 * Provides the chat stream thinking status module for the renderer UI.
 */

export const COMPACTION_THINKING_STATUS = 'Compacting conversation history...';
export const COMPACTION_COMPLETED_THINKING_STATUS = 'Conversation history compacted.';
export const COMPACTION_COMPLETED_NO_CHANGES_THINKING_STATUS = 'Compaction completed (no changes needed).';
export const COMPACTION_FAILED_THINKING_STATUS = 'Conversation compaction failed.';
export const GENERIC_THINKING_STATUS = 'Thinking...';

const NON_PERSISTED_THINKING_STATUSES = new Set([
  GENERIC_THINKING_STATUS,
  COMPACTION_THINKING_STATUS,
  COMPACTION_COMPLETED_THINKING_STATUS,
  COMPACTION_COMPLETED_NO_CHANGES_THINKING_STATUS,
  COMPACTION_FAILED_THINKING_STATUS,
]);

export function normalizePersistedThinkingStatus(
  thinkingStatus: string | null,
): string | null {
  if (typeof thinkingStatus !== 'string') {
    return null;
  }
  const trimmed = thinkingStatus.trim();
  if (!trimmed || NON_PERSISTED_THINKING_STATUSES.has(trimmed)) {
    return null;
  }
  return trimmed;
}
