/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createIpcSessionContextRuntime,
} = require('../../src/main/ipc/ipc_session_context_runtime.cjs');

function createRuntime(overrides = {}) {
  const backendSessionState = {
    getSnapshot: jest.fn(() => ({
      currentConversationRef: 'conv-1',
      currentServerUserId: 'server-user-1',
      currentSessionId: 'session-1',
    })),
    getConversationRef: jest.fn(() => 'conv-1'),
    getSessionId: jest.fn(() => 'session-1'),
    setConversationRef: jest.fn(),
  };
  const installAuthContextRuntime = {
    getCurrentUserId: jest.fn(() => 'user-1'),
    setCurrentUserId: jest.fn(),
  };
  const backendConnectionGateState = {
    getConnected: jest.fn(() => true),
    getFirstQuery: jest.fn(() => false),
  };
  const agent = { id: 'agent-1' };
  return {
    agent,
    backendConnectionGateState,
    backendSessionState,
    installAuthContextRuntime,
    runtime: createIpcSessionContextRuntime({
      backendSessionState,
      installAuthContextRuntime,
      backendConnectionGateState,
      getActiveAgent: jest.fn(() => agent),
      ...overrides,
    }),
  };
}

describe('ipc_session_context_runtime', () => {
  test('builds status and query state from the same owned session sources', () => {
    const { runtime } = createRuntime();

    expect(runtime.getStatusState()).toEqual({
      currentConversationRef: 'conv-1',
      currentServerUserId: 'server-user-1',
      currentSessionId: 'session-1',
      currentUserId: 'user-1',
      isConnected: true,
    });
    expect(runtime.getQueryState()).toEqual({
      currentConversationRef: 'conv-1',
      currentServerUserId: 'server-user-1',
      currentSessionId: 'session-1',
      currentUserId: 'user-1',
      isFirstQuery: false,
    });
  });

  test('builds Agent SDK invoke state and applies transcript session sync state', () => {
    const {
      agent,
      backendSessionState,
      installAuthContextRuntime,
      runtime,
    } = createRuntime();

    expect(runtime.getAgentSdkInvokeState()).toEqual({
      currentConversationRef: 'conv-1',
      currentSessionId: 'session-1',
      currentUserId: 'user-1',
      isConnected: true,
      agent,
    });

    runtime.setTranscriptSessionState({
      currentConversationRef: 'conv-2',
      currentUserId: 'user-2',
    });

    expect(backendSessionState.setConversationRef).toHaveBeenCalledWith('conv-2');
    expect(installAuthContextRuntime.setCurrentUserId).toHaveBeenCalledWith('user-2');
  });

  test('ipc.cjs delegates repeated session snapshots to the context runtime', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_session_context_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createIpcSessionContextRuntime({');
    expect(mainSource).toContain('ipcSessionContextRuntime.getStatusState()');
    expect(mainSource).toContain('ipcSessionContextRuntime.getQueryState()');
    expect(mainSource).toContain('ipcSessionContextRuntime.getAgentSdkInvokeState()');
    expect(mainSource).toContain('ipcSessionContextRuntime.setTranscriptSessionState(state)');
    expect(mainSource).not.toContain('currentUserId: installAuthContextRuntime.getCurrentUserId()');
    expect(mainSource).not.toContain('...backendSessionState.getSnapshot()');
    expect(mainSource).not.toContain('isFirstQuery: backendConnectionGateState.getFirstQuery()');
    expect(helperSource).toContain('currentUserId: getCurrentUserId()');
    expect(helperSource).toContain('isFirstQuery: Boolean(call(backendConnectionGateState');
  });
});
