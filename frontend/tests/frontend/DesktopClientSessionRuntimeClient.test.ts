/**
 * Covers renderer client-session runtime behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();
let statusListener: ((payload?: unknown) => void) | null = null;

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
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

import * as DesktopClientSessionRuntimeModule from '../../src/renderer/app/runtime/desktopClientSessionRuntimeClient';
import { DesktopClientSessionRuntimeClient } from '../../src/renderer/app/runtime/desktopClientSessionRuntimeClient';

describe('DesktopClientSessionRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    statusListener = null;
  });

  test('keeps raw ipc status helper functions private to the runtime client', () => {
    expect(DesktopClientSessionRuntimeModule).not.toHaveProperty('normalizeDesktopClientSessionSnapshot');
    expect(DesktopClientSessionRuntimeModule).not.toHaveProperty('resolveDesktopClientSessionUserId');
    expect(DesktopClientSessionRuntimeModule).not.toHaveProperty('normalizeDesktopTransportConnectionStatus');
    expect(DesktopClientSessionRuntimeModule).not.toHaveProperty('resolveObservedDesktopTransportConnection');
    expect(DesktopClientSessionRuntimeModule).not.toHaveProperty('resolveDesktopClientIpcStatusValues');
  });

  test('loadMainSessionSnapshot returns normalized snapshots', async () => {
    mockInvoke.mockResolvedValueOnce({
      userId: ' dashboard-user ',
      isConnected: false,
    });

    await expect(DesktopClientSessionRuntimeClient.loadMainSessionSnapshot()).resolves.toEqual({
      userId: 'dashboard-user',
      isConnected: false,
    });

    mockInvoke.mockResolvedValueOnce({
      userId: '   ',
      isConnected: 'yes',
    });

    await expect(DesktopClientSessionRuntimeClient.loadMainSessionSnapshot()).resolves.toEqual({
      userId: null,
    });
    expect(mockInvoke).toHaveBeenCalledWith('get-client-user-id');
  });

  test('resolves and loads main session user ids directly', async () => {
    mockInvoke.mockResolvedValueOnce({
      userId: ' dashboard-user ',
      isConnected: false,
    });

    await expect(DesktopClientSessionRuntimeClient.loadMainSessionUserId()).resolves.toBe('dashboard-user');

    mockInvoke.mockResolvedValueOnce({
      userId: '   ',
      isConnected: false,
    });

    await expect(DesktopClientSessionRuntimeClient.loadMainSessionUserId()).resolves.toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith('get-client-user-id');
  });

  test('resolves ipc status values for app config consumers', () => {
    expect(DesktopClientSessionRuntimeClient.resolveIpcStatusValues({
      userId: ' ipc-user ',
      isConnected: true,
      runtimeHttpUrl: 'http://127.0.0.1:8765',
      globalAgentStopShortcutStatus: {
        usingFallback: true,
        resolvedAccelerator: 'CommandOrControl+Shift+.',
      },
    })).toEqual({
      snapshot: {
        userId: 'ipc-user',
        isConnected: true,
        runtimeHttpUrl: 'http://127.0.0.1:8765',
        globalAgentStopShortcutStatus: {
          usingFallback: true,
          resolvedAccelerator: 'CommandOrControl+Shift+.',
        },
      },
      transcriptUserId: 'ipc-user',
      isConnected: true,
      globalAgentStopShortcutStatus: {
        usingFallback: true,
        resolvedAccelerator: 'CommandOrControl+Shift+.',
      },
    });

    expect(DesktopClientSessionRuntimeClient.resolveIpcStatusValues({
      userId: ' ipc-user ',
      isConnected: 'yes',
      globalAgentStopShortcutStatus: 'unavailable',
    })).toEqual({
      snapshot: {
        userId: 'ipc-user',
        globalAgentStopShortcutStatus: 'unavailable',
      },
      transcriptUserId: 'ipc-user',
      isConnected: false,
      globalAgentStopShortcutStatus: null,
    });
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

  test('ipc status value subscriptions emit normalized app config values', () => {
    const events: unknown[] = [];
    const unsubscribe = DesktopClientSessionRuntimeClient.onIpcStatusValues((event) => {
      events.push(event);
    });

    statusListener?.({
      userId: ' ipc-user ',
      isConnected: true,
      globalAgentStopShortcutStatus: {
        usingFallback: false,
      },
    });

    expect(events).toEqual([{
      snapshot: {
        userId: 'ipc-user',
        isConnected: true,
        globalAgentStopShortcutStatus: {
          usingFallback: false,
        },
      },
      transcriptUserId: 'ipc-user',
      isConnected: true,
      globalAgentStopShortcutStatus: {
        usingFallback: false,
      },
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
