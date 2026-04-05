import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import ChatBrowserSessionControl from '../../frontend/src/renderer/features/chat/components/ChatBrowserSessionControl';

const mockInvoke = jest.fn();
const mockListeners = new Map();

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
    EXECUTE_TOOL: 'execute-tool',
    GET_LOCAL_BACKEND_STATUS: 'get-local-backend-status',
  },
  ON_CHANNELS: {
    LOCAL_BACKEND_STATUS: 'local-backend-status',
  },
}));

function createBrowserToolHandler(session) {
  return async (channel, payload = {}) => {
    if (channel === 'get-local-backend-status') {
      return {
        ready: session.localBackendReady !== false,
        status: session.localBackendReady === false ? 'starting' : 'ready',
        error: '',
      };
    }

    expect(channel).toBe('execute-tool');
    expect(payload.toolName).toBe('browser');

    const action = payload?.args?.action;
    const currentTab = session.tabs.find((tab) => tab.targetId === session.currentTargetId) || null;

    if (action === 'status') {
      return {
        success: true,
        data: session.connected ? {
          connected: true,
          target_id: session.currentTargetId,
          title: currentTab?.title || '',
          url: currentTab?.url || 'about:blank',
          tab_count: session.tabs.length,
        } : {
          connected: false,
          target_id: '',
          title: '',
          url: '',
          tab_count: 0,
        },
      };
    }

    if (action === 'get_tabs') {
      return {
        success: true,
        data: {
          tabs: session.connected
            ? session.tabs.map((tab) => ({
              target_id: tab.targetId,
              title: tab.title,
              url: tab.url,
            }))
            : [],
          tab_count: session.connected ? session.tabs.length : 0,
        },
      };
    }

    if (action === 'connect') {
      session.connected = true;
      session.currentTargetId = session.tabs[0]?.targetId || '';
      return {
        success: true,
        data: {
          status: 'connected',
          title: session.tabs[0]?.title || '',
          url: session.tabs[0]?.url || 'about:blank',
        },
      };
    }

    if (action === 'switch') {
      session.currentTargetId = payload?.args?.tab_id || session.currentTargetId;
      const nextTab = session.tabs.find((tab) => tab.targetId === session.currentTargetId) || null;
      return {
        success: true,
        data: {
          target_id: session.currentTargetId,
          title: nextTab?.title || '',
          url: nextTab?.url || 'about:blank',
        },
      };
    }

    if (action === 'close') {
      session.connected = false;
      session.currentTargetId = '';
      return {
        success: true,
        data: {
          status: 'closed',
        },
      };
    }

    throw new Error(`Unhandled browser action in test: ${action}`);
  };
}

describe('ChatBrowserSessionControl', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockListeners.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('shows connect browser when the browser is disconnected and switches to the active tab label after connecting', async () => {
    const session = {
      connected: false,
      localBackendReady: true,
      currentTargetId: '',
      tabs: [
        { targetId: 'tab-1', title: 'Docs', url: 'https://docs.windieos.com' },
        { targetId: 'tab-2', title: 'GitHub', url: 'https://github.com/windieos' },
      ],
    };
    mockInvoke.mockImplementation(createBrowserToolHandler(session));

    render(<ChatBrowserSessionControl />);

    const connectButton = await screen.findByRole('button', { name: 'Connect browser' });
    expect(connectButton).toBeInTheDocument();

    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('execute-tool', expect.objectContaining({
        toolName: 'browser',
        args: expect.objectContaining({ action: 'connect' }),
      }));
    });

    expect(
      await screen.findByRole('button', { name: 'Browser Tab: Docs' }),
    ).toBeInTheDocument();
  });

  test('opens the carousel, switches tabs, and disconnects the browser', async () => {
    const session = {
      connected: true,
      localBackendReady: true,
      currentTargetId: 'tab-1',
      tabs: [
        { targetId: 'tab-1', title: 'Docs', url: 'https://docs.windieos.com' },
        { targetId: 'tab-2', title: 'GitHub', url: 'https://github.com/windieos' },
      ],
    };
    mockInvoke.mockImplementation(createBrowserToolHandler(session));

    render(<ChatBrowserSessionControl />);

    const currentTabButton = await screen.findByRole('button', { name: 'Browser Tab: Docs' });
    fireEvent.click(currentTabButton);

    expect(screen.getByRole('dialog', { name: 'Browser tab carousel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next browser tab' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('execute-tool', expect.objectContaining({
        toolName: 'browser',
        args: expect.objectContaining({
          action: 'switch',
          tab_id: 'tab-2',
          activate: false,
        }),
      }));
    });

    expect(
      await screen.findByRole('button', { name: 'Browser Tab: GitHub' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect browser' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('execute-tool', expect.objectContaining({
        toolName: 'browser',
        args: expect.objectContaining({ action: 'close' }),
      }));
    });

    expect(await screen.findByRole('button', { name: 'Connect browser' })).toBeInTheDocument();
  });

  test('polls for live tab updates while the carousel is open', async () => {
    jest.useFakeTimers();

    const session = {
      connected: true,
      localBackendReady: true,
      currentTargetId: 'tab-1',
      tabs: [
        { targetId: 'tab-1', title: 'Docs', url: 'https://docs.windieos.com' },
      ],
    };
    mockInvoke.mockImplementation(createBrowserToolHandler(session));

    render(<ChatBrowserSessionControl />);

    fireEvent.click(await screen.findByRole('button', { name: 'Browser Tab: Docs' }));

    session.tabs.push({
      targetId: 'tab-2',
      title: 'New pricing tab',
      url: 'https://windieos.com/pricing',
    });
    session.currentTargetId = 'tab-2';

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(
      await screen.findByRole('button', { name: 'Browser Tab: New pricing tab' }),
    ).toBeInTheDocument();
  });

  test('waits for the local backend ready signal before issuing browser tool calls', async () => {
    const session = {
      connected: true,
      localBackendReady: false,
      currentTargetId: 'tab-1',
      tabs: [
        { targetId: 'tab-1', title: 'Docs', url: 'https://docs.windieos.com' },
      ],
    };
    mockInvoke.mockImplementation(createBrowserToolHandler(session));

    render(<ChatBrowserSessionControl />);

    expect(await screen.findByRole('button', { name: 'Connect browser' })).toBeDisabled();
    expect(mockInvoke.mock.calls[0]).toEqual(['get-local-backend-status', undefined]);
    const issuedBrowserToolCall = mockInvoke.mock.calls.some(([channel, payload]) => (
      channel === 'execute-tool' && payload?.toolName === 'browser'
    ));
    if (issuedBrowserToolCall) {
      throw new Error('Browser tool should not be called before the local backend is ready.');
    }

    session.localBackendReady = true;
    await act(async () => {
      mockListeners.get('local-backend-status')?.({ ready: true });
    });

    expect(
      await screen.findByRole('button', { name: 'Browser Tab: Docs' }),
    ).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith(
      'execute-tool',
      expect.objectContaining({
        toolName: 'browser',
        args: expect.objectContaining({ action: 'status' }),
      }),
    );
  });
});
