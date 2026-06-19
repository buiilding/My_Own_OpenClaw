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
  normalizeDesktopTransportConnectionStatus,
  resolveObservedDesktopTransportConnection,
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

  test('normalizes transport connection status for chat loop consumers', () => {
    expect(normalizeDesktopTransportConnectionStatus({ isConnected: true })).toEqual({
      isConnected: true,
      hasConnectionState: true,
    });
    expect(normalizeDesktopTransportConnectionStatus({ isConnected: false })).toEqual({
      isConnected: false,
      hasConnectionState: true,
    });
    expect(normalizeDesktopTransportConnectionStatus({ isConnected: 'yes' })).toEqual({
      isConnected: false,
      hasConnectionState: false,
    });
    expect(normalizeDesktopTransportConnectionStatus(null)).toEqual({
      isConnected: false,
      hasConnectionState: false,
    });
  });

  test('resolves observed transport connections for chat loop consumers', () => {
    expect(resolveObservedDesktopTransportConnection({ isConnected: true })).toBe(true);
    expect(resolveObservedDesktopTransportConnection({ isConnected: false })).toBe(false);
    expect(resolveObservedDesktopTransportConnection({ isConnected: 'yes' })).toBeNull();
    expect(resolveObservedDesktopTransportConnection(null)).toBeNull();
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

  test('transport status subscriptions emit normalized connection state', () => {
    const events: unknown[] = [];
    const unsubscribe = DesktopClientSessionRuntimeClient.onIpcTransportStatus((event) => {
      events.push(event);
    });

    statusListener?.({ isConnected: true });
    statusListener?.({ isConnected: 'yes' });

    expect(events).toEqual([
      {
        isConnected: true,
        hasConnectionState: true,
      },
      {
        isConnected: false,
        hasConnectionState: false,
      },
    ]);

    unsubscribe?.();
    expect(statusListener).toBeNull();
  });

  test('observed transport connection subscriptions skip snapshots without connection state', () => {
    const events: unknown[] = [];
    const unsubscribe = DesktopClientSessionRuntimeClient.onObservedIpcTransportConnection((event) => {
      events.push(event);
    });

    statusListener?.({ isConnected: true });
    statusListener?.({ isConnected: 'yes' });
    statusListener?.({ isConnected: false });

    expect(events).toEqual([
      true,
      false,
    ]);

    unsubscribe?.();
    expect(statusListener).toBeNull();
  });

  test('loadMainTransportStatus returns normalized connection state', async () => {
    mockInvoke.mockResolvedValue({
      userId: ' dashboard-user ',
      isConnected: false,
    });

    await expect(DesktopClientSessionRuntimeClient.loadMainTransportStatus()).resolves.toEqual({
      isConnected: false,
      hasConnectionState: true,
    });
    expect(mockInvoke).toHaveBeenCalledWith('get-client-user-id');
  });

  test('loadObservedMainTransportConnection returns observed connection state only', async () => {
    mockInvoke.mockResolvedValueOnce({
      userId: ' dashboard-user ',
      isConnected: false,
    });

    await expect(DesktopClientSessionRuntimeClient.loadObservedMainTransportConnection()).resolves.toBe(false);

    mockInvoke.mockResolvedValueOnce({
      userId: ' dashboard-user ',
      isConnected: 'unknown',
    });

    await expect(DesktopClientSessionRuntimeClient.loadObservedMainTransportConnection()).resolves.toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith('get-client-user-id');
  });
});
