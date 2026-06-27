/**
 * Covers DashboardShell behavior in the frontend test suite.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import DashboardShell from '../../src/renderer/features/dashboard/components/DashboardShell';
import { useChatStore } from '../../src/renderer/features/chat/stores/chatStore';
import { DesktopWorkspaceRuntimeClient } from '../../src/renderer/app/runtime/desktopWorkspaceRuntimeClient';

var mockListeners = new Map();
const LOCAL_SNAPSHOT_USER_ID = 'local-user';
let mockClientSnapshot = { isConnected: true, userId: LOCAL_SNAPSHOT_USER_ID };

function metadataFromConversationRow(row) {
  return {
    conversationRef: row.conversationRef || row.conversation_id,
    revisionId: row.revisionId || row.revision_id || `rev-stored-${row.conversationRef || row.conversation_id}`,
    title: row.title || row.conversationRef || row.conversation_id,
    lastMessage: row.lastMessage || row.last_message || '',
    updatedAt: row.updatedAt || row.updated_at || row.last_timestamp || row.created_at || '',
    eventCount: row.eventCount || row.entry_count || 0,
    workspacePath: row.workspacePath || row.workspace_path || '',
    workspaceName: row.workspaceName || row.workspace_name || '',
    snippet: row.snippet || null,
    matchedRole: row.matchedRole || row.matched_role || null,
  };
}

function sdkDataFromCommandResult(command, commandResult, commandPayload = {}) {
  const data = commandResult?.data ?? {};
  if (command === 'conversations.list' || command === 'conversations.search') {
    return (Array.isArray(data.conversations) ? data.conversations : []).map(metadataFromConversationRow);
  }
  if (command === 'conversation.loadDisplay') {
    return {
      state: { events: Array.isArray(data.events) ? data.events : [] },
      displayRows: [],
      display: {
        conversationRef: commandPayload.conversationRef,
        revisionId: '',
        messages: [],
        compaction: { status: 'idle' },
      },
      rehydrate: {
        conversationRef: commandPayload.conversationRef,
        revisionId: '',
        messages: [],
      },
    };
  }
  if (command === 'conversation.loadRehydrate') {
    return {
      rehydrate: {
        conversationRef: commandPayload.conversationRef,
        revisionId: '',
        messages: [],
      },
    };
  }
  return data;
}

function hasSdkCommandCall(command, payload = {}) {
  return mockInvoke.mock.calls.some(([, envelope]) => (
    envelope?.command === command
    && Object.entries(payload).every(([key, value]) => envelope.payload?.[key] === value)
  ));
}

async function handleSdkCommandFromMockInvoke(args, implementation) {
  const [, sdkEnvelope] = args;
  const command = sdkEnvelope?.command;
  if (typeof command !== 'string') {
    return null;
  }
  const payload = sdkEnvelope.payload || {};
  const commandResult = await implementation(command, payload);
  return {
    ok: commandResult?.ok ?? commandResult?.success !== false,
    data: sdkDataFromCommandResult(command, commandResult, payload),
    error: commandResult?.error,
  };
}

const mockInvoke = jest.fn(async (...args) => {
  const [channel] = args;
  if (channel === 'get-client-user-id') {
    return mockClientSnapshot;
  }
  const sdkResult = await handleSdkCommandFromMockInvoke(args, async (command) => {
    if (command === 'conversations.list' || command === 'conversations.search') {
      return { success: true, data: { conversations: [] } };
    }
    if (command === 'conversation.loadDisplay') {
      return { success: true, data: { events: [] } };
    }
    return { success: true, data: {} };
  });
  if (sdkResult) {
    return sdkResult;
  }
  return { success: true, data: {} };
});
const mockUpdateTranscriptSession = jest.fn();
const mockChatInterface = jest.fn((props) => (
  <div
    data-testid="chat-interface-stub"
    data-loading-conversation-ref={props.loadingConversationRef || ''}
  >
    ChatInterfaceStub
  </div>
));
let mockSessionInfo = { conversationRef: null, userId: null };

jest.mock('../../src/renderer/features/chat/components/ChatInterface', () => (props) =>
  mockChatInterface(props),
);

jest.mock('../../src/renderer/features/dashboard/components/sections/SettingsSection', () => (props) => (
  <div
    data-testid="settings-section-stub"
    data-memory-admin-user-id={props.memoryAdminUserId || ''}
  >
    <button type="button" onClick={() => props.onClose?.()}>
      Back to dashboard
    </button>
    <button type="button" onClick={() => props.onChatsCleared?.()}>
      Trigger chats cleared
    </button>
    SettingsSectionStub
  </div>
));

jest.mock('../../src/renderer/features/dashboard/components/sections/ModelsSection', () => () => (
  <div data-testid="models-section-stub">ModelsSectionStub</div>
));

jest.mock('../../src/renderer/features/dashboard/components/sections/MemorySection', () => () => (
  <div data-testid="memory-section-stub">MemorySectionStub</div>
));

jest.mock('../../src/renderer/features/dashboard/components/sections/UsageSection', () => () => (
  <div data-testid="usage-section-stub">UsageSectionStub</div>
));

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getTranscriptSessionInfo: () => mockSessionInfo,
    updateTranscriptSession: (...args) => mockUpdateTranscriptSession(...args),
  },
}));

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
    on: (channel, listener) => {
      if (!mockListeners) {
        return () => {};
      }
      mockListeners.set(channel, listener);
      return () => {
        mockListeners.delete(channel);
      };
    },
  },
  INVOKE_CHANNELS: {
    DESKTOP_RUNTIME_INVOKE: 'windie:invoke',
    SET_ACTIVE_WORKSPACE: 'set-active-workspace',
    GET_CLIENT_USER_ID: 'get-client-user-id',
  },
  ON_CHANNELS: {
    MAIN_WINDOW_OPEN_TARGET: 'main-window-open-target',
    IPC_STATUS: 'ipc-status',
    DESKTOP_RUNTIME_CONVERSATION_EVENT: 'windie:conversation-event',
    DESKTOP_RUNTIME_CONVERSATION_METADATA_INVALIDATED: 'windie:conversation-metadata-invalidated',
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopWorkspaceRuntimeClient', () => {
  const actual = jest.requireActual('../../src/renderer/app/runtime/desktopWorkspaceRuntimeClient');
  return {
    DesktopWorkspaceRuntimeClient: {
      ...actual.DesktopWorkspaceRuntimeClient,
      clearAllConversationWorkspaceBindings: jest.fn(),
      clearConversationWorkspaceBinding: jest.fn(),
      resolveConversationWorkspaceBinding: jest.fn(({ conversation }) => ({
        workspacePath: conversation?.workspace_path || '',
        workspaceName: conversation?.workspace_name || '',
      })),
      setActiveWorkspaceSelection: jest.fn(),
      setConversationWorkspaceBinding: jest.fn(),
    },
  };
});

const mockClearAllConversationWorkspaceBindings = DesktopWorkspaceRuntimeClient.clearAllConversationWorkspaceBindings;
const mockClearConversationWorkspaceBinding = DesktopWorkspaceRuntimeClient.clearConversationWorkspaceBinding;

describe('DashboardShell', () => {
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
    const sdkResult = await handleSdkCommandFromMockInvoke(args, implementation);
    if (sdkResult) {
      return sdkResult;
    }
    return implementation(...args);
  };

  const renderDashboardShell = async ({ expandSidebar = true } = {}) => {
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
    if (expandSidebar) {
      const expandButton = screen.queryByRole('button', { name: 'Expand sidebar' });
      if (expandButton) {
        fireEvent.click(expandButton);
      }
    }
    return view;
  };

  beforeEach(() => {
    mockListeners.clear();
    mockInvoke.mockClear();
    mockUpdateTranscriptSession.mockClear();
    mockChatInterface.mockClear();
    mockClearAllConversationWorkspaceBindings.mockClear();
    mockClearConversationWorkspaceBinding.mockClear();
    mockClientSnapshot = { isConnected: true, userId: LOCAL_SNAPSHOT_USER_ID };
    mockSessionInfo = { conversationRef: null, userId: null };
    useChatStore.setState({
      activeConversationRef: null,
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
      if (channel === 'conversations.list') {
        return {
          success: true,
          data: {
            conversations: [{
              conversation_id: 'conv-store-active',
              title: 'Store active chat',
              updated_at: '2026-04-10T00:00:00.000Z',
              created_at: '2026-04-10T00:00:00.000Z',
              record_kind: 'chat_event',
            }],
          },
        };
      }
      if (channel === 'conversation.loadDisplay') {
        return {
          success: true,
          data: { memories: [] },
        };
      }
      if (channel === 'conversations.search') {
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

  test('opens settings view when main process emits settings target', async () => {
    await renderDashboardShell();

    act(() => {
      const listener = mockListeners.get('main-window-open-target');
      listener?.({ target: 'settings' });
    });

    expect(screen.getByTestId('settings-section-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-interface-stub')).not.toBeInTheDocument();
  });

  test('settings back action returns to chat view', async () => {
    await renderDashboardShell();

    fireEvent.click(screen.getByTestId('sidebar-user-menu-trigger'));
    fireEvent.click(screen.getByTestId('sidebar-user-menu-settings'));
    expect(screen.getByTestId('settings-section-stub')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to dashboard' }));

    expect(screen.queryByTestId('settings-section-stub')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-interface-stub')).toBeInTheDocument();
  });

  test('defaults to collapsed sidebar and expands through dedicated controls', async () => {
    const { container } = await renderDashboardShell({ expandSidebar: false });

    expect(container.querySelector('.cg-sidebar')).toHaveClass('collapsed');
    expect(container.querySelector('.cg-main-content')).toHaveClass('cg-main-content-collapsed');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(container.querySelector('.cg-sidebar')).not.toHaveClass('collapsed');
    expect(container.querySelector('.cg-main-content')).not.toHaveClass('cg-main-content-collapsed');
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(container.querySelector('.cg-sidebar')).toHaveClass('collapsed');
    expect(container.querySelector('.cg-main-content')).toHaveClass('cg-main-content-collapsed');
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

  test('reloads recent chats when the main window is opened from the pill', async () => {
    const nowIso = new Date().toISOString();
    let listCallCount = 0;
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'conversations.list') {
        listCallCount += 1;
        return {
          success: true,
          data: {
            conversations: listCallCount === 1
              ? []
              : [
                  {
                    conversation_id: 'conv-dashboard-open',
                    record_kind: 'chat_event',
                    last_timestamp: nowIso,
                    title: 'Loaded on dashboard open',
                  },
                ],
          },
        };
      }
      return { success: true, data: {} };
    }));
    await renderDashboardShell();
    expect(screen.queryByRole('button', { name: 'Loaded on dashboard open' })).not.toBeInTheDocument();

    await act(async () => {
      const listener = mockListeners.get('main-window-open-target');
      listener?.({ target: 'chat' });
      await Promise.resolve();
    });

    expect(hasSdkCommandCall('conversations.list', { userId: LOCAL_SNAPSHOT_USER_ID })).toBe(true);
    expect(screen.getByRole('button', { name: 'Loaded on dashboard open' })).toBeInTheDocument();
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
      if (channel === 'conversations.list') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-history-1',
                record_kind: 'chat_event',
                last_timestamp: nowIso,
                title: 'Fix Ubuntu mic settings',
              },
            ],
          },
        };
      }
      if (channel === 'conversation.loadDisplay') {
        return { success: true, data: { memories: [] } };
      }
      return { success: true, data: {} };
    }));

    await renderDashboardShell();

    fireEvent.click(await screen.findByRole('button', { name: 'Fix Ubuntu mic settings' }));
    await flushMicrotasks();
    expect(hasSdkCommandCall('conversation.loadDisplay', {
      conversationRef: 'conv-history-1',
    })).toBe(true);

    if (!mockUpdateTranscriptSession.mock.calls.some(([conversationRef, userId]) => (
      conversationRef === 'conv-history-1' && userId === LOCAL_SNAPSHOT_USER_ID
    ))) {
      throw new Error('expected transcript session to switch to conv-history-1');
    }
    expect(useChatStore.getState().activeConversationRef).toBe('conv-history-1');
  });

  test('passes selected conversation loading state to chat interface while history rows load', async () => {
    const nowIso = new Date().toISOString();
    let resolveLoadDisplay;
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'conversations.list') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-history-loading',
                record_kind: 'chat_event',
                last_timestamp: nowIso,
                title: 'Slow chat history',
              },
            ],
          },
        };
      }
      if (channel === 'conversation.loadDisplay') {
        return new Promise((resolve) => {
          resolveLoadDisplay = resolve;
        });
      }
      return { success: true, data: {} };
    }));

    await renderDashboardShell();

    fireEvent.click(await screen.findByRole('button', { name: 'Slow chat history' }));
    await waitFor(() => {
      expect(screen.getByTestId('chat-interface-stub')).toHaveAttribute(
        'data-loading-conversation-ref',
        'conv-history-loading',
      );
    });

    await act(async () => {
      resolveLoadDisplay?.({ success: true, data: { events: [] } });
    });
    await waitFor(() => {
      expect(screen.getByTestId('chat-interface-stub')).toHaveAttribute(
        'data-loading-conversation-ref',
        '',
      );
    });
  });

  test('loads recent local chats while transport is disconnected', async () => {
    const nowIso = new Date().toISOString();
    mockClientSnapshot = { isConnected: false, userId: LOCAL_SNAPSHOT_USER_ID };
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'get-client-user-id') {
        return mockClientSnapshot;
      }
      if (channel === 'conversations.list') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-offline-1',
                record_kind: 'chat_event',
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
    expect(hasSdkCommandCall('conversations.list', { userId: LOCAL_SNAPSHOT_USER_ID })).toBe(true);
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
      if (channel === 'conversations.list') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-history-1',
                record_kind: 'chat_event',
                last_timestamp: nowIso,
                title: 'Do not switch while looping',
              },
            ],
          },
        };
      }
      if (channel === 'conversation.loadDisplay') {
        return { success: true, data: { memories: [] } };
      }
      return { success: true, data: {} };
    }));

    await renderDashboardShell();

    fireEvent.click(await screen.findByRole('button', { name: 'Do not switch while looping' }));
    await flushMicrotasks();

    expect(hasSdkCommandCall('conversation.loadDisplay', {
      conversationRef: 'conv-history-1',
    })).toBe(true);
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
      if (channel === 'conversations.list') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-history-1',
                record_kind: 'chat_event',
                last_timestamp: nowIso,
                title: 'Build memory migration plan',
              },
            ],
          },
        };
      }
      if (channel === 'conversation.loadDisplay') {
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
      if (channel === 'conversations.list') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-history-1',
                record_kind: 'chat_event',
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

  test('delete action from conversation kebab menu calls the SDK delete command', async () => {
    const nowIso = new Date().toISOString();
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'conversations.list') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-delete-1',
                record_kind: 'chat_event',
                last_timestamp: nowIso,
                title: 'Mission Today',
              },
            ],
          },
        };
      }
      if (channel === 'conversations.delete') {
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
      if (!hasSdkCommandCall('conversations.delete', { conversationRef: 'conv-delete-1' })) {
        throw new Error('expected SDK delete command for conv-delete-1');
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
    expect(hasSdkCommandCall('conversations.list', { userId: LOCAL_SNAPSHOT_USER_ID })).toBe(true);

    mockInvoke.mockClear();
    mockSessionInfo = { conversationRef: null, userId: 'peter-bui' };

    act(() => {
      window.dispatchEvent(new CustomEvent('transcript-session-update'));
    });
    await flushMicrotasks();
    expect(hasSdkCommandCall('conversations.list', { userId: 'peter-bui' })).toBe(true);
  });

  test('ignores stale recent-chat response after transcript user switch', async () => {
    const nowIso = new Date().toISOString();
    let resolveDefaultUserList;
    mockSessionInfo = { conversationRef: null, userId: null };
    mockInvoke.mockImplementation(withClientSnapshot(async (channel, payload) => {
      if (channel === 'get-client-user-id') {
        return mockClientSnapshot;
      }
      if (channel !== 'conversations.list') {
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
                record_kind: 'chat_event',
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
    expect(hasSdkCommandCall('conversations.list', { userId: LOCAL_SNAPSHOT_USER_ID })).toBe(true);

    mockSessionInfo = { conversationRef: null, userId: 'peter-bui' };
    act(() => {
      window.dispatchEvent(new CustomEvent('transcript-session-update'));
    });
    await flushMicrotasks();

    expect(hasSdkCommandCall('conversations.list', { userId: 'peter-bui' })).toBe(true);
    expect(screen.getByRole('button', { name: 'Peter active chat' })).toBeInTheDocument();

    await act(async () => {
      resolveDefaultUserList?.({
        success: true,
        data: {
          conversations: [
            {
              conversation_id: 'conv-user-default',
              record_kind: 'chat_event',
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
      if (channel === 'conversations.list') {
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
                record_kind: 'chat_event',
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
      mockListeners.get('windie:conversation-event')?.({
        type: 'assistant_message',
      });
    });
    await flushMicrotasks();
    expect(hasSdkCommandCall('conversations.list', { userId: LOCAL_SNAPSHOT_USER_ID })).toBe(true);
    expect(screen.getByRole('button', { name: 'How are you' })).toBeInTheDocument();
  });

  test('shows a new chat after user transcript storage and replaces the temporary title after assistant completion', async () => {
    const nowIso = new Date().toISOString();
    let listCallCount = 0;
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'conversations.list') {
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
                  record_kind: 'chat_event',
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
                record_kind: 'chat_event',
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
      mockListeners.get('windie:conversation-event')?.({
        type: 'user_message',
        conversationRef: 'conv-title-2',
      });
    });
    await flushMicrotasks();
    expect(screen.getByRole('button', { name: 'How to fix ubuntu mic settings' })).toBeInTheDocument();

    act(() => {
      mockListeners.get('windie:conversation-event')?.({
        type: 'assistant_message',
        conversationRef: 'conv-title-2',
      });
    });
    await flushMicrotasks();
    expect(screen.getByRole('button', { name: 'Ubuntu mic timeout troubleshooting' })).toBeInTheDocument();
  });

  test('refreshes recent chats when SDK reports conversation metadata invalidation', async () => {
    const nowIso = new Date().toISOString();
    let listCallCount = 0;
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'conversations.list') {
        listCallCount += 1;
        if (listCallCount === 1) {
          return {
            success: true,
            data: {
              conversations: [
                {
                  conversation_id: 'conv-title-event',
                  record_kind: 'chat_event',
                  last_timestamp: nowIso,
                  title: 'I need to know more about the cua-driver',
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
                conversation_id: 'conv-title-event',
                record_kind: 'chat_event',
                last_timestamp: nowIso,
                title: 'CUA Driver Overview',
                title_source: 'model',
              },
            ],
          },
        };
      }
      return { success: true, data: {} };
    }));

    await renderDashboardShell();
    expect(screen.getByRole('button', { name: 'I need to know more about the cua-driver' })).toBeInTheDocument();

    act(() => {
      mockListeners.get('windie:conversation-metadata-invalidated')?.({
        type: 'conversation-metadata-invalidated',
        reason: 'conversation-title-updated',
        conversationRef: 'conv-title-event',
        title: 'CUA Driver Overview',
        source: 'model',
      });
    });
    await flushMicrotasks();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'CUA Driver Overview' })).toBeInTheDocument();
    });
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
    expect(mockClearAllConversationWorkspaceBindings.mock.calls.length).toBe(1);
    expect(hasSdkCommandCall('conversations.list', { userId: 'user-live' })).toBe(true);
  });

  test('settings receives the snapshot user id when transcript session is default user', async () => {
    mockSessionInfo = { conversationRef: 'conv-live', userId: 'default_user' };
    mockClientSnapshot = { isConnected: true, userId: 'user-snapshot' };

    await renderDashboardShell();

    fireEvent.click(screen.getByTestId('sidebar-user-menu-trigger'));
    fireEvent.click(screen.getByTestId('sidebar-user-menu-settings'));

    expect(screen.getByTestId('settings-section-stub')).toHaveAttribute(
      'data-memory-admin-user-id',
      'user-snapshot',
    );
  });

  test('retries recent chats on startup when local runtime is not ready', async () => {
    jest.useFakeTimers();
    const nowIso = new Date().toISOString();
    let listCallCount = 0;
    mockInvoke.mockImplementation(withClientSnapshot(async (channel) => {
      if (channel === 'conversations.list') {
        listCallCount += 1;
        if (listCallCount === 1) {
          return {
            success: false,
            error: 'Local runtime not ready',
          };
        }
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-startup-1',
                record_kind: 'chat_event',
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
        if (channel === 'conversations.list') {
          return {
            success: true,
            data: {
              conversations: [
                {
                  conversation_id: 'conv-history-1',
                  record_kind: 'chat_event',
                  last_timestamp: nowIso,
                  title: 'Moon Landing Technology Explained',
                },
                {
                  conversation_id: 'conv-history-2',
                  record_kind: 'chat_event',
                  last_timestamp: nowIso,
                  title: 'Vietnamese-speaking lawyer leads',
                },
              ],
            },
          };
        }
        if (channel === 'conversations.search') {
          return {
            success: true,
            data: {
              conversations: [
                {
                  conversation_id: 'conv-history-2',
                  record_kind: 'chat_event',
                  last_timestamp: nowIso,
                  title: 'Vietnamese-speaking lawyer leads',
                  snippet: 'You: Looking for Vietnamese-speaking lawyer lead in California.',
                  matched_role: 'user',
                },
              ],
            },
          };
        }
        if (channel === 'conversation.loadDisplay') {
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
      expect(hasSdkCommandCall('conversations.search', {
        query: 'lawyer',
        userId: LOCAL_SNAPSHOT_USER_ID,
      })).toBe(true);
      expect(within(dialog).queryByText('Moon Landing Technology Explained')).not.toBeInTheDocument();
      expect(within(dialog).getByText('Vietnamese-speaking lawyer leads')).toBeInTheDocument();
      expect(within(dialog).getByText(/You: Looking for Vietnamese-speaking lawyer lead/i)).toBeInTheDocument();

      fireEvent.click(within(dialog).getByText('Vietnamese-speaking lawyer leads').closest('button'));
      await flushMicrotasks();
      expect(hasSdkCommandCall('conversation.loadDisplay', {
        conversationRef: 'conv-history-2',
      })).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
