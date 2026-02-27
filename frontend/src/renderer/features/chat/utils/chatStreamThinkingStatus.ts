export const COMPACTION_THINKING_STATUS = 'Compacting conversation history...';
export const GENERIC_THINKING_STATUS = 'Thinking...';

export function normalizePersistedThinkingStatus(
  thinkingStatus: string | null,
): string | null {
  if (typeof thinkingStatus !== 'string') {
    return null;
  }
  const trimmed = thinkingStatus.trim();
  if (!trimmed || trimmed === GENERIC_THINKING_STATUS || trimmed === COMPACTION_THINKING_STATUS) {
    return null;
  }
  return trimmed;
}

