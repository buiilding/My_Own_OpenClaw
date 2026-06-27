/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createMcpRefreshRuntime,
} = require('../../src/main/ipc/ipc_mcp_refresh_runtime.cjs');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createHarness(overrides = {}) {
  const config = overrides.config || {
    agent_enabled_mcp_servers: ['mcp:memory'],
  };
  const agent = overrides.agent || {
    refreshMcpServers: jest.fn(async () => ({ source: 'agent' })),
  };
  const deps = {
    getDesktopUiConfigForMcpRegistry: jest.fn(() => config),
    countMcpEnabledServersInConfig: jest.fn(() => 1),
    ensureAgent: jest.fn(async () => agent),
    refreshMcpServersForConfig: jest.fn(async () => ({ source: 'registry' })),
    getMcpClientInfo: jest.fn(() => ({ name: 'Desktop Runtime', version: 'test' })),
    isTest: jest.fn(() => false),
    log: jest.fn(),
    ...overrides.deps,
  };
  return {
    agent,
    config,
    deps,
    runtime: createMcpRefreshRuntime(deps),
  };
}

describe('ipc_mcp_refresh_runtime', () => {
  test('refreshes latest MCP config through the Agent SDK when not in tests', async () => {
    const { agent, config, deps, runtime } = createHarness();

    await expect(runtime.refreshMcpServersForLatestConfig('manual-refresh')).resolves.toEqual({
      source: 'agent',
    });

    expect(deps.ensureAgent).toHaveBeenCalledWith({ reason: 'manual-refresh' });
    expect(agent.refreshMcpServers).toHaveBeenCalledWith({ config });
    expect(deps.refreshMcpServersForConfig).not.toHaveBeenCalled();
  });

  test('falls back to local MCP registry refresh in tests or when the agent has no refresh method', async () => {
    const first = createHarness({
      deps: {
        isTest: jest.fn(() => true),
      },
    });

    await expect(first.runtime.refreshMcpServersForLatestConfig('test-refresh')).resolves.toEqual({
      source: 'registry',
    });

    expect(first.deps.ensureAgent).not.toHaveBeenCalled();
    expect(first.deps.refreshMcpServersForConfig).toHaveBeenCalledWith({
      config: first.config,
      clientInfo: { name: 'Desktop Runtime', version: 'test' },
    });

    const second = createHarness({
      agent: {},
    });

    await expect(second.runtime.refreshMcpServersForLatestConfig('no-agent-refresh')).resolves.toEqual({
      source: 'registry',
    });

    expect(second.deps.ensureAgent).toHaveBeenCalledWith({ reason: 'no-agent-refresh' });
    expect(second.deps.refreshMcpServersForConfig).toHaveBeenCalledWith({
      config: second.config,
      clientInfo: { name: 'Desktop Runtime', version: 'test' },
    });
  });

  test('startup refresh skips tests and configs without enabled MCP servers', () => {
    const testRuntime = createHarness({
      deps: {
        isTest: jest.fn(() => true),
      },
    });
    testRuntime.runtime.refreshEnabledMcpServersAfterStartup(testRuntime.config);
    expect(testRuntime.deps.ensureAgent).not.toHaveBeenCalled();

    const emptyRuntime = createHarness({
      deps: {
        countMcpEnabledServersInConfig: jest.fn(() => 0),
      },
    });
    emptyRuntime.runtime.refreshEnabledMcpServersAfterStartup(emptyRuntime.config);
    expect(emptyRuntime.deps.ensureAgent).not.toHaveBeenCalled();
  });

  test('startup refresh shares one pending refresh and clears it when settled', async () => {
    const refresh = deferred();
    const { deps, runtime } = createHarness({
      agent: {
        refreshMcpServers: jest.fn(() => refresh.promise),
      },
    });

    runtime.refreshEnabledMcpServersAfterStartup({
      agent_enabled_mcp_servers: ['mcp:memory'],
    });
    const pending = runtime.getPendingStartupMcpRefreshPromise();
    runtime.refreshEnabledMcpServersAfterStartup({
      agent_enabled_mcp_servers: ['mcp:memory'],
    });

    expect(deps.countMcpEnabledServersInConfig).toHaveBeenCalledTimes(2);
    expect(deps.ensureAgent).toHaveBeenCalledTimes(1);
    expect(runtime.getPendingStartupMcpRefreshPromise()).toBe(pending);

    refresh.resolve({ success: true });
    await pending;

    expect(runtime.getPendingStartupMcpRefreshPromise()).toBeNull();
  });

  test('startup refresh logs failures and clears the pending refresh', async () => {
    const { deps, runtime } = createHarness({
      agent: {
        refreshMcpServers: jest.fn(async () => {
          throw new Error('boom');
        }),
      },
    });

    runtime.refreshEnabledMcpServersAfterStartup({
      agent_enabled_mcp_servers: ['mcp:memory'],
    });
    await runtime.getPendingStartupMcpRefreshPromise();

    expect(deps.log).toHaveBeenCalledWith(
      'Failed to refresh enabled MCP servers at startup: boom',
    );
    expect(runtime.getPendingStartupMcpRefreshPromise()).toBeNull();
  });

  test('reset clears the pending startup refresh handle', () => {
    const refresh = deferred();
    const { runtime } = createHarness({
      agent: {
        refreshMcpServers: jest.fn(() => refresh.promise),
      },
    });

    runtime.refreshEnabledMcpServersAfterStartup({
      agent_enabled_mcp_servers: ['mcp:memory'],
    });
    expect(runtime.getPendingStartupMcpRefreshPromise()).not.toBeNull();

    runtime.reset();

    expect(runtime.getPendingStartupMcpRefreshPromise()).toBeNull();
    refresh.resolve({ success: true });
  });

  test('ipc.cjs delegates MCP refresh orchestration to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_mcp_refresh_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createMcpRefreshRuntime({');
    expect(mainSource).not.toContain('let pendingStartupMcpRefreshPromise');
    expect(mainSource).not.toContain("refreshMcpServersForConfig({\n    config");
    expect(mainSource).not.toContain("refreshMcpServersForLatestConfig('mcp-startup')");
    expect(helperSource).toContain("refreshMcpServersForLatestConfig('mcp-startup')");
    expect(helperSource).toContain('pendingStartupMcpRefreshPromise');
  });
});
