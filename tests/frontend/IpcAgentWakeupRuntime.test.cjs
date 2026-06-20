/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  startAgentRuntime,
} = require('../../frontend/src/main/ipc/ipc_agent_wakeup_runtime.cjs');

function createWakeupDeps(overrides = {}) {
  const agent = { id: 'agent-1' };
  const adapter = { id: 'adapter-1' };
  return {
    ensureInstallAuthState: jest.fn(async () => ({ userId: 'user-1' })),
    resolveWorkspacePathForAgent: jest.fn(() => '/repo/fallback'),
    getAgentClient: jest.fn(() => ({
      wakeUp: jest.fn(async () => agent),
    })),
    buildDesktopInstallAuth: jest.fn(() => ({ installToken: 'token-1' })),
    getSdkAgentName: jest.fn(() => 'WindieOS'),
    isTest: jest.fn(() => false),
    getEnabledMcpServerSpecsForConfig: jest.fn(() => [{ id: 'server-1' }]),
    getDesktopUiConfigForMcpRegistry: jest.fn(() => ({ agent_enabled_mcp_servers: ['server-1'] })),
    getLocalToolLifecycle: jest.fn(() => ({ beforeExecute: jest.fn() })),
    createDirectWakeUpAgentAdapter: jest.fn(() => adapter),
    buildDirectWakeUpAgentAdapterDeps: jest.fn(() => ({ broadcastToRenderers: jest.fn() })),
    appendIpcBridgeDiagnostic: jest.fn(),
    log: jest.fn(),
    agent,
    adapter,
    ...overrides,
  };
}

describe('ipc_agent_wakeup_runtime', () => {
  test('wakes the Agent SDK runtime with install auth, workspace, MCPs, and adapter deps', async () => {
    const deps = createWakeupDeps();
    const result = await startAgentRuntime({
      reason: 'query',
      workspacePath: '/repo/explicit',
    }, deps);
    const client = deps.getAgentClient.mock.results[0].value;

    expect(result).toBe(deps.adapter);
    expect(deps.ensureInstallAuthState).toHaveBeenCalledTimes(1);
    expect(deps.resolveWorkspacePathForAgent).not.toHaveBeenCalled();
    expect(client.wakeUp).toHaveBeenCalledWith({
      installAuth: { installToken: 'token-1' },
      name: 'WindieOS',
      workspacePath: '/repo/explicit',
      builtins: 'default',
      mcps: [{ id: 'server-1' }],
      localToolLifecycle: deps.getLocalToolLifecycle.mock.results[0].value,
    });
    expect(deps.getEnabledMcpServerSpecsForConfig).toHaveBeenCalledWith({
      config: { agent_enabled_mcp_servers: ['server-1'] },
    });
    expect(deps.createDirectWakeUpAgentAdapter).toHaveBeenCalledWith({
      agent: deps.agent,
      workspacePath: '/repo/explicit',
      deps: { broadcastToRenderers: expect.any(Function) },
    });
    expect(deps.appendIpcBridgeDiagnostic).toHaveBeenCalledWith({
      action: 'runtime.wakeup',
      phase: 'sdk',
      status: 'succeeded',
      statusReason: 'query',
      hasWorkspacePath: true,
    });
    expect(deps.log).toHaveBeenCalledWith('Agent SDK wakeUp runtime started for query.');
  });

  test('uses fallback workspace path and disables persistence-heavy options in tests', async () => {
    const deps = createWakeupDeps({
      isTest: jest.fn(() => true),
      resolveWorkspacePathForAgent: jest.fn(() => '/repo/fallback'),
    });

    await startAgentRuntime({
      reason: 'test',
    }, deps);
    const client = deps.getAgentClient.mock.results[0].value;

    expect(client.wakeUp).toHaveBeenCalledWith(expect.objectContaining({
      workspacePath: '/repo/fallback',
      builtins: [],
      mcps: [],
      memory: false,
      persistence: false,
    }));
    expect(deps.getEnabledMcpServerSpecsForConfig).not.toHaveBeenCalled();
    expect(deps.appendIpcBridgeDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      hasWorkspacePath: true,
    }));
  });

  test('ipc.cjs delegates AgentClient wakeUp orchestration to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_agent_wakeup_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('startAgentRuntime({ reason, workspacePath }');
    expect(mainSource).not.toContain('const agent = await client.wakeUp({');
    expect(mainSource).not.toContain("action: 'runtime.wakeup'");
    expect(helperSource).toContain('const agent = await client.wakeUp({');
    expect(helperSource).toContain("action: 'runtime.wakeup'");
  });
});
