/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createIpcStatusPayloads,
} = require('../../src/main/ipc/ipc_status_payloads.cjs');

function createPayloads(overrides = {}) {
  const broadcastToRenderers = jest.fn();
  return createIpcStatusPayloads({
    getState: () => ({
      currentUserId: 'user-1',
      currentConversationRef: 'conversation-1',
      currentServerUserId: 'server-user-1',
      currentSessionId: 'session-1',
      isConnected: true,
    }),
    getRuntimeEndpointSnapshot: () => ({
      runtimeWsUrl: 'ws://runtime/ws',
      runtimeHttpUrl: 'http://runtime',
    }),
    getGlobalAgentStopShortcutStatus: () => ({
      requestedAccelerator: 'CommandOrControl+.',
      resolvedAccelerator: 'CommandOrControl+.',
    }),
    broadcastToRenderers,
    ...overrides,
  });
}

describe('ipc_status_payloads', () => {
  test('builds renderer ipc status payloads', () => {
    const payloads = createPayloads();

    expect(payloads.buildIpcStatusPayload(false)).toEqual({
      isConnected: false,
      userId: 'user-1',
      runtimeWsUrl: 'ws://runtime/ws',
      runtimeHttpUrl: 'http://runtime',
      globalAgentStopShortcutStatus: {
        requestedAccelerator: 'CommandOrControl+.',
        resolvedAccelerator: 'CommandOrControl+.',
      },
    });
  });

  test('broadcasts renderer ipc status payloads through the configured channel', () => {
    const broadcastToRenderers = jest.fn();
    const payloads = createPayloads({ broadcastToRenderers });

    payloads.broadcastConnectionStatus(true);

    expect(broadcastToRenderers).toHaveBeenCalledWith('ipc-status', {
      isConnected: true,
      userId: 'user-1',
      runtimeWsUrl: 'ws://runtime/ws',
      runtimeHttpUrl: 'http://runtime',
      globalAgentStopShortcutStatus: {
        requestedAccelerator: 'CommandOrControl+.',
        resolvedAccelerator: 'CommandOrControl+.',
      },
    });
  });

  test('builds client-session and backend connection snapshots from the same state', () => {
    const payloads = createPayloads();

    expect(payloads.getClientSessionState()).toEqual({
      currentUserId: 'user-1',
      currentConversationRef: 'conversation-1',
      currentServerUserId: 'server-user-1',
      currentSessionId: 'session-1',
      isConnected: true,
      globalAgentStopShortcutStatus: {
        requestedAccelerator: 'CommandOrControl+.',
        resolvedAccelerator: 'CommandOrControl+.',
      },
    });
    expect(payloads.getBackendConnectionState()).toEqual({
      isConnected: true,
      userId: 'user-1',
      sessionId: 'session-1',
      serverUserId: 'server-user-1',
      conversationRef: 'conversation-1',
      backendWsUrl: 'ws://runtime/ws',
      backendHttpUrl: 'http://runtime',
      globalAgentStopShortcutStatus: {
        requestedAccelerator: 'CommandOrControl+.',
        resolvedAccelerator: 'CommandOrControl+.',
      },
    });
  });

  test('normalizes missing state fields to null and connection to boolean', () => {
    const payloads = createPayloads({
      getState: () => ({
        isConnected: 'yes',
      }),
      getRuntimeEndpointSnapshot: () => ({}),
      getGlobalAgentStopShortcutStatus: () => null,
    });

    expect(payloads.getClientSessionState()).toEqual({
      currentUserId: null,
      currentConversationRef: null,
      currentServerUserId: null,
      currentSessionId: null,
      isConnected: true,
      globalAgentStopShortcutStatus: null,
    });
    expect(payloads.getBackendConnectionState()).toEqual(expect.objectContaining({
      userId: null,
      backendWsUrl: null,
      backendHttpUrl: null,
    }));
  });

  test('ipc.cjs delegates status payload shaping to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_status_payloads.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createIpcStatusPayloads({');
    expect(mainSource).toContain('ipcStatusPayloads.broadcastConnectionStatus(connected)');
    expect(mainSource).not.toContain("broadcastToRenderers('ipc-status'");
    expect(mainSource).not.toContain('function buildIpcStatusPayload(connected)');
    expect(mainSource).not.toContain('backendWsUrl: backendEndpointState.getWsUrl()');
    expect(mainSource).not.toContain('globalAgentStopShortcutStatus: getGlobalAgentStopShortcutStatus()');
    expect(helperSource).toContain("statusChannel = 'ipc-status'");
    expect(helperSource).toContain('broadcastToRenderers(statusChannel, buildIpcStatusPayload(connected))');
    expect(helperSource).toContain('backendWsUrl: endpoints.runtimeWsUrl || null');
    expect(helperSource).toContain('runtimeWsUrl: endpoints.runtimeWsUrl || null');
  });
});
