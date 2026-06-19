/**
 * Covers dashboard conversation load. behavior in the frontend test suite.
 */

import {
  metadataListToDashboardConversations,
  metadataToDashboardConversation,
  normalizeRecentConversations,
  prunePinnedConversationRefs,
  resolveRecentConversationsRetryDelayMs,
  shouldRetryRecentConversationsLoad,
} from '../../frontend/src/renderer/app/runtime/desktopDashboardConversationLoadRuntime';

describe('desktopDashboardConversationLoadRuntime', () => {
  test('metadataToDashboardConversation normalizes SDK metadata for dashboard rows', () => {
    expect(metadataToDashboardConversation({
      conversationRef: 'conv-1',
      title: '',
      lastMessage: 'last reply',
      updatedAt: '2026-06-19T12:00:00.000Z',
      eventCount: 4,
      workspacePath: '/work/WindieOS',
      workspaceName: 'WindieOS',
      snippet: 'matched text',
      matchedRole: 'assistant',
    })).toEqual({
      conversation_id: 'conv-1',
      record_kind: 'chat_event',
      title: 'conv-1',
      last_message: 'last reply',
      last_timestamp: '2026-06-19T12:00:00.000Z',
      entry_count: 4,
      workspace_path: '/work/WindieOS',
      workspace_name: 'WindieOS',
      snippet: 'matched text',
      matched_role: 'assistant',
    });

    expect(metadataListToDashboardConversations(null)).toEqual([]);
  });

  test('normalizeRecentConversations filters missing ids and sorts newest first', () => {
    const list = normalizeRecentConversations([
      { conversation_id: 'c-old', last_timestamp: '2024-01-01T00:00:00Z' },
      { conversation_id: 'c-new', last_timestamp: '2024-01-03T00:00:00Z' },
      { conversation_id: '', last_timestamp: '2024-01-04T00:00:00Z' },
      { conversation_id: 'c-mid', last_timestamp: '2024-01-02T00:00:00Z' },
    ]);

    expect(list.map((item) => item.conversation_id)).toEqual([
      'c-new',
      'c-mid',
      'c-old',
    ]);
  });

  test('prunePinnedConversationRefs keeps only known conversation ids', () => {
    expect(prunePinnedConversationRefs(
      ['c-1', 'c-2', 'c-missing'],
      [{ conversation_id: 'c-2' }, { conversation_id: 'c-1' }],
    )).toEqual(['c-1', 'c-2']);
  });

  test('resolveRecentConversationsRetryDelayMs applies bounded exponential backoff', () => {
    expect(resolveRecentConversationsRetryDelayMs(0)).toBe(250);
    expect(resolveRecentConversationsRetryDelayMs(1)).toBe(500);
    expect(resolveRecentConversationsRetryDelayMs(3)).toBe(2000);
    expect(resolveRecentConversationsRetryDelayMs(7)).toBe(2000);
  });

  test('shouldRetryRecentConversationsLoad gates retries by loading/state/error/attempt', () => {
    expect(shouldRetryRecentConversationsLoad({
      isLoadingRecentConversations: false,
      recentConversationsCount: 0,
      recentConversationsError: 'Local runtime not ready',
      retryAttempt: 0,
      isTransientError: (message) => String(message).toLowerCase().includes('local runtime'),
    })).toBe(true);

    expect(shouldRetryRecentConversationsLoad({
      isLoadingRecentConversations: true,
      recentConversationsCount: 0,
      recentConversationsError: 'Local runtime not ready',
      retryAttempt: 0,
    })).toBe(false);

    expect(shouldRetryRecentConversationsLoad({
      isLoadingRecentConversations: false,
      recentConversationsCount: 1,
      recentConversationsError: 'Local runtime not ready',
      retryAttempt: 0,
    })).toBe(false);

    expect(shouldRetryRecentConversationsLoad({
      isLoadingRecentConversations: false,
      recentConversationsCount: 0,
      recentConversationsError: 'request timed out while fetching',
      retryAttempt: 0,
    })).toBe(true);

    expect(shouldRetryRecentConversationsLoad({
      isLoadingRecentConversations: false,
      recentConversationsCount: 0,
      recentConversationsError: 'Failed to list stored conversations: timed out waiting for local runtime discovery',
      retryAttempt: 0,
      isTransientError: (message) => String(message).toLowerCase().includes('local runtime'),
    })).toBe(true);

    expect(shouldRetryRecentConversationsLoad({
      isLoadingRecentConversations: false,
      recentConversationsCount: 0,
      recentConversationsError: 'Failed to list stored conversations: fetch failed',
      retryAttempt: 0,
    })).toBe(true);

    expect(shouldRetryRecentConversationsLoad({
      isLoadingRecentConversations: false,
      recentConversationsCount: 0,
      recentConversationsError: 'hard failure',
      retryAttempt: 0,
    })).toBe(false);

    expect(shouldRetryRecentConversationsLoad({
      isLoadingRecentConversations: false,
      recentConversationsCount: 0,
      recentConversationsError: 'request timed out',
      retryAttempt: 8,
    })).toBe(false);
  });

  test('keeps runtime-specific transient error matching outside the dashboard utility', () => {
    expect(shouldRetryRecentConversationsLoad({
      isLoadingRecentConversations: false,
      recentConversationsCount: 0,
      recentConversationsError: 'Local runtime not ready',
      retryAttempt: 0,
    })).toBe(false);

    expect(shouldRetryRecentConversationsLoad({
      isLoadingRecentConversations: false,
      recentConversationsCount: 0,
      recentConversationsError: 'Failed to list stored conversations: timed out waiting for local runtime discovery',
      retryAttempt: 0,
    })).toBe(false);
  });
});
