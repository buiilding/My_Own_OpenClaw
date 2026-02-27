import {
  COMPACTION_THINKING_STATUS,
  GENERIC_THINKING_STATUS,
  normalizePersistedThinkingStatus,
} from '../../frontend/src/renderer/features/chat/utils/chatStreamThinkingStatus';

describe('chatStreamThinkingStatus helpers', () => {
  test('normalizes persisted thinking status by trimming whitespace', () => {
    expect(normalizePersistedThinkingStatus('  Deep thought  ')).toBe('Deep thought');
  });

  test('drops empty, generic, and compaction statuses', () => {
    expect(normalizePersistedThinkingStatus('   ')).toBeNull();
    expect(normalizePersistedThinkingStatus(GENERIC_THINKING_STATUS)).toBeNull();
    expect(normalizePersistedThinkingStatus(COMPACTION_THINKING_STATUS)).toBeNull();
  });

  test('returns null for non-string status values', () => {
    expect(normalizePersistedThinkingStatus(null)).toBeNull();
  });
});

