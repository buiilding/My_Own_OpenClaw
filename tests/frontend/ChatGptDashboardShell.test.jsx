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
  },
  ON_CHANNELS: {
    MAIN_WINDOW_OPEN_TARGET: 'main-window-open-target',
  },
}));

describe('ChatGptDashboardShell', () => {
  const renderDashboardShell = async () => {
    render(
      <ChatGptDashboardShell
        config={{}}
        availableModels={{ local: [], online: [] }}
        onConfigChange={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled();
    });
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

  test('sidebar models button opens models modal', async () => {
    await renderDashboardShell();

    fireEvent.click(screen.getByRole('button', { name: 'Models' }));

    expect(screen.getByTestId('models-section-stub')).toBeInTheDocument();
  });

  test('profile click opens menu first, then settings from menu item', async () => {
    await renderDashboardShell();

    fireEvent.click(screen.getByTestId('sidebar-user-menu-trigger'));

    expect(screen.queryByTestId('settings-section-stub')).not.toBeInTheDocument();
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

  test('search chats opens modal, filters list, and opens selected conversation', async () => {
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
    expect(within(dialog).queryByText('Moon Landing Technology Explained')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Vietnamese-speaking lawyer leads')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Vietnamese-speaking lawyer leads' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'get-conversation',
        expect.objectContaining({ conversationId: 'conv-history-2' }),
      );
    });
  });
});
