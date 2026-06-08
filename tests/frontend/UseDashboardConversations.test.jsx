import { act, renderHook, waitFor } from '@testing-library/react';
import { useDashboardConversations } from '../../frontend/src/renderer/features/dashboard/hooks/useDashboardConversations';
import { DesktopConversationLibraryClient } from '../../frontend/src/renderer/app/runtime/desktopConversationLibraryClient';
import {
  getLocalBackendStatusSnapshot,
  subscribeLocalBackendStatusStore,
} from '../../frontend/src/renderer/infrastructure/runtime/localBackendStatusStore';
import { IpcBridge, ON_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

jest.mock('../../frontend/src/renderer/app/runtime/desktopConversationLibraryClient', () => ({
  DesktopConversationLibraryClient: {
    listMetadata: jest.fn(),
    subscribeMetadataInvalidations: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    startNewSession: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/runtime/localBackendStatusStore', () => ({
  getLocalBackendStatusSnapshot: jest.fn(),
  subscribeLocalBackendStatusStore: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: jest.fn(),
  },
  ON_CHANNELS: {
    WINDIE_CONVERSATION_EVENT: 'windie:conversation-event',
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/workspace/workspaceAccess', () => ({
  setActiveWorkspaceSelection: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/workspace/conversationWorkspaceBinding', () => ({
  clearConversationWorkspaceBinding: jest.fn(),
  setConversationWorkspaceBinding: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/features/chat/session/conversationSessionRuntime', () => ({
  applyRendererConversationSelection: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/features/chat/utils/session/resetActiveChatSession', () => ({
  resetActiveChatSession: jest.fn(),
}));

function renderDashboardConversations(options = {}) {
  return renderHook(() => useDashboardConversations({
    resolvedUserId: 'user-test',
    sessionConversationRef: '',
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
    getLocalBackendStatusSnapshot.mockReturnValue({ ready: false });
    subscribeLocalBackendStatusStore.mockImplementation(() => jest.fn());
    DesktopConversationLibraryClient.subscribeMetadataInvalidations.mockImplementation(() => jest.fn());
    IpcBridge.on.mockImplementation(() => jest.fn());
  });

  test('reloads recent conversations when the local backend becomes ready', async () => {
    let statusSubscriber = null;
    subscribeLocalBackendStatusStore.mockImplementation((subscriber) => {
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

    getLocalBackendStatusSnapshot.mockReturnValue({ ready: true });
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
    IpcBridge.on.mockImplementation((channel, listener) => {
      if (channel === ON_CHANNELS.WINDIE_CONVERSATION_EVENT) {
        sdkConversationEventListener = listener;
      }
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
});
