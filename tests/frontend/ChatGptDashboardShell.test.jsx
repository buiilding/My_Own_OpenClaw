import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import ChatGptDashboardShell from '../../frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell';

const mockListeners = new Map();
const mockInvoke = jest.fn(async (channel) => {
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
const mockSendRehydrateConversation = jest.fn(async () => undefined);
const mockSetActiveConversationRef = jest.fn();
const mockUpdateTranscriptSession = jest.fn();
let mockSessionInfo = { conversationRef: null, userId: null };

jest.mock('../../frontend/src/renderer/features/chat/components/ChatInterface', () => () => (
  <div data-testid="chat-interface-stub">ChatInterfaceStub</div>
));

jest.mock('../../frontend/src/renderer/features/dashboard/components/sections/SettingsSection', () => () => (
  <div data-testid="settings-section-stub">SettingsSectionStub</div>
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

jest.mock('../../frontend/src/renderer/infrastructure/api/client', () => ({
  ApiClient: {
    sendRehydrateConversation: (...args) => mockSendRehydrateConversation(...args),
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  getTranscriptSessionInfo: () => mockSessionInfo,
  setActiveConversationRef: (...args) => mockSetActiveConversationRef(...args),
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
  },
  ON_CHANNELS: {
    MAIN_WINDOW_OPEN_TARGET: 'main-window-open-target',
  },
}));

describe('ChatGptDashboardShell', () => {
  const flushMicrotasks = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const renderDashboardShell = async () => {
    const view = render(
      <ChatGptDashboardShell
        config={{}}
        availableModels={{ local: [], online: [] }}
        onConfigChange={jest.fn()}
      />,
    );

    await flushMicrotasks();
    expect(mockInvoke).toHaveBeenCalled();
    return view;
  };

  beforeEach(() => {
    mockListeners.clear();
    mockInvoke.mockClear();
    mockSendRehydrateConversation.mockClear();
    mockSetActiveConversationRef.mockClear();
    mockUpdateTranscriptSession.mockClear();
    mockSessionInfo = { conversationRef: null, userId: null };
  });

  test('renders chat interface as primary main content', async () => {
    await renderDashboardShell();

    expect(screen.getByTestId('chat-interface-stub')).toBeInTheDocument();
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

  test('opens recent conversation from sidebar history list', async () => {
    const nowIso = new Date().toISOString();
    mockInvoke.mockImplementation(async (channel) => {
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
    });

    await renderDashboardShell();

    fireEvent.click(await screen.findByRole('button', { name: 'Fix Ubuntu mic settings' }));

    await waitFor(() => {
      const getConversationCall = mockInvoke.mock.calls.find(
        ([channel]) => channel === 'get-conversation',
      );
      expect(getConversationCall).toBeDefined();
      expect(getConversationCall?.[1]).toEqual(
        expect.objectContaining({
          conversationId: 'conv-history-1',
        }),
      );
    });

    expect(mockSendRehydrateConversation).toHaveBeenCalledWith('conv-history-1', []);
    expect(mockSetActiveConversationRef).toHaveBeenCalledWith('conv-history-1');
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-history-1', 'default_user');
  });

  test('highlights active conversation row in sidebar history', async () => {
    const nowIso = new Date().toISOString();
    mockSessionInfo = { conversationRef: 'conv-history-1', userId: 'default_user' };
    mockInvoke.mockImplementation(async (channel) => {
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
    });

    await renderDashboardShell();

    const activeConversationButton = await screen.findByRole('button', { name: 'Build memory migration plan' });
    expect(activeConversationButton).toHaveClass('active');
  });

  test('conversation kebab menu shows only rename, pin, and delete actions', async () => {
    const nowIso = new Date().toISOString();
    mockInvoke.mockImplementation(async (channel) => {
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
    });

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
    mockInvoke.mockImplementation(async (channel) => {
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
    });

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      await renderDashboardShell();

      fireEvent.click(await screen.findByRole('button', { name: /Conversation actions for Mission Today/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'delete-conversation',
          expect.objectContaining({
            conversationId: 'conv-delete-1',
            recordKind: 'transcript',
          }),
        );
      });
    } finally {
      confirmSpy.mockRestore();
    }
  });

  test('reloads recent chats when transcript session user id becomes available', async () => {
    mockSessionInfo = { conversationRef: null, userId: null };

    await renderDashboardShell();

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'list-conversations',
        expect.objectContaining({ userId: 'default_user' }),
      );
    });

    mockInvoke.mockClear();
    mockSessionInfo = { conversationRef: null, userId: 'peter-bui' };

    act(() => {
      window.dispatchEvent(new CustomEvent('transcript-session-update'));
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'list-conversations',
        expect.objectContaining({ userId: 'peter-bui' }),
      );
    });
  });

  test('reloads recent chats after assistant llm transcript entry is stored', async () => {
    const nowIso = new Date().toISOString();
    let listCallCount = 0;
    mockInvoke.mockImplementation(async (channel) => {
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
    });

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

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'list-conversations',
        expect.objectContaining({ userId: 'default_user' }),
      );
      expect(screen.getByRole('button', { name: 'How are you' })).toBeInTheDocument();
    });
  });

  test('plays dashboard open animation on mount and when window becomes visible again', async () => {
    jest.useFakeTimers();
    let visibilityState = 'visible';
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      return window.setTimeout(() => callback(performance.now()), 0);
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });

    try {
      const { container } = render(
        <ChatGptDashboardShell
          config={{}}
          availableModels={{ local: [], online: [] }}
          onConfigChange={jest.fn()}
        />,
      );

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalled();
      });

      const shell = container.querySelector('.cg-dashboard-shell');
      expect(shell).toBeTruthy();
      expect(shell.className).toContain('cg-dashboard-shell-opening');

      act(() => {
        jest.advanceTimersByTime(421);
      });
      expect(shell.className).not.toContain('cg-dashboard-shell-opening');

      act(() => {
        visibilityState = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
      });
      act(() => {
        visibilityState = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
      });
      act(() => {
        jest.advanceTimersByTime(2);
      });
      expect(shell.className).toContain('cg-dashboard-shell-opening');
    } finally {
      rafSpy.mockRestore();
      jest.useRealTimers();
      if (originalDescriptor) {
        Object.defineProperty(document, 'visibilityState', originalDescriptor);
      } else {
        delete document.visibilityState;
      }
    }
  });

  test('search chats opens modal, filters list, and opens selected conversation', async () => {
    jest.useFakeTimers();
    const nowIso = new Date().toISOString();
    try {
      mockInvoke.mockImplementation(async (channel) => {
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
      });

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
          userId: 'default_user',
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
