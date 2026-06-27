/**
 * Covers use dashboard conversations. behavior in the frontend test suite.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useDashboardConversations } from '../../src/renderer/features/dashboard/hooks/useDashboardConversations';
import { DesktopConversationLibraryClient } from '../../src/renderer/app/runtime/desktopConversationLibraryClient';
import { DesktopLocalRuntimeStatusRuntimeClient } from '../../src/renderer/app/runtime/desktopLocalRuntimeStatusRuntimeClient';
import { DesktopConversationRuntimeEventClient } from '../../src/renderer/app/runtime/desktopConversationRuntimeEventClient';
import { DesktopWorkspaceRuntimeClient } from '../../src/renderer/app/runtime/desktopWorkspaceRuntimeClient';

jest.mock('../../src/renderer/app/runtime/desktopConversationLibraryClient', () => ({
  DesktopConversationLibraryClient: {
    loadConversationView: jest.fn(),
    listMetadata: jest.fn(),
    subscribeMetadataInvalidations: jest.fn(),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    updateTranscriptSession: jest.fn(),
    startNewSession: jest.fn(),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopLocalRuntimeStatusRuntimeClient', () => ({
  DesktopLocalRuntimeStatusRuntimeClient: {
    onReady: jest.fn(),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopConversationRuntimeEventClient', () => ({
  DesktopConversationRuntimeEventClient: {
    onConversationEvent: jest.fn(),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopWorkspaceRuntimeClient', () => ({
  DesktopWorkspaceRuntimeClient: {
    setActiveWorkspaceSelection: jest.fn(),
    clearConversationWorkspaceBinding: jest.fn(),
    resolveConversationWorkspaceBinding: jest.fn(({ conversation }) => ({
      workspacePath: conversation?.workspace_path || '',
      workspaceName: conversation?.workspace_name || '',
    })),
    getConversationWorkspaceBinding: jest.fn(() => ({
      workspacePath: '',
      workspaceName: '',
    })),
    setConversationWorkspaceBinding: jest.fn(),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopConversationSessionRuntime', () => ({
  DesktopConversationSessionRuntime: {
    applyRendererConversationSelection: jest.fn(({ conversationRef, setChatConversationRef }) => {
      setChatConversationRef?.(conversationRef);
    }),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopActiveChatSessionRuntime', () => ({
  DesktopActiveChatSessionRuntime: {
    resetActiveChatSession: jest.fn(),
  },
}));

function renderDashboardConversations(options = {}) {
  return renderHook(() => useDashboardConversations({
    resolvedUserId: 'user-test',
    sessionConversationRef: '',
    activeConversationRef: '',
    getChatWorkspaceState: jest.fn(() => ({ messages: [] })),
    clearChatMessages: jest.fn(),
    setChatMessages: jest.fn(),
    setChatIsSending: jest.fn(),
    setChatThinkingStatus: jest.fn(),
    setChatTokenCounts: jest.fn(),
    setChatActiveConversationRef: jest.fn(),
    setChatConversationView: jest.fn(),
    searchOpen: false,
    ...options,
  }));
}

function renderDashboardConversationsWithProps(initialProps = {}) {
  return renderHook((props) => useDashboardConversations({
    resolvedUserId: props.resolvedUserId,
    sessionConversationRef: '',
    activeConversationRef: '',
    getChatWorkspaceState: jest.fn(() => ({ messages: [] })),
    clearChatMessages: jest.fn(),
    setChatMessages: jest.fn(),
    setChatIsSending: jest.fn(),
    setChatThinkingStatus: jest.fn(),
    setChatTokenCounts: jest.fn(),
    setChatActiveConversationRef: jest.fn(),
    setChatConversationView: jest.fn(),
    searchOpen: false,
  }), {
    initialProps: {
      resolvedUserId: 'user-test',
      ...initialProps,
    },
  });
}

describe('useDashboardConversations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DesktopLocalRuntimeStatusRuntimeClient.onReady.mockImplementation(() => jest.fn());
    DesktopConversationLibraryClient.loadConversationView.mockResolvedValue({
      conversationRef: 'conv-empty',
      displayRows: [],
    });
    DesktopConversationLibraryClient.subscribeMetadataInvalidations.mockImplementation(() => jest.fn());
    DesktopConversationRuntimeEventClient.onConversationEvent.mockImplementation(() => jest.fn());
    DesktopWorkspaceRuntimeClient.getConversationWorkspaceBinding.mockReturnValue({
      workspacePath: '',
      workspaceName: '',
    });
  });

  test('reloads recent conversations when the local runtime becomes ready', async () => {
    let statusSubscriber = null;
    DesktopLocalRuntimeStatusRuntimeClient.onReady.mockImplementation((subscriber) => {
      statusSubscriber = subscriber;
      return jest.fn();
    });
    DesktopConversationLibraryClient.listMetadata
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          conversationRef: 'conv-ready',
          title: 'Loaded after ready',
          lastMessage: 'hello',
          updatedAt: '2026-05-16T20:00:00.000Z',
          eventCount: 2,
        },
      ]);

    const { result } = renderDashboardConversations();

    await waitFor(() => {
      expect(DesktopConversationLibraryClient.listMetadata).toHaveBeenCalledTimes(1);
    });
    expect(result.current.recentConversations).toEqual([]);

    await act(async () => {
      statusSubscriber();
    });

    await waitFor(() => {
      expect(result.current.recentConversations).toEqual([
        expect.objectContaining({
          conversation_id: 'conv-ready',
          title: 'Loaded after ready',
        }),
      ]);
    });
    expect(DesktopConversationLibraryClient.listMetadata).toHaveBeenCalledTimes(2);
  });

  test('reloads recent conversations through SDK metadata invalidations', async () => {
    let metadataInvalidationListener = null;
    DesktopConversationLibraryClient.subscribeMetadataInvalidations.mockImplementation((listener) => {
      metadataInvalidationListener = listener;
      return jest.fn();
    });
    DesktopConversationLibraryClient.listMetadata
      .mockResolvedValueOnce([
        {
          conversationRef: 'conv-title',
          title: 'Old title',
          updatedAt: '2026-05-16T20:00:00.000Z',
          eventCount: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          conversationRef: 'conv-title',
          title: 'New title',
          updatedAt: '2026-05-16T20:01:00.000Z',
          eventCount: 2,
        },
      ]);

    const { result } = renderDashboardConversations();

    await waitFor(() => {
      expect(result.current.recentConversations).toEqual([
        expect.objectContaining({
          conversation_id: 'conv-title',
          title: 'Old title',
        }),
      ]);
    });

    await act(async () => {
      metadataInvalidationListener?.({
        type: 'conversation-metadata-invalidated',
        reason: 'conversation-title-updated',
        conversationRef: 'conv-title',
      });
    });

    await waitFor(() => {
      expect(result.current.recentConversations).toEqual([
        expect.objectContaining({
          conversation_id: 'conv-title',
          title: 'New title',
        }),
      ]);
    });
    expect(DesktopConversationLibraryClient.listMetadata).toHaveBeenCalledTimes(2);
  });

  test('fills missing recent conversation workspace from conversation binding', async () => {
    DesktopWorkspaceRuntimeClient.getConversationWorkspaceBinding.mockImplementation((conversationRef) => (
      conversationRef === 'conv-bound'
        ? {
          workspacePath: '/Users/peterbui/Agent_workspaces/Windieos_workspace/WindieOS',
          workspaceName: 'WindieOS',
        }
        : {
          workspacePath: '',
          workspaceName: '',
        }
    ));
    DesktopConversationLibraryClient.listMetadata.mockResolvedValueOnce([
      {
        conversationRef: 'conv-bound',
        title: 'Scripted runtime ready. Use @script reply,',
        lastMessage: 'ready',
        updatedAt: '2026-06-27T17:39:43.035Z',
        eventCount: 52,
        workspacePath: '',
        workspaceName: '',
      },
    ]);

    const { result } = renderDashboardConversations();

    await waitFor(() => {
      expect(result.current.recentConversations).toEqual([
        expect.objectContaining({
          conversation_id: 'conv-bound',
          workspace_path: '/Users/peterbui/Agent_workspaces/Windieos_workspace/WindieOS',
          workspace_name: 'WindieOS',
        }),
      ]);
    });
  });

  test('reloads recent conversations through SDK conversation events', async () => {
    let sdkConversationEventListener = null;
    DesktopConversationRuntimeEventClient.onConversationEvent.mockImplementation((listener) => {
      sdkConversationEventListener = listener;
      return jest.fn();
    });
    DesktopConversationLibraryClient.listMetadata
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          conversationRef: 'conv-sdk',
          title: 'SDK event chat',
          updatedAt: '2026-05-16T20:01:00.000Z',
          eventCount: 2,
        },
      ]);

    const { result } = renderDashboardConversations();

    await waitFor(() => {
      expect(result.current.recentConversations).toEqual([]);
    });

    await act(async () => {
      sdkConversationEventListener?.({
        type: 'user_message',
        conversationRef: 'conv-sdk',
      });
    });

    await waitFor(() => {
      expect(result.current.recentConversations).toEqual([
        expect.objectContaining({
          conversation_id: 'conv-sdk',
          title: 'SDK event chat',
        }),
      ]);
    });
    expect(DesktopConversationLibraryClient.listMetadata).toHaveBeenCalledTimes(2);
  });

  test('force reload clears recent chats and ignores older in-flight metadata', async () => {
    let resolveBackgroundLoad;
    DesktopConversationLibraryClient.listMetadata
      .mockResolvedValueOnce([
        {
          conversationRef: 'conv-old',
          title: 'Old chat',
          updatedAt: '2026-05-16T20:00:00.000Z',
          eventCount: 2,
        },
      ])
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveBackgroundLoad = resolve;
      }))
      .mockResolvedValueOnce([]);

    const { result } = renderDashboardConversations();

    await waitFor(() => {
      expect(result.current.recentConversations).toEqual([
        expect.objectContaining({
          conversation_id: 'conv-old',
          title: 'Old chat',
        }),
      ]);
    });

    await act(async () => {
      void result.current.loadRecentConversations();
      await Promise.resolve();
    });
    expect(DesktopConversationLibraryClient.listMetadata).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.loadRecentConversations({
        clearBeforeLoad: true,
        forceReload: true,
      });
    });

    expect(DesktopConversationLibraryClient.listMetadata).toHaveBeenCalledTimes(3);
    expect(result.current.recentConversations).toEqual([]);

    await act(async () => {
      resolveBackgroundLoad([
        {
          conversationRef: 'conv-stale',
          title: 'Stale pre-delete chat',
          updatedAt: '2026-05-16T20:01:00.000Z',
          eventCount: 1,
        },
      ]);
      await Promise.resolve();
    });

    expect(result.current.recentConversations).toEqual([]);
  });

  test('keeps rendered recent chats visible during resend-shaped background refresh', async () => {
    let sdkConversationEventListener = null;
    let resolveRefresh;
    DesktopConversationRuntimeEventClient.onConversationEvent.mockImplementation((listener) => {
      sdkConversationEventListener = listener;
      return jest.fn();
    });
    DesktopConversationLibraryClient.listMetadata
      .mockResolvedValueOnce([
        {
          conversationRef: 'conv-resend',
          title: 'Rendered chat before resend',
          updatedAt: '2026-05-16T20:00:00.000Z',
          eventCount: 2,
        },
      ])
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRefresh = resolve;
      }));

    const { result } = renderDashboardConversations();

    await waitFor(() => {
      expect(result.current.recentConversations).toEqual([
        expect.objectContaining({
          conversation_id: 'conv-resend',
          title: 'Rendered chat before resend',
        }),
      ]);
    });

    jest.useFakeTimers();
    try {
      await act(async () => {
        sdkConversationEventListener?.({
          type: 'user_message',
          conversationRef: 'conv-resend',
        });
      });

      expect(result.current.isLoadingRecentConversations).toBe(false);
      expect(result.current.recentConversations).toEqual([
        expect.objectContaining({
          conversation_id: 'conv-resend',
          title: 'Rendered chat before resend',
        }),
      ]);

      await act(async () => {
        jest.advanceTimersByTime(200);
        await Promise.resolve();
      });

      expect(DesktopConversationLibraryClient.listMetadata).toHaveBeenCalledTimes(2);
      expect(result.current.isLoadingRecentConversations).toBe(false);
      expect(result.current.recentConversations).toEqual([
        expect.objectContaining({
          conversation_id: 'conv-resend',
          title: 'Rendered chat before resend',
        }),
      ]);

      await act(async () => {
        resolveRefresh([
          {
            conversationRef: 'conv-resend',
            title: 'Rendered chat after resend',
            updatedAt: '2026-05-16T20:01:00.000Z',
            eventCount: 3,
          },
        ]);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.recentConversations).toEqual([
        expect.objectContaining({
          conversation_id: 'conv-resend',
          title: 'Rendered chat after resend',
        }),
      ]);
      expect(result.current.isLoadingRecentConversations).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('clears recent conversations and ignores stale loads when user id clears', async () => {
    let resolveStaleLoad;
    DesktopConversationLibraryClient.listMetadata
      .mockResolvedValueOnce([
        {
          conversationRef: 'conv-old',
          title: 'Old user chat',
          updatedAt: '2026-05-16T20:00:00.000Z',
          eventCount: 2,
        },
      ])
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveStaleLoad = resolve;
      }));

    const { result, rerender } = renderDashboardConversationsWithProps();

    await waitFor(() => {
      expect(result.current.recentConversations).toEqual([
        expect.objectContaining({
          conversation_id: 'conv-old',
          title: 'Old user chat',
        }),
      ]);
    });

    act(() => {
      result.current.handleTogglePinConversation({ conversation_id: 'conv-old' });
    });
    expect(result.current.pinnedConversationRefs).toEqual(['conv-old']);

    await act(async () => {
      void result.current.loadRecentConversations();
    });
    expect(DesktopConversationLibraryClient.listMetadata).toHaveBeenCalledTimes(2);

    rerender({ resolvedUserId: '' });

    await waitFor(() => {
      expect(result.current.recentConversations).toEqual([]);
    });
    expect(result.current.pinnedConversationRefs).toEqual([]);
    expect(result.current.isLoadingRecentConversations).toBe(false);
    expect(result.current.recentConversationsError).toBe('');

    await act(async () => {
      resolveStaleLoad([
        {
          conversationRef: 'conv-stale',
          title: 'Stale old user chat',
          updatedAt: '2026-05-16T20:01:00.000Z',
          eventCount: 1,
        },
      ]);
    });

    expect(result.current.recentConversations).toEqual([]);
    expect(result.current.pinnedConversationRefs).toEqual([]);
  });

  test('opens a conversation by selecting and clearing it before display rows resolve', async () => {
    const callOrder = [];
    let resolveRows;
    DesktopConversationLibraryClient.loadConversationView.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRows = resolve;
    }));
    const clearChatMessages = jest.fn((conversationRef) => {
      callOrder.push(`clear:${conversationRef}`);
    });
    const setChatMessages = jest.fn();
    const setChatIsSending = jest.fn();
    const setChatThinkingStatus = jest.fn();
    const setChatTokenCounts = jest.fn();
    const setChatActiveConversationRef = jest.fn((conversationRef) => {
      callOrder.push(`select:${conversationRef}`);
    });
    const setChatConversationView = jest.fn((view, conversationRef) => {
      callOrder.push(`view:${conversationRef}:${view.displayRows.length}`);
    });

    const { result } = renderDashboardConversations({
      clearChatMessages,
      setChatMessages,
      setChatIsSending,
      setChatThinkingStatus,
      setChatTokenCounts,
      setChatActiveConversationRef,
      setChatConversationView,
    });

    await act(async () => {
      void result.current.handleOpenConversation({
        conversation_id: 'conv-open',
        workspace_path: '/work/project-alpha',
        workspace_name: 'Project Alpha',
      });
      await Promise.resolve();
    });

    expect(result.current.openingConversationRef).toBe('conv-open');
    expect(callOrder).toEqual([
      'select:conv-open',
      'clear:conv-open',
    ]);
    expect(setChatIsSending).toHaveBeenCalledWith(false, 'conv-open');
    expect(setChatThinkingStatus).toHaveBeenCalledWith(null, 'conv-open');
    expect(setChatTokenCounts).toHaveBeenCalledWith(null, 'conv-open');

    await act(async () => {
      resolveRows({
        conversationRef: 'conv-open',
        displayRows: [
          {
            id: 'row-1',
            conversationRef: 'conv-open',
            role: 'user',
            type: 'user_message',
            content: 'yo',
            metadata: { timestamp: '2026-06-08T00:00:00.000Z' },
          },
        ],
      });
    });

    await waitFor(() => {
      expect(setChatConversationView).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationRef: 'conv-open',
          displayRows: expect.arrayContaining([
            expect.objectContaining({ id: 'row-1' }),
          ]),
        }),
        'conv-open',
      );
    });
    expect(setChatMessages).not.toHaveBeenCalled();
    expect(result.current.openingConversationRef).toBeNull();
  });

  test('stores the conversation view without projecting dashboard resume messages', async () => {
    DesktopConversationLibraryClient.loadConversationView.mockResolvedValueOnce({
      conversationRef: 'conv-open',
      displayRows: [
        {
          id: 'turn-1-sdk-evt-000002-user_message',
          conversationRef: 'conv-open',
          turnRef: 'turn-1',
          role: 'user',
          type: 'user_message',
          content: 'Please review the attached files.',
          metadata: { timestamp: '2026-06-08T00:00:00.000Z' },
        },
      ],
    });
    const setChatMessages = jest.fn();
    const setChatConversationView = jest.fn();
    const clearChatMessages = jest.fn();
    const getChatWorkspaceState = jest.fn(() => ({
      messages: [
        {
          id: 'turn-1-sdk-evt-000002-user_message',
          sender: 'user',
          text: 'Please review the attached files.',
          turnRef: 'turn-1',
          sourceEventType: 'user_message',
          sourceChannel: 'sdk:conversation-event',
          attachmentFilenames: ['clipboard-image.png'],
          attachments: [{
            id: 'turn-1:attachment:000',
            kind: 'image',
            source: 'user_included',
            status: 'materializing',
            previewSrc: 'data:image/png;base64,inline-optimistic-base64',
          }],
        },
      ],
    }));

    const { result } = renderDashboardConversations({
      clearChatMessages,
      getChatWorkspaceState,
      setChatMessages,
      setChatConversationView,
    });

    await act(async () => {
      await result.current.handleOpenConversation({
        conversation_id: 'conv-open',
        workspace_path: '/work/project-alpha',
        workspace_name: 'Project Alpha',
      });
    });

    expect(setChatConversationView).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationRef: 'conv-open',
        displayRows: [
          expect.objectContaining({
            id: 'turn-1-sdk-evt-000002-user_message',
          }),
        ],
      }),
      'conv-open',
    );
    expect(clearChatMessages).toHaveBeenCalledWith('conv-open');
    expect(setChatMessages).not.toHaveBeenCalled();
  });

  test('treats selecting the active conversation as an idempotent no-op', async () => {
    const clearChatMessages = jest.fn();
    const setChatMessages = jest.fn();
    const setChatIsSending = jest.fn();
    const setChatThinkingStatus = jest.fn();
    const setChatTokenCounts = jest.fn();
    const setChatActiveConversationRef = jest.fn();
    const getChatWorkspaceState = jest.fn(() => ({
      messages: [{ id: 'cached-row', sender: 'user', text: 'still visible' }],
    }));

    const { result } = renderDashboardConversations({
      sessionConversationRef: 'conv-active',
      activeConversationRef: 'conv-active',
      getChatWorkspaceState,
      clearChatMessages,
      setChatMessages,
      setChatIsSending,
      setChatThinkingStatus,
      setChatTokenCounts,
      setChatActiveConversationRef,
    });

    await act(async () => {
      await result.current.handleOpenConversation({
        conversation_id: 'conv-active',
        workspace_path: '/work/project-alpha',
        workspace_name: 'Project Alpha',
      });
    });

    expect(getChatWorkspaceState).not.toHaveBeenCalled();
    expect(DesktopConversationLibraryClient.loadConversationView).not.toHaveBeenCalled();
    expect(setChatActiveConversationRef).not.toHaveBeenCalled();
    expect(clearChatMessages).not.toHaveBeenCalled();
    expect(setChatMessages).not.toHaveBeenCalled();
    expect(setChatIsSending).not.toHaveBeenCalled();
    expect(setChatThinkingStatus).not.toHaveBeenCalled();
    expect(setChatTokenCounts).not.toHaveBeenCalled();
  });

  test('preserves cached conversation view while refreshing a different selected conversation', async () => {
    const callOrder = [];
    let resolveRows;
    DesktopConversationLibraryClient.loadConversationView.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRows = resolve;
    }));
    const clearChatMessages = jest.fn((conversationRef) => {
      callOrder.push(`clear:${conversationRef}`);
    });
    const setChatMessages = jest.fn();
    const setChatConversationView = jest.fn((view, conversationRef) => {
      callOrder.push(`view:${conversationRef}:${view.displayRows.length}`);
    });
    const setChatIsSending = jest.fn();
    const setChatThinkingStatus = jest.fn();
    const setChatTokenCounts = jest.fn();
    const setChatActiveConversationRef = jest.fn((conversationRef) => {
      callOrder.push(`select:${conversationRef}`);
    });
    const getChatWorkspaceState = jest.fn(() => ({
      messages: [],
      conversationView: {
        conversationRef: 'conv-cached',
        displayRows: [{
          id: 'cached-row',
          conversationRef: 'conv-cached',
          role: 'user',
          type: 'user_message',
          content: 'cached',
        }],
      },
    }));

    const { result } = renderDashboardConversations({
      sessionConversationRef: 'conv-current',
      getChatWorkspaceState,
      clearChatMessages,
      setChatMessages,
      setChatIsSending,
      setChatThinkingStatus,
      setChatTokenCounts,
      setChatActiveConversationRef,
      setChatConversationView,
    });

    await act(async () => {
      void result.current.handleOpenConversation({
        conversation_id: 'conv-cached',
        workspace_path: '/work/project-alpha',
        workspace_name: 'Project Alpha',
      });
      await Promise.resolve();
    });

    expect(callOrder).toEqual(['select:conv-cached']);
    expect(clearChatMessages).not.toHaveBeenCalled();
    expect(setChatIsSending).not.toHaveBeenCalled();
    expect(setChatThinkingStatus).not.toHaveBeenCalled();
    expect(setChatTokenCounts).not.toHaveBeenCalled();

    await act(async () => {
      resolveRows({
        conversationRef: 'conv-cached',
        displayRows: [
          {
            id: 'row-refreshed',
            conversationRef: 'conv-cached',
            role: 'assistant',
            type: 'assistant_message',
            content: 'refreshed',
            metadata: { timestamp: '2026-06-08T00:00:01.000Z' },
          },
        ],
      });
    });

    await waitFor(() => {
      expect(setChatConversationView).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationRef: 'conv-cached',
          displayRows: expect.arrayContaining([
            expect.objectContaining({ id: 'row-refreshed' }),
          ]),
        }),
        'conv-cached',
      );
    });
    expect(setChatMessages).not.toHaveBeenCalled();
  });
});
