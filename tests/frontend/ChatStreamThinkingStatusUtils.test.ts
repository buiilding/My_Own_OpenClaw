import {
  COMPACTION_COMPLETED_NO_CHANGES_THINKING_STATUS,
  COMPACTION_COMPLETED_THINKING_STATUS,
  COMPACTION_FAILED_THINKING_STATUS,
  COMPACTION_THINKING_STATUS,
  GENERIC_THINKING_STATUS,
  normalizePersistedThinkingStatus,
} from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamThinkingStatus';

describe('chatStreamThinkingStatus helpers', () => {
  test('normalizes persisted thinking status by trimming whitespace', () => {
    expect(normalizePersistedThinkingStatus('  Deep thought  ')).toBe('Deep thought');
  });

  test('drops empty, generic, and compaction lifecycle statuses', () => {
    expect(normalizePersistedThinkingStatus('   ')).toBeNull();
    expect(normalizePersistedThinkingStatus(GENERIC_THINKING_STATUS)).toBeNull();
    expect(normalizePersistedThinkingStatus(COMPACTION_THINKING_STATUS)).toBeNull();
    expect(normalizePersistedThinkingStatus(COMPACTION_COMPLETED_THINKING_STATUS)).toBeNull();
    expect(normalizePersistedThinkingStatus(COMPACTION_COMPLETED_NO_CHANGES_THINKING_STATUS)).toBeNull();
    expect(normalizePersistedThinkingStatus(COMPACTION_FAILED_THINKING_STATUS)).toBeNull();
  });

  test('returns null for non-string status values', () => {
    expect(normalizePersistedThinkingStatus(null)).toBeNull();
  });
});
