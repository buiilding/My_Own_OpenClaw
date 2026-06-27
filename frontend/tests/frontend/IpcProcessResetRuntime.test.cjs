/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');
const {
  createIpcProcessResetRuntime,
} = require('../../src/main/ipc/ipc_process_reset_runtime.cjs');

function resettable(name, calls) {
  return {
    reset: jest.fn(() => {
      calls.push(`${name}.reset`);
    }),
  };
}

describe('ipc process reset runtime', () => {
  test('resets backend session state and trace caches together', () => {
    const calls = [];
    const backendSessionState = resettable('backendSessionState', calls);
    const liveTurnState = resettable('liveTurnState', calls);
    const currentTurnTraceLogger = resettable('currentTurnTraceLogger', calls);
    const electronMainTraceLogger = resettable('electronMainTraceLogger', calls);
    const runtime = createIpcProcessResetRuntime({
      backendSessionState,
      liveTurnState,
      currentTurnTraceLogger,
      electronMainTraceLogger,
    });

    runtime.resetBackendSessionState();

    expect(calls).toEqual([
      'backendSessionState.reset',
      'liveTurnState.reset',
      'currentTurnTraceLogger.reset',
      'electronMainTraceLogger.reset',
    ]);
  });

  test('shutdown reset preserves process cleanup order', () => {
    const calls = [];
    const liveTurnState = {
      reset: jest.fn(() => calls.push('liveTurnState.reset')),
      resetPendingTurn: jest.fn(() => calls.push('liveTurnState.resetPendingTurn')),
    };
    const backendConnectionGateState = {
      reset: jest.fn(() => calls.push('backendConnectionGateState.reset')),
      setConnected: jest.fn((value) => calls.push(`backendConnectionGateState.setConnected:${value}`)),
    };
    const agentRuntimeLifecycle = {
      reset: jest.fn((input) => calls.push(`agentRuntimeLifecycle.reset:${input.closeActiveAgent}`)),
    };
    const runtime = createIpcProcessResetRuntime({
      settingsSyncRuntime: resettable('settingsSyncRuntime', calls),
      backendSessionState: resettable('backendSessionState', calls),
      liveTurnState,
      currentTurnTraceLogger: resettable('currentTurnTraceLogger', calls),
      electronMainTraceLogger: resettable('electronMainTraceLogger', calls),
      backendConnectionGateState,
      installAuthContextRuntime: resettable('installAuthContextRuntime', calls),
      activeQueryContextState: resettable('activeQueryContextState', calls),
      desktopUiConfigStore: resettable('desktopUiConfigStore', calls),
      globalStopShortcutConfigRuntime: resettable('globalStopShortcutConfigRuntime', calls),
      mcpRefreshRuntime: resettable('mcpRefreshRuntime', calls),
      hostOptionState: resettable('hostOptionState', calls),
      rendererWindowRuntime: resettable('rendererWindowRuntime', calls),
      backendMessageObserverRegistry: resettable('backendMessageObserverRegistry', calls),
      agentClientLifecycle: {
        shutdownAndReset: jest.fn(() => calls.push('agentClientLifecycle.shutdownAndReset')),
      },
      agentRuntimeLifecycle,
    });

    runtime.shutdownIpcForTests();

    expect(calls).toEqual([
      'settingsSyncRuntime.reset',
      'backendSessionState.reset',
      'liveTurnState.reset',
      'currentTurnTraceLogger.reset',
      'electronMainTraceLogger.reset',
      'backendConnectionGateState.reset',
      'installAuthContextRuntime.reset',
      'backendSessionState.reset',
      'activeQueryContextState.reset',
      'desktopUiConfigStore.reset',
      'globalStopShortcutConfigRuntime.reset',
      'mcpRefreshRuntime.reset',
      'liveTurnState.reset',
      'hostOptionState.reset',
      'currentTurnTraceLogger.reset',
      'electronMainTraceLogger.reset',
      'rendererWindowRuntime.reset',
      'backendMessageObserverRegistry.reset',
      'installAuthContextRuntime.reset',
      'backendConnectionGateState.setConnected:false',
      'mcpRefreshRuntime.reset',
      'liveTurnState.resetPendingTurn',
      'agentClientLifecycle.shutdownAndReset',
      'agentRuntimeLifecycle.reset:true',
    ]);
  });

  test('ipc.cjs delegates reset orchestration to the reset runtime', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const runtimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_process_reset_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createIpcProcessResetRuntime({');
    expect(mainSource).toContain('rendererWindowRuntime,');
    expect(mainSource).not.toContain('rendererWindowRegistry,\n  backendMessageObserverRegistry');
    expect(mainSource).toContain('ipcProcessResetRuntime.shutdownIpcForTests()');
    expect(mainSource).not.toContain('agentClientLifecycle.shutdownAndReset();');
    expect(mainSource).not.toContain('agentRuntimeLifecycle.reset({ closeActiveAgent: true });');
    expect(runtimeSource).toContain("call(rendererWindowRuntime, 'reset')");
    expect(runtimeSource).not.toContain("call(rendererWindowRegistry, 'reset')");
    expect(runtimeSource).toContain("call(agentClientLifecycle, 'shutdownAndReset')");
    expect(runtimeSource).toContain("call(agentRuntimeLifecycle, 'reset', { closeActiveAgent: true })");
  });
});
