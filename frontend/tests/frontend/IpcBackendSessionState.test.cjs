/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createBackendSessionState,
} = require('../../src/main/ipc/ipc_backend_session_state.cjs');

describe('ipc_backend_session_state', () => {
  test('stores backend session identity independently from client identity', () => {
    const state = createBackendSessionState({
      initialSessionId: 'session-1',
      initialServerUserId: 'server-user-1',
      initialConversationRef: 'conv-1',
    });

    expect(state.getSnapshot()).toEqual({
      currentConversationRef: 'conv-1',
      currentServerUserId: 'server-user-1',
      currentSessionId: 'session-1',
    });

    state.setSessionId('session-2');
    state.setServerUserId('server-user-2');
    state.setConversationRef('conv-2');

    expect(state.getSessionId()).toBe('session-2');
    expect(state.getServerUserId()).toBe('server-user-2');
    expect(state.getConversationRef()).toBe('conv-2');
    expect(state.getSnapshot()).toEqual({
      currentConversationRef: 'conv-2',
      currentServerUserId: 'server-user-2',
      currentSessionId: 'session-2',
    });

    state.reset();
    expect(state.getSnapshot()).toEqual({
      currentConversationRef: null,
      currentServerUserId: null,
      currentSessionId: null,
    });
  });

  test('ipc.cjs delegates backend session cache storage to the helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_backend_session_state.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createBackendSessionState()');
    expect(mainSource).toContain('backendSessionState.getSnapshot()');
    expect(mainSource).toContain('backendSessionState.setSessionId(');
    expect(mainSource).toContain('backendSessionState.setServerUserId(');
    expect(mainSource).toContain('backendSessionState.setConversationRef(');
    expect(mainSource).toContain('backendSessionState.getConversationRef()');
    expect(mainSource).not.toContain('let currentSessionId = null');
    expect(mainSource).not.toContain('let currentServerUserId = null');
    expect(mainSource).not.toContain('let currentConversationRef = null');
    expect(mainSource).not.toContain('currentSessionId = value');
    expect(mainSource).not.toContain('currentServerUserId = value');
    expect(mainSource).not.toContain('currentConversationRef = conversationRef');
    expect(helperSource).toContain('let currentSessionId = initialSessionId;');
    expect(helperSource).toContain('let currentServerUserId = initialServerUserId;');
    expect(helperSource).toContain('let currentConversationRef = initialConversationRef;');
  });
});
