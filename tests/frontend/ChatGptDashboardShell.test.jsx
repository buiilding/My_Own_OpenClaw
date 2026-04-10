import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import DashboardShell from '../../frontend/src/renderer/features/dashboard/components/DashboardShell';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { invalidateConversationInferenceSessionState } from '../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime';
import { clearConversationReplayStateCache } from '../../frontend/src/renderer/infrastructure/transcript/conversationReplayState';
import {
  clearAllConversationWorkspaceBindings,
  clearConversationWorkspaceBinding,
} from '../../frontend/src/renderer/infrastructure/workspace/conversationWorkspaceBinding';

const mockListeners = new Map();
const LOCAL_SNAPSHOT_USER_ID = 'local-user';
let mockClientSnapshot = { isConnected: true, userId: LOCAL_SNAPSHOT_USER_ID };
const mockInvoke = jest.fn(async (channel) => {
  if (channel === 'get-client-user-id') {
    return mockClientSnapshot;
  }
  if (channel === 'list-conversations') {
    return {
      success: true,
      data: { conversations: [] },
    };
  }
  if (channel === 'get-conversation') {
    return {
      success: true,
      data: { memories: [] },
    };
  }
  if (channel === 'search-conversations') {
    return {
      success: true,
      data: { conversations: [] },
    };
  }
  return { success: true, data: {} };
});
const mockUpdateTranscriptSession = jest.fn();
let mockSessionInfo = { conversationRef: null, userId: null };

jest.mock('../../frontend/src/renderer/features/chat/components/ChatInterface', () => () => (
  <div data-testid="chat-interface-stub">ChatInterfaceStub</div>
));

jest.mock('../../frontend/src/renderer/features/dashboard/components/sections/SettingsSection', () => (props) => (
  <div data-testid="settings-section-stub">
    <button type="button" onClick={() => props.onChatsCleared?.()}>
      Trigger chats cleared
    </button>
    SettingsSectionStub
  </div>
));

jest.mock('../../frontend/src/renderer/features/dashboard/components/sections/ModelsSection', () => () => (
  <div data-testid="models-section-stub">ModelsSectionStub</div>
));

jest.mock('../../frontend/src/renderer/features/dashboard/components/sections/MemorySection', () => () => (
  <div data-testid="memory-section-stub">MemorySectionStub</div>
));

jest.mock('../../frontend/src/renderer/features/dashboard/components/sections/UsageSection', () => () => (
  <div data-testid="usage-section-stub">UsageSectionStub</div>
));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  getTranscriptSessionInfo: () => mockSessionInfo,
  updateTranscriptSession: (...args) => mockUpdateTranscriptSession(...args),
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
    on: (channel, listener) => {
      mockListeners.set(channel, listener);
      return () => {
        mockListeners.delete(channel);
      };
    },
  },
  INVOKE_CHANNELS: {
    LIST_CONVERSATIONS: 'list-conversations',
    GET_CONVERSATION: 'get-conversation',
    SEARCH_CONVERSATIONS: 'search-conversations',
    DELETE_CONVERSATION: 'delete-conversation',
    SET_ACTIVE_WORKSPACE: 'set-active-workspace',
    GET_CLIENT_USER_ID: 'get-client-user-id',
  },
  ON_CHANNELS: {
    MAIN_WINDOW_OPEN_TARGET: 'main-window-open-target',
    IPC_STATUS: 'ipc-status',
  },
}));

jest.mock('../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime', () => {
  const actual = jest.requireActual('../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime');
  return {
    ...actual,
    clearConversationInferenceSessionState: jest.fn(),
    invalidateConversationInferenceSessionState: jest.fn(),
  };
});

jest.mock('../../frontend/src/renderer/infrastructure/transcript/conversationReplayState', () => {
  const actual = jest.requireActual('../../frontend/src/renderer/infrastructure/transcript/conversationReplayState');
  return {
    ...actual,
    clearConversationReplayStateCache: jest.fn(),
  };
});

jest.mock('../../frontend/src/renderer/infrastructure/workspace/conversationWorkspaceBinding', () => {
  const actual = jest.requireActual('../../frontend/src/renderer/infrastructure/workspace/conversationWorkspaceBinding');
  return {
    ...actual,
    clearAllConversationWorkspaceBindings: jest.fn(),
    clearConversationWorkspaceBinding: jest.fn(),
  };
});

const mockInvalidateConversationInferenceSessionState = invalidateConversationInferenceSessionState;
const mockClearConversationReplayStateCache = clearConversationReplayStateCache;
const mockClearAllConversationWorkspaceBindings = clearAllConversationWorkspaceBindings;
const mockClearConversationWorkspaceBinding = clearConversationWorkspaceBinding;

describe('ChatGptDashboardShell', () => {
  const flushMicrotasks = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  const withClientSnapshot = (implementation) => async (...args) => {
    const [channel] = args;
    if (channel === 'get-client-user-id') {
      return mockClientSnapshot;
    }
    return implementation(...args);
  };

  const renderDashboardShell = async () => {
    const view = render(
      <DashboardShell
        config={{}}
        availableModels={{ local: [], online: [] }}
        onConfigChange={jest.fn()}
      />,
    );

    await flushMicrotasks();
    await flushMicrotasks();
    expect(mockInvoke).toHaveBeenCalled();
    return view;
  };

  beforeEach(() => {
    mockListeners.clear();
    mockInvoke.mockClear();
    mockUpdateTranscriptSession.mockClear();
    mockInvalidateConversationInferenceSessionState.mockClear();
    mockClearConversationReplayStateCache.mockClear();
    mockClearAllConversationWorkspaceBindings.mockClear();
    mockClearConversationWorkspaceBinding.mockClear();
    mockClientSnapshot = { isConnected: true, userId: LOCAL_SNAPSHOT_USER_ID };
    mockSessionInfo = { conversationRef: null, userId: null };
    useChatStore.setState({
      isSending: false,
      streamTracking: {
        activeTurnRef: null,
        phase: 'idle',
        startedAt: null,
        firstChunkAt: null,
        completedAt: null,
        lastEventAt: null,
        lastEventType: null,
        eventCount: 0,
        chunkCount: 0,
        toolCallCount: 0,
        toolOutputCount: 0,
        lastChunkSize: 0,
        lastError: null,
      },
    });
  });

  test('renders chat interface as primary main content', async () => {
    await renderDashboardShell();

    expect(screen.getByTestId('chat-interface-stub')).toBeInTheDocument();
  });

  test('keeps sidebar conversation selection from projected chat state when transcript session ref is empty', async () => {
    mockSessionInfo = { conversationRef: null, userId: LOCAL_SNAPSHOT_USER_ID };
    useChatStore.setState({ activeConversationRef: 'conv-store-active' });
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'list-conversations') {
        return {
          success: true,
          data: {
            conversations: [{
              conversation_id: 'conv-store-active',
              title: 'Store active chat',
              updated_at: '2026-04-10T00:00:00.000Z',
              created_at: '2026-04-10T00:00:00.000Z',
              record_kind: 'transcript',
            }],
          },
        };
      }
      if (channel === 'get-conversation') {
        return {
          success: true,
          data: { memories: [] },
        };
      }
      if (channel === 'search-conversations') {
        return {
          success: true,
          data: { conversations: [] },
        };
      }
      return { success: true, data: {} };
    }));

    await renderDashboardShell();

    const activeChatButton = screen.getByText('Store active chat').closest('button');
    expect(activeChatButton.className).toContain('active');
  });

  test('locks document scroll while dashboard shell is mounted', async () => {
    const { unmount } = await renderDashboardShell();

    expect(document.documentElement).toHaveClass('cg-scroll-locked');
    expect(document.body).toHaveClass('cg-scroll-locked');
    const rootElement = document.getElementById('root');
    if (rootElement) {
      expect(rootElement).toHaveClass('cg-scroll-locked');
    }

    unmount();

    expect(document.documentElement).not.toHaveClass('cg-scroll-locked');
    expect(document.body).not.toHaveClass('cg-scroll-locked');
    if (rootElement) {
      expect(rootElement).not.toHaveClass('cg-scroll-locked');
    }
  });

  test('opens settings modal when main process emits settings target', async () => {
    await renderDashboardShell();

    act(() => {
      const listener = mockListeners.get('main-window-open-target');
      listener?.({ target: 'settings' });
    });

    expect(screen.getByTestId('settings-section-stub')).toBeInTheDocument();
  });

  test('collapses and expands sidebar through dedicated controls', async () => {
    const { container } = await renderDashboardShell();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(container.querySelector('.cg-sidebar')).toHaveClass('collapsed');
    expect(container.querySelector('.cg-main-content')).toHaveClass('cg-main-content-collapsed');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(container.querySelector('.cg-sidebar')).not.toHaveClass('collapsed');
    expect(container.querySelector('.cg-main-content')).not.toHaveClass('cg-main-content-collapsed');
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
  });

  test('sidebar models button opens models modal', async () => {
    await renderDashboardShell();

    fireEvent.click(screen.getByRole('button', { name: 'Models' }));

    expect(screen.getByTestId('models-section-stub')).toBeInTheDocument();
  });

  test('sidebar usage button opens usage modal', async () => {
    await renderDashboardShell();

    fireEvent.click(screen.getByRole('button', { name: 'Usage' }));

    expect(screen.getByTestId('usage-section-stub')).toBeInTheDocument();
  });

  test('profile click opens menu first, then settings from menu item', async () => {
    await renderDashboardShell();

    fireEvent.click(screen.getByTestId('sidebar-user-menu-trigger'));

    expect(screen.queryByTestId('settings-section-stub')).not.toBeInTheDocument();
    expect(screen.queryByText('Personalization')).not.toBeInTheDocument();
    expect(screen.getByTestId('sidebar-user-menu-settings')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sidebar-user-menu-settings'));

    expect(screen.getByTestId('settings-section-stub')).toBeInTheDocument();
  });

  test('chat target closes an open modal', async () => {
    await renderDashboardShell();

    fireEvent.click(screen.getByRole('button', { name: 'Models' }));
    expect(screen.getByTestId('models-section-stub')).toBeInTheDocument();

    act(() => {
      const listener = mockListeners.get('main-window-open-target');
      listener?.({ target: 'chat' });
    });

    expect(screen.queryByTestId('models-section-stub')).not.toBeInTheDocument();
  });

  test('vm mode hides sidebar and disables dashboard panel targets', async () => {
    const view = render(
      <DashboardShell
        config={{}}
        availableModels={{ local: [], online: [] }}
        onConfigChange={jest.fn()}
        vmModeEnabled
      />,
    );

    await flushMicrotasks();
    expect(screen.getByTestId('chat-interface-stub')).toBeInTheDocument();
    expect(view.container.querySelector('.cg-sidebar')).toBeNull();

    act(() => {
      const listener = mockListeners.get('main-window-open-target');
      listener?.({ target: 'settings' });
    });

    expect(screen.queryByTestId('settings-section-stub')).not.toBeInTheDocument();
  });

  test('opens recent conversation from sidebar history list', async () => {
    const nowIso = new Date().toISOString();
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'list-conversations') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-history-1',
                record_kind: 'transcript',
                last_timestamp: nowIso,
                title: 'Fix Ubuntu mic settings',
              },
            ],
          },
        };
      }
      if (channel === 'get-conversation') {
        return { success: true, data: { memories: [] } };
      }
      return { success: true, data: {} };
    }));

    await renderDashboardShell();

    fireEvent.click(await screen.findByRole('button', { name: 'Fix Ubuntu mic settings' }));
    await flushMicrotasks();
    const getConversationCall = mockInvoke.mock.calls.find(
      ([channel]) => channel === 'get-conversation',
    );
    expect(getConversationCall).toBeDefined();
    expect(getConversationCall?.[1]).toEqual(
      expect.objectContaining({
        conversationId: 'conv-history-1',
      }),
    );

    if (!mockUpdateTranscriptSession.mock.calls.some(([conversationRef, userId]) => (
      conversationRef === 'conv-history-1' && userId === LOCAL_SNAPSHOT_USER_ID
    ))) {
      throw new Error('expected transcript session to switch to conv-history-1');
    }
    expect(useChatStore.getState().activeConversationRef).toBe('conv-history-1');
  });

  test('loads recent local chats while transport is disconnected', async () => {
    const nowIso = new Date().toISOString();
    mockClientSnapshot = { isConnected: false, userId: LOCAL_SNAPSHOT_USER_ID };
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'get-client-user-id') {
        return mockClientSnapshot;
      }
      if (channel === 'list-conversations') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-offline-1',
                record_kind: 'transcript',
                last_timestamp: nowIso,
                title: 'Offline local chat',
              },
            ],
          },
        };
      }
      return { success: true, data: {} };
    }));

    await renderDashboardShell();

    expect(screen.getByRole('button', { name: 'Offline local chat' })).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith(
      'list-conversations',
      expect.objectContaining({ userId: LOCAL_SNAPSHOT_USER_ID }),
    );
  });

  test('allows switching history while another loop is active', async () => {
    const nowIso = new Date().toISOString();
    useChatStore.setState((state) => ({
      ...state,
      isSending: false,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-active',
        phase: 'tool-output',
      },
    }));
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'list-conversations') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-history-1',
                record_kind: 'transcript',
                last_timestamp: nowIso,
                title: 'Do not switch while looping',
              },
            ],
          },
        };
      }
      if (channel === 'get-conversation') {
        return { success: true, data: { memories: [] } };
      }
      return { success: true, data: {} };
    }));

    await renderDashboardShell();

    fireEvent.click(await screen.findByRole('button', { name: 'Do not switch while looping' }));
    await flushMicrotasks();

    const getConversationCall = mockInvoke.mock.calls.find(
      ([channel]) => channel === 'get-conversation',
    );
    expect(getConversationCall).toBeDefined();
    expect(getConversationCall?.[1]).toEqual(
      expect.objectContaining({
        conversationId: 'conv-history-1',
      }),
    );
    if (!mockUpdateTranscriptSession.mock.calls.some(([conversationRef, userId]) => (
      conversationRef === 'conv-history-1' && userId === LOCAL_SNAPSHOT_USER_ID
    ))) {
      throw new Error('expected transcript session to switch during active loop');
    }
    expect(useChatStore.getState().activeConversationRef).toBe('conv-history-1');
  });

  test('highlights active conversation row in sidebar history', async () => {
    const nowIso = new Date().toISOString();
    mockSessionInfo = { conversationRef: 'conv-history-1', userId: 'default_user' };
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'list-conversations') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-history-1',
                record_kind: 'transcript',
                last_timestamp: nowIso,
                title: 'Build memory migration plan',
              },
            ],
          },
        };
      }
      if (channel === 'get-conversation') {
        return { success: true, data: { memories: [] } };
      }
      return { success: true, data: {} };
    }));

    await renderDashboardShell();

    const activeConversationButton = await screen.findByRole('button', { name: 'Build memory migration plan' });
    expect(activeConversationButton).toHaveClass('active');
  });

  test('conversation kebab menu shows only rename, pin, and delete actions', async () => {
    const nowIso = new Date().toISOString();
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'list-conversations') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-history-1',
                record_kind: 'transcript',
                last_timestamp: nowIso,
                title: 'OpenRouter free models list',
              },
            ],
          },
        };
      }
      return { success: true, data: {} };
    }));

    await renderDashboardShell();

    fireEvent.click(await screen.findByRole('button', { name: /Conversation actions for OpenRouter free models list/i }));

    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Pin chat' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Share/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Archive/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Start a group chat/i })).not.toBeInTheDocument();
  });

  test('delete action from conversation kebab menu calls delete-conversation', async () => {
    const nowIso = new Date().toISOString();
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'list-conversations') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-delete-1',
                record_kind: 'transcript',
                last_timestamp: nowIso,
                title: 'Mission Today',
              },
            ],
          },
        };
      }
      if (channel === 'delete-conversation') {
        return { success: true, data: {} };
      }
      return { success: true, data: {} };
    }));

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      await renderDashboardShell();

      fireEvent.click(await screen.findByRole('button', { name: /Conversation actions for Mission Today/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
      await flushMicrotasks();
      if (!mockInvoke.mock.calls.some(([channel, payload]) => (
        channel === 'delete-conversation'
        && payload?.conversationId === 'conv-delete-1'
        && payload?.recordKind === 'transcript'
      ))) {
        throw new Error('expected transcript rows to be deleted for conv-delete-1');
      }
      if (!mockInvoke.mock.calls.some(([channel, payload]) => (
        channel === 'delete-conversation'
        && payload?.conversationId === 'conv-delete-1'
        && payload?.recordKind === 'transcript_replay'
      ))) {
        throw new Error('expected replay rows to be deleted for conv-delete-1');
      }
      if (!mockClearConversationWorkspaceBinding.mock.calls.some(([conversationRef]) => (
        conversationRef === 'conv-delete-1'
      ))) {
        throw new Error('expected workspace binding to be cleared for conv-delete-1');
      }
    } finally {
      confirmSpy.mockRestore();
    }
  });

  test('reloads recent chats when transcript session user id becomes available', async () => {
    mockSessionInfo = { conversationRef: null, userId: null };

    await renderDashboardShell();
    await flushMicrotasks();
    expect(mockInvoke).toHaveBeenCalledWith(
      'list-conversations',
      expect.objectContaining({ userId: LOCAL_SNAPSHOT_USER_ID }),
    );

    mockInvoke.mockClear();
    mockSessionInfo = { conversationRef: null, userId: 'peter-bui' };

    act(() => {
      window.dispatchEvent(new CustomEvent('transcript-session-update'));
    });
    await flushMicrotasks();
    expect(mockInvoke).toHaveBeenCalledWith(
      'list-conversations',
      expect.objectContaining({ userId: 'peter-bui' }),
    );
  });

  test('ignores stale recent-chat response after transcript user switch', async () => {
    const nowIso = new Date().toISOString();
    let resolveDefaultUserList;
    mockSessionInfo = { conversationRef: null, userId: null };
    mockInvoke.mockImplementation(withClientSnapshot(async (channel, payload) => {
      if (channel === 'get-client-user-id') {
        return mockClientSnapshot;
      }
      if (channel !== 'list-conversations') {
        return { success: true, data: {} };
      }
      if (payload?.userId === LOCAL_SNAPSHOT_USER_ID) {
        return new Promise((resolve) => {
          resolveDefaultUserList = resolve;
        });
      }
      if (payload?.userId === 'peter-bui') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-user-peter',
                record_kind: 'transcript',
                last_timestamp: nowIso,
                title: 'Peter active chat',
              },
            ],
          },
        };
      }
      return { success: true, data: { conversations: [] } };
    }));

    await renderDashboardShell();
    expect(mockInvoke).toHaveBeenCalledWith(
      'list-conversations',
      expect.objectContaining({ userId: LOCAL_SNAPSHOT_USER_ID }),
    );

    mockSessionInfo = { conversationRef: null, userId: 'peter-bui' };
    act(() => {
      window.dispatchEvent(new CustomEvent('transcript-session-update'));
    });
    await flushMicrotasks();

    expect(mockInvoke).toHaveBeenCalledWith(
      'list-conversations',
      expect.objectContaining({ userId: 'peter-bui' }),
    );
    expect(screen.getByRole('button', { name: 'Peter active chat' })).toBeInTheDocument();

    await act(async () => {
      resolveDefaultUserList?.({
        success: true,
        data: {
          conversations: [
            {
              conversation_id: 'conv-user-default',
              record_kind: 'transcript',
              last_timestamp: nowIso,
              title: 'Default stale chat',
            },
          ],
        },
      });
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(screen.queryByRole('button', { name: 'Default stale chat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Peter active chat' })).toBeInTheDocument();
  });

  test('reloads recent chats after assistant llm transcript entry is stored', async () => {
    const nowIso = new Date().toISOString();
    let listCallCount = 0;
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'list-conversations') {
        listCallCount += 1;
        if (listCallCount === 1) {
          return {
            success: true,
            data: { conversations: [] },
          };
        }
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-title-1',
                record_kind: 'transcript',
                last_timestamp: nowIso,
                title: 'How are you',
              },
            ],
          },
        };
      }
      return { success: true, data: {} };
    }));

    await renderDashboardShell();
    expect(screen.getByText('No chats yet.')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('transcript-entry-stored', {
        detail: {
          role: 'assistant',
          messageType: 'llm-text',
        },
      }));
    });
    await flushMicrotasks();
    expect(mockInvoke).toHaveBeenCalledWith(
      'list-conversations',
      expect.objectContaining({ userId: LOCAL_SNAPSHOT_USER_ID }),
    );
    expect(screen.getByRole('button', { name: 'How are you' })).toBeInTheDocument();
  });

  test('shows a new chat after user transcript storage and replaces the temporary title after assistant completion', async () => {
    const nowIso = new Date().toISOString();
    let listCallCount = 0;
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'list-conversations') {
        listCallCount += 1;
        if (listCallCount === 1) {
          return {
            success: true,
            data: { conversations: [] },
          };
        }
        if (listCallCount === 2) {
          return {
            success: true,
            data: {
              conversations: [
                {
                  conversation_id: 'conv-title-2',
                  record_kind: 'transcript',
                  last_timestamp: nowIso,
                  title: 'How to fix ubuntu mic settings',
                  title_source: 'heuristic',
                },
              ],
            },
          };
        }
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-title-2',
                record_kind: 'transcript',
                last_timestamp: nowIso,
                title: 'Ubuntu mic timeout troubleshooting',
                title_source: 'model',
              },
            ],
          },
        };
      }
      return { success: true, data: {} };
    }));

    await renderDashboardShell();
    expect(screen.getByText('No chats yet.')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('transcript-entry-stored', {
        detail: {
          role: 'user',
          messageType: 'user',
          conversationRef: 'conv-title-2',
        },
      }));
    });
    await flushMicrotasks();
    expect(screen.getByRole('button', { name: 'How to fix ubuntu mic settings' })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('transcript-entry-stored', {
        detail: {
          role: 'assistant',
          messageType: 'llm-text',
          conversationRef: 'conv-title-2',
        },
      }));
    });
    await flushMicrotasks();
    expect(screen.getByRole('button', { name: 'Ubuntu mic timeout troubleshooting' })).toBeInTheDocument();
  });

  test('settings chat-clear callback resets active chat state and reloads recent chats', async () => {
    mockSessionInfo = { conversationRef: 'conv-live', userId: 'user-live' };

    await renderDashboardShell();
    mockInvoke.mockClear();

    fireEvent.click(screen.getByTestId('sidebar-user-menu-trigger'));
    fireEvent.click(screen.getByTestId('sidebar-user-menu-settings'));
    fireEvent.click(screen.getByRole('button', { name: 'Trigger chats cleared' }));
    await flushMicrotasks();

    expect(mockUpdateTranscriptSession.mock.calls.some(([conversationRef, userId]) => (
      conversationRef === null && userId === 'user-live'
    ))).toBe(true);
    expect(mockInvalidateConversationInferenceSessionState.mock.calls.length).toBe(1);
    expect(mockClearConversationReplayStateCache.mock.calls.length).toBe(1);
    expect(mockClearAllConversationWorkspaceBindings.mock.calls.length).toBe(1);
    expect(mockInvoke).toHaveBeenCalledWith(
      'list-conversations',
      expect.objectContaining({ userId: 'user-live' }),
    );
  });

  test('retries recent chats on startup when local backend is not ready', async () => {
    jest.useFakeTimers();
    const nowIso = new Date().toISOString();
    let listCallCount = 0;
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'list-conversations') {
        listCallCount += 1;
        if (listCallCount === 1) {
          return {
            success: false,
            error: 'Local backend not ready',
          };
        }
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-startup-1',
                record_kind: 'transcript',
                last_timestamp: nowIso,
                title: 'Startup restored chat',
              },
            ],
          },
        };
      }
      return { success: true, data: {} };
    }));

    try {
      await renderDashboardShell();

      act(() => {
        jest.advanceTimersByTime(300);
      });
      await flushMicrotasks();

      expect(listCallCount).toBeGreaterThanOrEqual(2);
      expect(screen.getByRole('button', { name: 'Startup restored chat' })).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('plays dashboard open animation on mount without retriggering it on window visibility restore', async () => {
    jest.useFakeTimers();

    try {
      const { container } = render(
        <DashboardShell
          config={{}}
          availableModels={{ local: [], online: [] }}
          onConfigChange={jest.fn()}
        />,
      );
      await flushMicrotasks();
      expect(mockInvoke).toHaveBeenCalled();

      const shell = container.querySelector('.cg-dashboard-shell');
      expect(shell).toBeTruthy();
      expect(shell.className).toContain('cg-dashboard-shell-opening');

      act(() => {
        jest.advanceTimersByTime(421);
      });
      expect(shell.className).not.toContain('cg-dashboard-shell-opening');

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(shell.className).not.toContain('cg-dashboard-shell-opening');
    } finally {
      jest.useRealTimers();
    }
  });

  test('replays dashboard wake animation when the main window is reopened to a target', async () => {
    jest.useFakeTimers();

    try {
      const { container } = await renderDashboardShell();
      const shell = container.querySelector('.cg-dashboard-shell');

      act(() => {
        jest.advanceTimersByTime(421);
      });
      expect(shell.className).not.toContain('cg-dashboard-shell-opening');

      act(() => {
        const listener = mockListeners.get('main-window-open-target');
        listener?.({ target: 'chat' });
      });
      expect(shell.className).toContain('cg-dashboard-shell-opening');

      act(() => {
        jest.advanceTimersByTime(421);
      });
      expect(shell.className).not.toContain('cg-dashboard-shell-opening');
    } finally {
      jest.useRealTimers();
    }
  });

  test('search chats opens modal, filters list, and opens selected conversation', async () => {
    jest.useFakeTimers();
    const nowIso = new Date().toISOString();
    try {
      mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
        if (channel === 'list-conversations') {
          return {
            success: true,
            data: {
              conversations: [
                {
                  conversation_id: 'conv-history-1',
                  record_kind: 'transcript',
                  last_timestamp: nowIso,
                  title: 'Moon Landing Technology Explained',
                },
                {
                  conversation_id: 'conv-history-2',
                  record_kind: 'transcript',
                  last_timestamp: nowIso,
                  title: 'Vietnamese-speaking lawyer leads',
                },
              ],
            },
          };
        }
        if (channel === 'search-conversations') {
          return {
            success: true,
            data: {
              conversations: [
                {
                  conversation_id: 'conv-history-2',
                  record_kind: 'transcript',
                  last_timestamp: nowIso,
                  title: 'Vietnamese-speaking lawyer leads',
                  snippet: 'You: Looking for Vietnamese-speaking lawyer lead in California.',
                  matched_role: 'user',
                },
              ],
            },
          };
        }
        if (channel === 'get-conversation') {
          return { success: true, data: { memories: [] } };
        }
        return { success: true, data: {} };
      }));

      await renderDashboardShell();

      fireEvent.click(screen.getByRole('button', { name: 'Search chats' }));

      const dialog = screen.getByRole('dialog', { name: 'Search chats' });
      const input = within(dialog).getByLabelText('Search chats input');
      expect(within(dialog).getByRole('button', { name: 'New chat' })).toBeInTheDocument();

      fireEvent.change(input, { target: { value: 'lawyer' } });
      act(() => {
        jest.advanceTimersByTime(200);
      });
      await flushMicrotasks();
      expect(mockInvoke).toHaveBeenCalledWith(
        'search-conversations',
        expect.objectContaining({
          query: 'lawyer',
          userId: LOCAL_SNAPSHOT_USER_ID,
        }),
      );
      expect(within(dialog).queryByText('Moon Landing Technology Explained')).not.toBeInTheDocument();
      expect(within(dialog).getByText('Vietnamese-speaking lawyer leads')).toBeInTheDocument();
      expect(within(dialog).getByText(/You: Looking for Vietnamese-speaking lawyer lead/i)).toBeInTheDocument();

      fireEvent.click(within(dialog).getByText('Vietnamese-speaking lawyer leads').closest('button'));
      await flushMicrotasks();
      expect(mockInvoke).toHaveBeenCalledWith(
        'get-conversation',
        expect.objectContaining({ conversationId: 'conv-history-2' }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
