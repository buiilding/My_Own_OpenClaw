/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');
const {
  createDirectWakeUpAgentAdapterDepsRuntime,
} = require('../../src/main/ipc/ipc_direct_wake_up_agent_adapter_deps.cjs');

describe('ipc direct wake-up agent adapter deps runtime', () => {
  test('builds the direct adapter dependency surface from injected host callbacks', () => {
    const deps = {
      broadcastToRenderers: jest.fn(),
      resolveRuntimeConversationRef: jest.fn(),
      setLatestSdkLiveTurn: jest.fn(),
      setLatestConversationView: jest.fn(),
      getLatestPendingTurn: jest.fn(),
      pendingTurnMatchesCurrentTurn: jest.fn(),
      clearLatestPendingTurn: jest.fn(),
      logLiveSurfaceTrace: jest.fn(),
      summarizeCurrentTurn: jest.fn(),
      isDebugFlagEnabled: jest.fn(),
      currentTurnTraceLogger: { trace: jest.fn() },
      traceRuntimeSend: jest.fn(),
      getSyncSdkLiveTurnSurfaceIntent: jest.fn(),
      log: jest.fn(),
      buildConversationTerminalStatus: jest.fn(),
      resolveWorkspacePathForAgent: jest.fn(),
      handleAgentBackendEvent: jest.fn(),
      refreshMcpServersForConfig: jest.fn(),
      getMcpClientInfo: jest.fn(),
    };
    const runtime = createDirectWakeUpAgentAdapterDepsRuntime(deps);

    expect(runtime.build()).toEqual(deps);
  });

  test('ipc.cjs delegates direct wake-up adapter dependency construction to the helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_direct_wake_up_agent_adapter_deps.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createDirectWakeUpAgentAdapterDepsRuntime({');
    expect(mainSource).toContain(
      'buildDirectWakeUpAgentAdapterDeps: () => directWakeUpAgentAdapterDepsRuntime.build()',
    );
    expect(mainSource).not.toContain('buildDirectWakeUpAgentAdapterDeps: () => ({');
    expect(helperSource).toContain('setLatestSdkLiveTurn');
    expect(helperSource).toContain('setLatestConversationView');
    expect(helperSource).toContain('refreshMcpServersForConfig');
    expect(helperSource).toContain('traceRuntimeSend');
  });
});
