/**
 * Covers use dashboard conversations. behavior in the frontend test suite.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useDashboardConversations } from '../../frontend/src/renderer/features/dashboard/hooks/useDashboardConversations';
import { DesktopConversationLibraryClient } from '../../frontend/src/renderer/app/runtime/desktopConversationLibraryClient';
import { DesktopLocalRuntimeStatusRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopLocalRuntimeStatusRuntimeClient';
import { DesktopConversationRuntimeEventClient } from '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient';

jest.mock('../../frontend/src/renderer/app/runtime/desktopConversationLibraryClient', () => ({
  DesktopConversationLibraryClient: {
    loadDisplayRows: jest.fn(),
    listMetadata: jest.fn(),
    subscribeMetadataInvalidations: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    updateTranscriptSession: jest.fn(),
    startNewSession: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopLocalRuntimeStatusRuntimeClient', () => ({
  DesktopLocalRuntimeStatusRuntimeClient: {
    onReady: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient', () => ({
  DesktopConversationRuntimeEventClient: {
    onConversationEvent: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopWorkspaceRuntimeClient', () => ({
  DesktopWorkspaceRuntimeClient: {
    setActiveWorkspaceSelection: jest.fn(),
    clearConversationWorkspaceBinding: jest.fn(),
    resolveConversationWorkspaceBinding: jest.fn(({ conversation }) => ({
      workspacePath: conversation?.workspace_path || '',
      workspaceName: conversation?.workspace_name || '',
    })),
    setConversationWorkspaceBinding: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopConversationSessionRuntime', () => ({
  applyRendererConversationSelection: jest.fn(({ conversationRef, setChatConversationRef }) => {
    setChatConversationRef?.(conversationRef);
  }),
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopActiveChatSessionRuntime', () => ({
  resetActiveChatSession: jest.fn(),
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
    DesktopConversationLibraryClient.loadDisplayRows.mockResolvedValue([]);
    DesktopConversationLibraryClient.subscribeMetadataInvalidations.mockImplementation(() => jest.fn());
    DesktopConversationRuntimeEventClient.onConversationEvent.mockImplementation(() => jest.fn());
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
    DesktopConversationLibraryClient.loadDisplayRows.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRows = resolve;
    }));
    const clearChatMessages = jest.fn((conversationRef) => {
      callOrder.push(`clear:${conversationRef}`);
    });
    const setChatMessages = jest.fn((messages, conversationRef) => {
      callOrder.push(`messages:${conversationRef}:${messages.length}`);
    });
    const setChatIsSending = jest.fn();
    const setChatThinkingStatus = jest.fn();
    const setChatTokenCounts = jest.fn();
    const setChatActiveConversationRef = jest.fn((conversationRef) => {
      callOrder.push(`select:${conversationRef}`);
    });

    const { result } = renderDashboardConversations({
      clearChatMessages,
      setChatMessages,
      setChatIsSending,
      setChatThinkingStatus,
      setChatTokenCounts,
      setChatActiveConversationRef,
    });

    await act(async () => {
      void result.current.handleOpenConversation({
        conversation_id: 'conv-open',
        workspace_path: '/work/WindieOS',
        workspace_name: 'WindieOS',
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
      resolveRows([
        {
          id: 'row-1',
          conversationRef: 'conv-open',
          role: 'user',
          type: 'user_message',
          content: 'yo',
          metadata: { timestamp: '2026-06-08T00:00:00.000Z' },
        },
      ]);
    });

    await waitFor(() => {
      expect(setChatMessages).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'row-1',
          sender: 'user',
          text: 'yo',
        }),
      ], 'conv-open');
    });
    expect(result.current.openingConversationRef).toBeNull();
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
        workspace_path: '/work/WindieOS',
        workspace_name: 'WindieOS',
      });
    });

    expect(getChatWorkspaceState).not.toHaveBeenCalled();
    expect(DesktopConversationLibraryClient.loadDisplayRows).not.toHaveBeenCalled();
    expect(setChatActiveConversationRef).not.toHaveBeenCalled();
    expect(clearChatMessages).not.toHaveBeenCalled();
    expect(setChatMessages).not.toHaveBeenCalled();
    expect(setChatIsSending).not.toHaveBeenCalled();
    expect(setChatThinkingStatus).not.toHaveBeenCalled();
    expect(setChatTokenCounts).not.toHaveBeenCalled();
  });

  test('preserves cached conversation rows while refreshing a different selected conversation', async () => {
    const callOrder = [];
    let resolveRows;
    DesktopConversationLibraryClient.loadDisplayRows.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRows = resolve;
    }));
    const clearChatMessages = jest.fn((conversationRef) => {
      callOrder.push(`clear:${conversationRef}`);
    });
    const setChatMessages = jest.fn((messages, conversationRef) => {
      callOrder.push(`messages:${conversationRef}:${messages.length}`);
    });
    const setChatIsSending = jest.fn();
    const setChatThinkingStatus = jest.fn();
    const setChatTokenCounts = jest.fn();
    const setChatActiveConversationRef = jest.fn((conversationRef) => {
      callOrder.push(`select:${conversationRef}`);
    });
    const getChatWorkspaceState = jest.fn(() => ({
      messages: [{ id: 'cached-row', sender: 'user', text: 'cached' }],
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
    });

    await act(async () => {
      void result.current.handleOpenConversation({
        conversation_id: 'conv-cached',
        workspace_path: '/work/WindieOS',
        workspace_name: 'WindieOS',
      });
      await Promise.resolve();
    });

    expect(callOrder).toEqual(['select:conv-cached']);
    expect(clearChatMessages).not.toHaveBeenCalled();
    expect(setChatIsSending).not.toHaveBeenCalled();
    expect(setChatThinkingStatus).not.toHaveBeenCalled();
    expect(setChatTokenCounts).not.toHaveBeenCalled();

    await act(async () => {
      resolveRows([
        {
          id: 'row-refreshed',
          conversationRef: 'conv-cached',
          role: 'assistant',
          type: 'assistant_message',
          content: 'refreshed',
          metadata: { timestamp: '2026-06-08T00:00:01.000Z' },
        },
      ]);
    });

    await waitFor(() => {
      expect(setChatMessages).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'row-refreshed',
          sender: 'assistant',
          text: 'refreshed',
        }),
      ], 'conv-cached');
    });
  });
});
