/**
 * Provides renderer chat stream thinking-status presentation helpers.
 */

const MAX_THINKING_STATUS_LENGTH = 5000;

export const COMPACTION_THINKING_STATUS = 'Compacting conversation history...';
export const COMPACTION_COMPLETED_THINKING_STATUS = 'Conversation history compacted.';
export const COMPACTION_FAILED_THINKING_STATUS = 'Conversation compaction failed.';
export const GENERIC_THINKING_STATUS = 'Thinking...';

export function buildThinkingStatus(currentStatus: string | null, chunk?: string): string {
  const updated = (currentStatus || '') + (chunk || '');
  return updated.length > MAX_THINKING_STATUS_LENGTH
    ? updated.slice(-MAX_THINKING_STATUS_LENGTH)
    : updated;
}
