/**
 * Provides renderer chat stream thinking-status presentation helpers.
 */

const MAX_THINKING_STATUS_LENGTH = 5000;

const COMPACTION_THINKING_STATUS = 'Compacting conversation history...';
const COMPACTION_COMPLETED_THINKING_STATUS = 'Conversation history compacted.';
const COMPACTION_FAILED_THINKING_STATUS = 'Conversation compaction failed.';
const GENERIC_THINKING_STATUS = 'Thinking...';

export function buildThinkingStatus(currentStatus: string | null, chunk?: string): string {
  const updated = (currentStatus || '') + (chunk || '');
  return updated.length > MAX_THINKING_STATUS_LENGTH
    ? updated.slice(-MAX_THINKING_STATUS_LENGTH)
    : updated;
}

export function getGenericThinkingStatus(): string {
  return GENERIC_THINKING_STATUS;
}

export function isGenericThinkingStatus(status: string | null | undefined): boolean {
  return status === GENERIC_THINKING_STATUS;
}

export function getCompactionStartedThinkingStatus(): string {
  return COMPACTION_THINKING_STATUS;
}

export function getCompactionCompletedThinkingStatus(): string {
  return COMPACTION_COMPLETED_THINKING_STATUS;
}

export function getCompactionFailedThinkingStatus(): string {
  return COMPACTION_FAILED_THINKING_STATUS;
}

export function resolveCompactionFailedThinkingStatus(
  errorText?: string | null,
): string {
  return errorText || COMPACTION_FAILED_THINKING_STATUS;
}
