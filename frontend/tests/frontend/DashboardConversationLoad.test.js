/**
 * Covers dashboard conversation load. behavior in the frontend test suite.
 */

import {
  DesktopDashboardConversationLoadRuntime,
} from '../../src/renderer/app/runtime/desktopDashboardConversationLoadRuntime';
import * as DashboardConversationLoadRuntime from '../../src/renderer/app/runtime/desktopDashboardConversationLoadRuntime';

const {
  applyDashboardConversationWorkspaceBindings,
  applyDashboardConversationOpenWorkspaceReset,
  clearAllTitleVisibilityPollTimers,
  clearConversationSearchDebounce,
  clearRecentConversationsRetryTimer,
  clearTitleVisibilityPollTimer,
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
  scheduleConversationSearchDebounce,
  scheduleRecentConversationsRetryTimer,
  scheduleTitleVisibilityPollTimer,
  shouldContinueTitleVisibilityPoll,
  shouldRetryRecentConversationsLoad,
  shouldReloadRecentConversationsForEventAction,
  togglePinnedConversationRef,
} = DesktopDashboardConversationLoadRuntime;

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

  test('metadataToDashboardConversation accepts local-runtime snake_case workspace rows', () => {
    expect(metadataToDashboardConversation({
      conversation_id: 'conv-2',
      title: '',
      last_message: 'stored reply',
      last_timestamp: '2026-06-19T13:00:00.000Z',
      entry_count: 3,
      workspace_path: '/work/project-beta',
      workspace_name: '',
      matched_role: 'user',
    })).toEqual(expect.objectContaining({
      conversation_id: 'conv-2',
      title: 'conv-2',
      last_message: 'stored reply',
      last_timestamp: '2026-06-19T13:00:00.000Z',
      entry_count: 3,
      workspace_path: '/work/project-beta',
      workspace_name: '',
      matched_role: 'user',
    }));
  });

  test('applies conversation workspace binding fallback to metadata rows without workspace fields', () => {
    const conversations = applyDashboardConversationWorkspaceBindings([
      {
        conversation_id: 'conv-bound',
        title: 'Bound chat',
        workspace_path: '',
        workspace_name: '',
      },
      {
        conversation_id: 'conv-stored',
        title: 'Stored chat',
        workspace_path: '/work/stored',
        workspace_name: 'Stored',
      },
    ], {
      getConversationWorkspaceBinding: jest.fn((conversationRef) => (
        conversationRef === 'conv-bound'
          ? { workspacePath: '/work/project-alpha', workspaceName: 'Project Alpha' }
          : { workspacePath: '/work/ignored', workspaceName: 'Ignored' }
      )),
    });

    expect(conversations).toEqual([
      expect.objectContaining({
        conversation_id: 'conv-bound',
        workspace_path: '/work/project-alpha',
        workspace_name: 'Project Alpha',
      }),
      expect.objectContaining({
        conversation_id: 'conv-stored',
        workspace_path: '/work/stored',
        workspace_name: 'Stored',
      }),
    ]);
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

  test('applies open-conversation workspace reset only before cached ConversationView exists', () => {
    const getWorkspaceState = jest.fn((conversationRef) => (
      conversationRef === 'conv-cached'
        ? {
          messages: [{ id: 'stale-row' }],
          conversationView: {
            conversationRef: 'conv-cached',
            displayRows: [{ id: 'sdk-row' }],
          },
        }
        : {
          messages: [{ id: 'raw-row' }],
          conversationView: null,
        }
    ));
    const clearMessages = jest.fn();
    const setIsSending = jest.fn();
    const setThinkingStatus = jest.fn();
    const setTokenCounts = jest.fn();

    expect(applyDashboardConversationOpenWorkspaceReset({
      conversationRef: ' conv-raw ',
      getWorkspaceState,
      clearMessages,
      setIsSending,
      setThinkingStatus,
      setTokenCounts,
    })).toEqual({
      didReset: true,
      hasConversationView: false,
    });
    expect(clearMessages).toHaveBeenCalledWith('conv-raw');
    expect(setIsSending).toHaveBeenCalledWith(false, 'conv-raw');
    expect(setThinkingStatus).toHaveBeenCalledWith(null, 'conv-raw');
    expect(setTokenCounts).toHaveBeenCalledWith(null, 'conv-raw');

    clearMessages.mockClear();
    setIsSending.mockClear();
    setThinkingStatus.mockClear();
    setTokenCounts.mockClear();

    expect(applyDashboardConversationOpenWorkspaceReset({
      conversationRef: 'conv-cached',
      getWorkspaceState,
      clearMessages,
      setIsSending,
      setThinkingStatus,
      setTokenCounts,
    })).toEqual({
      didReset: false,
      hasConversationView: true,
    });
    expect(clearMessages).not.toHaveBeenCalled();
    expect(setIsSending).not.toHaveBeenCalled();
    expect(setThinkingStatus).not.toHaveBeenCalled();
    expect(setTokenCounts).not.toHaveBeenCalled();
  });

  test('classifies conversation events for recent-list reload and title polling', () => {
    const userAction = resolveRecentConversationEventAction({
      type: 'user_message',
      conversationRef: 'conv-user',
    });
    expect(shouldReloadRecentConversationsForEventAction(userAction)).toBe(true);
    expect(getTitleVisibilityPollConversationRef(userAction)).toBeNull();
    expect(userAction).not.toHaveProperty('reloadReason');

    const userMetadataAction = resolveRecentConversationEventAction({
      type: 'user_message_metadata',
      conversationRef: 'conv-user',
      payload: {
        workspace_path: '/work/project-alpha',
      },
    });
    expect(shouldReloadRecentConversationsForEventAction(userMetadataAction)).toBe(true);
    expect(getTitleVisibilityPollConversationRef(userMetadataAction)).toBeNull();
    expect(userMetadataAction).not.toHaveProperty('reloadReason');

    const assistantAction = resolveRecentConversationEventAction({
      type: 'assistant_message',
      conversationRef: ' conv-assistant ',
    });
    expect(shouldReloadRecentConversationsForEventAction(assistantAction)).toBe(false);
    expect(getTitleVisibilityPollConversationRef(assistantAction)).toBe('conv-assistant');
    expect(assistantAction).not.toHaveProperty('reloadReason');

    const assistantWithoutRefAction = resolveRecentConversationEventAction({
      type: 'assistant_message',
    });
    expect(shouldReloadRecentConversationsForEventAction(assistantWithoutRefAction)).toBe(true);
    expect(getTitleVisibilityPollConversationRef(assistantWithoutRefAction)).toBeNull();
    expect(assistantWithoutRefAction).not.toHaveProperty('reloadReason');

    const ignoredAction = resolveRecentConversationEventAction({
      type: 'tool_call',
      conversationRef: 'conv-tool',
    });
    expect(shouldReloadRecentConversationsForEventAction(ignoredAction)).toBe(false);
    expect(getTitleVisibilityPollConversationRef(ignoredAction)).toBeNull();
    expect(ignoredAction).not.toHaveProperty('reloadReason');
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

  test('title visibility poll timers stay behind the runtime adapter', () => {
    let nextTimerId = 0;
    const timerApi = {
      setTimeout: jest.fn(() => {
        nextTimerId += 1;
        return `timer-${nextTimerId}`;
      }),
      clearTimeout: jest.fn(),
    };
    const pendingTimers = new Map([
      ['conv-title', 'old-title-timer'],
    ]);
    const callback = jest.fn();

    const timerId = scheduleTitleVisibilityPollTimer({
      pendingTimers,
      conversationRef: ' conv-title ',
      callback,
      delayMs: 75,
      timerApi,
    });

    expect(timerId).toBe('timer-1');
    expect(timerApi.clearTimeout).toHaveBeenCalledWith('old-title-timer');
    expect(timerApi.setTimeout).toHaveBeenCalledWith(callback, 75);
    expect(pendingTimers.get('conv-title')).toBe('timer-1');

    clearTitleVisibilityPollTimer({
      pendingTimers,
      conversationRef: 'conv-title',
      timerApi,
    });

    expect(timerApi.clearTimeout).toHaveBeenCalledWith('timer-1');
    expect(pendingTimers.has('conv-title')).toBe(false);

    scheduleTitleVisibilityPollTimer({
      pendingTimers,
      conversationRef: 'conv-a',
      callback,
      timerApi,
    });
    scheduleTitleVisibilityPollTimer({
      pendingTimers,
      conversationRef: 'conv-b',
      callback,
      timerApi,
    });
    clearAllTitleVisibilityPollTimers({ pendingTimers, timerApi });

    expect(timerApi.clearTimeout).toHaveBeenCalledWith('timer-2');
    expect(timerApi.clearTimeout).toHaveBeenCalledWith('timer-3');
    expect(pendingTimers.size).toBe(0);
  });

  test('recent retry and search debounce timers stay behind runtime adapters', () => {
    const timerApi = {
      setTimeout: jest.fn((callback) => `timer-${timerApi.setTimeout.mock.calls.length}-${typeof callback}`),
      clearTimeout: jest.fn(),
    };
    const retryCallback = jest.fn();
    const searchCallback = jest.fn();

    const retryTimer = scheduleRecentConversationsRetryTimer({
      callback: retryCallback,
      delayMs: 250,
      timerApi,
    });
    const searchTimer = scheduleConversationSearchDebounce({
      callback: searchCallback,
      timerApi,
    });

    expect(retryTimer).toBe('timer-1-function');
    expect(searchTimer).toBe('timer-2-function');
    expect(timerApi.setTimeout).toHaveBeenNthCalledWith(1, retryCallback, 250);
    expect(timerApi.setTimeout).toHaveBeenNthCalledWith(2, searchCallback, 180);

    clearRecentConversationsRetryTimer(retryTimer, { timerApi });
    clearConversationSearchDebounce(searchTimer, { timerApi });

    expect(timerApi.clearTimeout).toHaveBeenCalledWith('timer-1-function');
    expect(timerApi.clearTimeout).toHaveBeenCalledWith('timer-2-function');

    const fallbackCallback = jest.fn();
    expect(scheduleConversationSearchDebounce({
      callback: fallbackCallback,
      timerApi: {},
    })).toBeNull();
    expect(fallbackCallback).toHaveBeenCalledTimes(1);
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
