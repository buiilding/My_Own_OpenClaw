/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createAgentRuntimeLifecycleRuntime,
} = require('../../src/main/ipc/ipc_agent_runtime_lifecycle.cjs');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('ipc_agent_runtime_lifecycle', () => {
  const retiredFactorySignature = `function ${['createAgentRuntime', 'Lifecycle'].join('')}(`;

  test('coalesces concurrent starts and reuses the active agent adapter', async () => {
    const agent = { id: 'agent-1' };
    const start = deferred();
    const startAgent = jest.fn(() => start.promise);
    const lifecycle = createAgentRuntimeLifecycleRuntime({
      startAgent,
      getAgentClient: jest.fn(),
    });

    const first = lifecycle.ensureAgent({ reason: 'query', workspacePath: '/repo/a' });
    const second = lifecycle.ensureAgent({ reason: 'settings', workspacePath: '/repo/b' });
    expect(startAgent).toHaveBeenCalledTimes(1);
    expect(startAgent).toHaveBeenCalledWith({
      reason: 'query',
      workspacePath: '/repo/a',
    });

    start.resolve(agent);
    await expect(first).resolves.toBe(agent);
    await expect(second).resolves.toBe(agent);
    await expect(lifecycle.ensureAgent({ reason: 'later' })).resolves.toBe(agent);
    expect(startAgent).toHaveBeenCalledTimes(1);
    expect(lifecycle.getActiveAgent()).toBe(agent);
  });

  test('forwards backend traffic and idle timer calls to the active agent', async () => {
    const agent = {
      noteBackendTraffic: jest.fn(),
      syncBackendIdleTimer: jest.fn(),
      isConnected: jest.fn(() => true),
    };
    const lifecycle = createAgentRuntimeLifecycleRuntime({
      startAgent: jest.fn(async () => agent),
      getAgentClient: jest.fn(),
    });

    await lifecycle.ensureAgent({ reason: 'query' });
    lifecycle.noteBackendTraffic('send:query');
    lifecycle.syncBackendIdleDisconnectTimer('idle-check');

    expect(agent.noteBackendTraffic).toHaveBeenCalledWith('send:query');
    expect(agent.syncBackendIdleTimer).toHaveBeenCalledWith('idle-check');
    expect(lifecycle.isBackendRuntimeConnected(true)).toBe(true);
    expect(lifecycle.isBackendRuntimeConnected(false)).toBe(false);
  });

  test('returns known client local runtime before active agent fallback', async () => {
    const clientRuntime = { source: 'client' };
    const agentRuntime = { source: 'agent' };
    const lifecycle = createAgentRuntimeLifecycleRuntime({
      startAgent: jest.fn(async () => ({ localRuntime: agentRuntime })),
      getAgentClient: jest.fn(),
      getAgentClientIfInitialized: jest.fn(() => ({
        getKnownLocalRuntime: jest.fn(() => clientRuntime),
      })),
    });

    await lifecycle.ensureAgent({ reason: 'query' });

    expect(lifecycle.getKnownAgentLocalRuntime()).toBe(clientRuntime);
  });

  test('ensures local runtime through the AgentClient with ready and failure logs', async () => {
    const runtime = { id: 'runtime-1' };
    const client = {
      localRuntime: jest.fn(async () => runtime),
    };
    const logMainRuntime = jest.fn();
    const lifecycle = createAgentRuntimeLifecycleRuntime({
      startAgent: jest.fn(),
      getAgentClient: jest.fn(() => client),
      logMainRuntime,
    });

    await expect(lifecycle.ensureAgentLocalRuntime({ reason: 'settings' })).resolves.toBe(runtime);
    expect(client.localRuntime).toHaveBeenCalledWith({ reason: 'settings' });
    expect(logMainRuntime).toHaveBeenCalledWith('[Main][SDK] local_runtime_ensure_start reason=settings');
    expect(logMainRuntime).toHaveBeenCalledWith('[Main][SDK] local_runtime_ready reason=settings');

    const error = new Error('boom');
    client.localRuntime.mockRejectedValueOnce(error);
    await expect(lifecycle.ensureAgentLocalRuntime({ reason: 'retry' })).rejects.toBe(error);
    expect(logMainRuntime).toHaveBeenCalledWith('[Main][SDK] local_runtime_failed reason=retry message="boom"');
  });

  test('ensures backend connection through the active Agent SDK adapter', async () => {
    const agent = {
      ensureConnected: jest.fn(async () => true),
    };
    const lifecycle = createAgentRuntimeLifecycleRuntime({
      startAgent: jest.fn(async () => agent),
      getAgentClient: jest.fn(),
    });

    await expect(lifecycle.ensureBackendConnection({
      reason: 'query',
      timeoutMs: 2500,
      conversationRef: 'conv-1',
    })).resolves.toBe(true);

    expect(agent.ensureConnected).toHaveBeenCalledWith({
      reason: 'query',
      timeoutMs: 2500,
      conversationRef: 'conv-1',
    });
  });

  test('ensures backend connection with the current conversation ref and default timeout', async () => {
    const agent = {
      ensureConnected: jest.fn(async () => true),
    };
    let currentConversationRef = 'conv-current';
    const lifecycle = createAgentRuntimeLifecycleRuntime({
      startAgent: jest.fn(async () => agent),
      getAgentClient: jest.fn(),
      getCurrentConversationRef: () => currentConversationRef,
      defaultBackendConnectTimeoutMs: 10000,
    });

    await expect(lifecycle.ensureCurrentBackendConnection('query')).resolves.toBe(true);
    currentConversationRef = 'conv-later';
    await expect(lifecycle.ensureCurrentBackendConnection('retry', 2500)).resolves.toBe(true);

    expect(agent.ensureConnected).toHaveBeenNthCalledWith(1, {
      reason: 'query',
      timeoutMs: 10000,
      conversationRef: 'conv-current',
    });
    expect(agent.ensureConnected).toHaveBeenNthCalledWith(2, {
      reason: 'retry',
      timeoutMs: 2500,
      conversationRef: 'conv-later',
    });
  });


  test('reset clears the active agent and can close it', async () => {
    const agent = { close: jest.fn() };
    const lifecycle = createAgentRuntimeLifecycleRuntime({
      startAgent: jest.fn(async () => agent),
      getAgentClient: jest.fn(),
    });

    await lifecycle.ensureAgent({ reason: 'query' });
    lifecycle.reset({ closeActiveAgent: true });

    expect(agent.close).toHaveBeenCalledTimes(1);
    expect(lifecycle.getActiveAgent()).toBeNull();
  });

  test('ipc.cjs delegates active agent lifecycle state to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_runtime_lifecycle.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createAgentRuntimeLifecycleRuntime({');
    expect(mainSource).not.toContain('let activeAgent');
    expect(mainSource).not.toContain('let pendingAgentStartPromise');
    expect(mainSource).not.toContain('pendingAgentStartPromise = startAgent({');
    expect(helperSource).toContain('function createAgentRuntimeLifecycleRuntime');
    expect(helperSource).not.toContain(retiredFactorySignature);
    expect(mainSource).toContain('agentRuntimeLifecycle.ensureCurrentBackendConnection(reason, timeoutMs)');
    expect(mainSource).not.toContain('agentRuntimeLifecycle.ensureBackendConnection({');
    expect(mainSource).not.toContain('conversationRef: backendSessionState.getConversationRef()');
    expect(mainSource).not.toContain('agent.ensureConnected({');
    expect(helperSource).toContain('let activeAgent = null;');
    expect(helperSource).toContain('let pendingAgentStartPromise = null;');
    expect(helperSource).toContain('pendingAgentStartPromise = startAgent({');
    expect(helperSource).toContain('agent.ensureConnected({');
    expect(helperSource).toContain('function ensureCurrentBackendConnection');
    expect(helperSource).toContain('conversationRef: getCurrentConversationRef()');
  });
});
