/**
 * Covers chat browser session control. behavior in the frontend test suite.
 */

import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import ChatBrowserSessionControl from '../../src/renderer/features/chat/components/ChatBrowserSessionControl';

const mockInvoke = jest.fn();
const mockListeners = new Map();

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
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
    RUN_BROWSER_ACTION: 'run-browser-action',
    GET_LOCAL_RUNTIME_STATUS: 'get-local-runtime-status',
    DESKTOP_RUNTIME_INVOKE: 'windie:invoke',
  },
  ON_CHANNELS: {
    LOCAL_RUNTIME_STATUS: 'local-runtime-status',
  },
}));

function createBrowserToolHandler(session) {
  return async (channel, payload = {}) => {
    if (channel === 'windie:invoke') {
      return { ok: true, data: { stored: true } };
    }

    if (channel === 'get-local-runtime-status') {
      return {
        ready: session.localRuntimeReady !== false,
        status: session.localRuntimeReady === false ? 'starting' : 'ready',
        error: session.localRuntimeError || '',
      };
    }

    expect(channel).toBe('run-browser-action');

    const action = payload?.action;
    const currentTab = session.tabs.find((tab) => tab.targetId === session.currentTargetId) || null;

    if (action === 'status') {
      return {
        success: true,
        data: session.connected ? {
          connected: true,
          title: currentTab?.title || '',
          url: currentTab?.url || 'about:blank',
          tab_count: session.tabs.length,
        } : {
          connected: false,
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
            ? session.tabs.map((tab, tabIndex) => ({
              tab_index: tabIndex,
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
      session.currentTargetId = Number.isInteger(payload?.tab_index)
        ? String(payload.tab_index)
        : session.currentTargetId;
      const nextTab = session.tabs.find((tab) => tab.targetId === session.currentTargetId) || null;
      return {
        success: true,
        data: {
          tab_index: Number(session.currentTargetId),
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
      localRuntimeReady: true,
      currentTargetId: '',
      tabs: [
        { targetId: '0', title: 'Docs', url: 'https://docs.example.com' },
        { targetId: '1', title: 'GitHub', url: 'https://github.com/example/project' },
      ],
    };
    mockInvoke.mockImplementation(createBrowserToolHandler(session));

    render(<ChatBrowserSessionControl />);

    const connectButton = await screen.findByRole('button', { name: 'Connect browser' });
    expect(connectButton).toBeInTheDocument();

    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('run-browser-action', expect.objectContaining({
        action: 'connect',
      }));
    });

    expect(
      await screen.findByRole('button', { name: 'Browser Tab: Docs' }),
    ).toBeInTheDocument();
  });

  test('opens the carousel, switches tabs, and disconnects the browser', async () => {
    const session = {
      connected: true,
      localRuntimeReady: true,
      currentTargetId: '0',
      tabs: [
        { targetId: '0', title: 'Docs', url: 'https://docs.example.com' },
        { targetId: '1', title: 'GitHub', url: 'https://github.com/example/project' },
      ],
    };
    mockInvoke.mockImplementation(createBrowserToolHandler(session));

    render(<ChatBrowserSessionControl />);

    const currentTabButton = await screen.findByRole('button', { name: 'Browser Tab: Docs' });
    fireEvent.click(currentTabButton);

    expect(screen.getByRole('dialog', { name: 'Browser tab carousel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next browser tab' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('run-browser-action', expect.objectContaining({
        action: 'switch',
        tab_index: 1,
        activate: false,
      }));
    });

    expect(
      await screen.findByRole('button', { name: 'Browser Tab: GitHub' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect browser' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('run-browser-action', expect.objectContaining({
        action: 'close',
      }));
    });

    expect(await screen.findByRole('button', { name: 'Connect browser' })).toBeInTheDocument();
  });

  test('polls for live tab updates while the carousel is open', async () => {
    jest.useFakeTimers();

    const session = {
      connected: true,
      localRuntimeReady: true,
      currentTargetId: '0',
      tabs: [
        { targetId: '0', title: 'Docs', url: 'https://docs.example.com' },
      ],
    };
    mockInvoke.mockImplementation(createBrowserToolHandler(session));

    render(<ChatBrowserSessionControl />);

    fireEvent.click(await screen.findByRole('button', { name: 'Browser Tab: Docs' }));

    session.tabs.push({
      targetId: '1',
      title: 'New pricing tab',
      url: 'https://example.com/pricing',
    });
    session.currentTargetId = '1';

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(
      await screen.findByRole('button', { name: 'Browser Tab: New pricing tab' }),
    ).toBeInTheDocument();
  });

  test('waits for the local runtime ready signal before issuing browser tool calls', async () => {
    const session = {
      connected: true,
      localRuntimeReady: false,
      currentTargetId: '0',
      tabs: [
        { targetId: '0', title: 'Docs', url: 'https://docs.example.com' },
      ],
    };
    mockInvoke.mockImplementation(createBrowserToolHandler(session));

    render(<ChatBrowserSessionControl />);

    expect(await screen.findByRole('button', { name: 'Connect browser' })).toBeDisabled();
    expect(screen.getByText('Starting local runtime…')).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith('get-local-runtime-status');
    const issuedBrowserToolCall = mockInvoke.mock.calls.some(([channel, payload]) => (
      channel === 'run-browser-action'
    ));
    if (issuedBrowserToolCall) {
      throw new Error('Browser tool should not be called before the local runtime is ready.');
    }

    session.localRuntimeReady = true;
    await act(async () => {
      mockListeners.get('local-runtime-status')?.({ ready: true });
    });

    expect(
      await screen.findByRole('button', { name: 'Browser Tab: Docs' }),
    ).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith(
      'run-browser-action',
      expect.objectContaining({
      action: 'status',
      }),
    );
  });

  test('shows browser unavailable when the local runtime status reports a startup failure', async () => {
    const session = {
      connected: false,
      localRuntimeReady: false,
      localRuntimeError: 'daemon unavailable',
      currentTargetId: '',
      tabs: [],
    };
    mockInvoke.mockImplementation(createBrowserToolHandler(session));

    render(<ChatBrowserSessionControl />);

    const unavailableButton = await screen.findByRole('button', { name: 'Browser unavailable' });
    expect(unavailableButton).toBeDisabled();
    expect(unavailableButton).toHaveAttribute('title', 'daemon unavailable');
    expect(screen.getByText('Browser unavailable')).toBeInTheDocument();
  });

  test('shows connecting browser while the connect action is in flight', async () => {
    const session = {
      connected: false,
      localRuntimeReady: true,
      currentTargetId: '',
      tabs: [
        { targetId: '0', title: 'Docs', url: 'https://docs.example.com' },
      ],
    };
    let resolveConnect;
    mockInvoke.mockImplementation(async (channel, payload = {}) => {
      if (channel === 'windie:invoke') {
        return { ok: true, data: { stored: true } };
      }
      if (channel === 'get-local-runtime-status') {
        return { ready: true, status: 'ready', error: '' };
      }
      if (payload?.action === 'status') {
        return {
          success: true,
          data: {
            connected: session.connected,
            title: session.connected ? 'Docs' : '',
            url: session.connected ? 'https://docs.example.com' : '',
            tab_count: session.connected ? 1 : 0,
          },
        };
      }
      if (payload?.action === 'get_tabs') {
        return {
          success: true,
          data: {
            tabs: session.connected
              ? [{ tab_index: 0, title: 'Docs', url: 'https://docs.example.com' }]
              : [],
          },
        };
      }
      if (payload?.action === 'connect') {
        return new Promise((resolve) => {
          resolveConnect = () => {
            session.connected = true;
            resolve({
              success: true,
              data: {
                status: 'connected',
                title: 'Docs',
                url: 'https://docs.example.com',
              },
            });
          };
        });
      }
      throw new Error(`Unhandled channel/action in test: ${channel} ${payload?.action}`);
    });

    render(<ChatBrowserSessionControl />);

    fireEvent.click(await screen.findByRole('button', { name: 'Connect browser' }));

    expect(await screen.findByText('Connecting browser…')).toBeInTheDocument();

    await act(async () => {
      resolveConnect();
    });

    expect(
      await screen.findByRole('button', { name: 'Browser Tab: Docs' }),
    ).toBeInTheDocument();
  });
});
