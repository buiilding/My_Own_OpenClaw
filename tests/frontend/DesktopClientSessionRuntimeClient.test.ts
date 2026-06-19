/**
 * Covers desktop client session runtime client behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();
let statusListener: ((payload?: unknown) => void) | null = null;

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    on: (_channel: string, listener: (payload?: unknown) => void) => {
      statusListener = listener;
      return () => {
        statusListener = null;
      };
    },
  },
  INVOKE_CHANNELS: {
    GET_CLIENT_USER_ID: 'get-client-user-id',
  },
  ON_CHANNELS: {
    IPC_STATUS: 'ipc-status',
  },
}));

import {
  DesktopClientSessionRuntimeClient,
  normalizeDesktopClientSessionSnapshot,
} from '../../frontend/src/renderer/app/runtime/desktopClientSessionRuntimeClient';

describe('DesktopClientSessionRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    statusListener = null;
  });

  test('normalizes client session snapshots while preserving endpoint metadata', () => {
    expect(normalizeDesktopClientSessionSnapshot({
      userId: ' user-1 ',
      isConnected: true,
      runtimeHttpUrl: 'http://127.0.0.1:8765',
    })).toEqual({
      userId: 'user-1',
      isConnected: true,
      runtimeHttpUrl: 'http://127.0.0.1:8765',
    });

    expect(normalizeDesktopClientSessionSnapshot({
      userId: '   ',
      isConnected: 'yes',
    })).toEqual({
      userId: null,
    });
  });

  test('loadMainSessionSnapshot returns normalized snapshots', async () => {
    mockInvoke.mockResolvedValue({
      userId: ' dashboard-user ',
      isConnected: false,
    });

    await expect(DesktopClientSessionRuntimeClient.loadMainSessionSnapshot()).resolves.toEqual({
      userId: 'dashboard-user',
      isConnected: false,
    });
    expect(mockInvoke).toHaveBeenCalledWith('get-client-user-id');
  });

  test('ipc status subscriptions emit normalized snapshots', () => {
    const events: unknown[] = [];
    const unsubscribe = DesktopClientSessionRuntimeClient.onIpcStatus((event) => {
      events.push(event);
    });

    statusListener?.({
      userId: ' ipc-user ',
      isConnected: true,
      runtimeHttpUrl: 'http://localhost:8765',
    });

    expect(events).toEqual([{
      userId: 'ipc-user',
      isConnected: true,
      runtimeHttpUrl: 'http://localhost:8765',
    }]);

    unsubscribe?.();
    expect(statusListener).toBeNull();
  });
});
