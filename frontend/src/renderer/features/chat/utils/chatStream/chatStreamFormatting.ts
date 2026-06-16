/**
 * Provides the chat stream formatting module for the renderer UI.
 */

const MAX_THINKING_STATUS_LENGTH = 5000;

export function buildThinkingStatus(currentStatus: string | null, chunk?: string): string {
  const updated = (currentStatus || '') + (chunk || '');
  return updated.length > MAX_THINKING_STATUS_LENGTH
    ? updated.slice(-MAX_THINKING_STATUS_LENGTH)
    : updated;
}
