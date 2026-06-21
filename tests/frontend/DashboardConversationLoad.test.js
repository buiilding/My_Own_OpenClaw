/**
 * Covers dashboard conversation load. behavior in the frontend test suite.
 */

import {
  getDashboardConversationRef,
  getDashboardConversationRenamePromptValue,
  getTitleVisibilityPollSchedule,
  getTitleVisibilityPollConversationRef,
  isConversationVisibleInRecentConversations,
  metadataListToDashboardConversations,
  metadataToDashboardConversation,
  normalizeRecentConversations,
  prunePinnedConversationRefs,
  removeDashboardConversationFromList,
  removePinnedConversationRef,
  renameDashboardConversationInList,
  resolveRecentConversationEventAction,
  resolveRecentConversationsRetryDelayMs,
  shouldContinueTitleVisibilityPoll,
  shouldRetryRecentConversationsLoad,
  shouldReloadRecentConversationsForEventAction,
  togglePinnedConversationRef,
} from '../../frontend/src/renderer/app/runtime/desktopDashboardConversationLoadRuntime';
import * as DashboardConversationLoadRuntime from '../../frontend/src/renderer/app/runtime/desktopDashboardConversationLoadRuntime';

describe('desktopDashboardConversationLoadRuntime', () => {
  test('metadataToDashboardConversation normalizes SDK metadata for dashboard rows', () => {
    expect(metadataToDashboardConversation({
      conversationRef: 'conv-1',
      title: '',
      lastMessage: 'last reply',
      updatedAt: '2026-06-19T12:00:00.000Z',
      eventCount: 4,
      workspacePath: '/work/project-alpha',
      workspaceName: 'Project Alpha',
      snippet: 'matched text',
      matchedRole: 'assistant',
    })).toEqual({
      conversation_id: 'conv-1',
      record_kind: 'chat_event',
      title: 'conv-1',
      last_message: 'last reply',
      last_timestamp: '2026-06-19T12:00:00.000Z',
      entry_count: 4,
      workspace_path: '/work/project-alpha',
      workspace_name: 'Project Alpha',
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

  test('dashboard conversation row identity and list updates stay in the runtime', () => {
    const conversations = [
      { conversation_id: ' conv-1 ', title: ' First ' },
      { conversation_id: 'conv-2', title: '' },
      { conversation_id: 'conv-3', title: 'Third' },
    ];

    expect(getDashboardConversationRef(conversations[0])).toBe('conv-1');
    expect(getDashboardConversationRef(null)).toBe('');
    expect(getDashboardConversationRenamePromptValue(conversations[0])).toBe('First');
    expect(getDashboardConversationRenamePromptValue(conversations[1])).toBe('New chat');
    expect(DashboardConversationLoadRuntime).not.toHaveProperty('getDashboardConversationTitle');
    expect(DashboardConversationLoadRuntime).not.toHaveProperty('isDashboardConversationRef');

    expect(renameDashboardConversationInList(
      conversations,
      'conv-1',
      'Renamed',
    )).toEqual([
      { conversation_id: ' conv-1 ', title: 'Renamed' },
      { conversation_id: 'conv-2', title: '' },
      { conversation_id: 'conv-3', title: 'Third' },
    ]);
    expect(removeDashboardConversationFromList(conversations, 'conv-2')).toEqual([
      { conversation_id: ' conv-1 ', title: ' First ' },
      { conversation_id: 'conv-3', title: 'Third' },
    ]);
    expect(togglePinnedConversationRef(['conv-1'], 'conv-2')).toEqual(['conv-2', 'conv-1']);
    expect(togglePinnedConversationRef(['conv-2', 'conv-1'], 'conv-2')).toEqual(['conv-1']);
    expect(removePinnedConversationRef(['conv-2', 'conv-1'], 'conv-2')).toEqual(['conv-1']);
  });

  test('classifies conversation events for recent-list reload and title polling', () => {
    const userAction = resolveRecentConversationEventAction({
      type: 'user_message',
      conversationRef: 'conv-user',
    });
    expect(shouldReloadRecentConversationsForEventAction(userAction)).toBe(true);
    expect(getTitleVisibilityPollConversationRef(userAction)).toBeNull();

    const assistantAction = resolveRecentConversationEventAction({
      type: 'assistant_message',
      conversationRef: ' conv-assistant ',
    });
    expect(shouldReloadRecentConversationsForEventAction(assistantAction)).toBe(false);
    expect(getTitleVisibilityPollConversationRef(assistantAction)).toBe('conv-assistant');

    const assistantWithoutRefAction = resolveRecentConversationEventAction({
      type: 'assistant_message',
    });
    expect(shouldReloadRecentConversationsForEventAction(assistantWithoutRefAction)).toBe(true);
    expect(getTitleVisibilityPollConversationRef(assistantWithoutRefAction)).toBeNull();

    const ignoredAction = resolveRecentConversationEventAction({
      type: 'tool_call',
      conversationRef: 'conv-tool',
    });
    expect(shouldReloadRecentConversationsForEventAction(ignoredAction)).toBe(false);
    expect(getTitleVisibilityPollConversationRef(ignoredAction)).toBeNull();
  });

  test('resolveRecentConversationsRetryDelayMs applies bounded exponential backoff', () => {
    expect(resolveRecentConversationsRetryDelayMs(0)).toBe(250);
    expect(resolveRecentConversationsRetryDelayMs(1)).toBe(500);
    expect(resolveRecentConversationsRetryDelayMs(3)).toBe(2000);
    expect(resolveRecentConversationsRetryDelayMs(7)).toBe(2000);
  });

  test('title visibility poll schedule and visibility rules stay in the runtime', () => {
    expect(getTitleVisibilityPollSchedule()).toEqual({
      delayMs: 1250,
      maxAttempts: 240,
    });

    expect(isConversationVisibleInRecentConversations([
      { conversation_id: 'conv-visible' },
      { conversation_id: ' conv-trimmed ' },
    ], 'conv-visible')).toBe(true);
    expect(isConversationVisibleInRecentConversations([
      { conversation_id: ' conv-trimmed ' },
    ], 'conv-trimmed')).toBe(true);
    expect(isConversationVisibleInRecentConversations([
      { conversation_id: 'conv-other' },
    ], 'conv-missing')).toBe(false);
    expect(isConversationVisibleInRecentConversations(null, 'conv-missing')).toBe(false);

    expect(shouldContinueTitleVisibilityPoll({
      recentConversations: [{ conversation_id: 'conv-other' }],
      conversationRef: 'conv-target',
      attempts: 1,
    })).toBe(true);
    expect(shouldContinueTitleVisibilityPoll({
      recentConversations: [{ conversation_id: 'conv-target' }],
      conversationRef: 'conv-target',
      attempts: 1,
    })).toBe(false);
    expect(shouldContinueTitleVisibilityPoll({
      recentConversations: [{ conversation_id: 'conv-other' }],
      conversationRef: 'conv-target',
      attempts: 240,
    })).toBe(false);
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
