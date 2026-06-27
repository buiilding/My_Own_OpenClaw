/**
 * Covers IPC startup state behavior in the frontend test suite.
 */

const {
  createIpcStartupStateRuntime,
} = require('../../src/main/ipc/ipc_startup_state.cjs');

const fs = require('fs/promises');
const path = require('path');

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve());
}

function createDeps(overrides = {}) {
  return {
    loadInstallAuthStateFromDisk: jest.fn(async () => ({
      installToken: 'token',
      installId: 'install-1',
      userId: 'user-1',
    })),
    applyInstallAuthState: jest.fn(),
    hydrateDesktopUiConfigStore: jest.fn(async () => ({
      speech_mode_enabled: true,
      global_agent_stop_shortcut: 'CommandOrControl+.',
      shortcutFallbackApplied: true,
    })),
    isValidConfigPayload: jest.fn((config) => Boolean(config && typeof config === 'object')),
    setGlobalAgentStopShortcutAccelerator: jest.fn(),
    setAgentLoopStopShortcutEnabled: jest.fn(),
    getResponseOverlayPhase: jest.fn(() => 'active-loop'),
    isAgentLoopStopShortcutPhase: jest.fn((phase) => phase === 'active-loop'),
    onDesktopUiConfigLoaded: jest.fn(),
    ...overrides,
  };
}

function initializeWithRuntime(deps) {
  const runtime = createIpcStartupStateRuntime(deps);
  runtime.initialize();
  return runtime;
}

describe('ipc_startup_state', () => {
  test('hydrates install auth and cached desktop UI config', async () => {
    const deps = createDeps();

    initializeWithRuntime(deps);
    await flushPromises();

    expect(deps.applyInstallAuthState).toHaveBeenCalledWith({
      installToken: 'token',
      installId: 'install-1',
      userId: 'user-1',
    });
    expect(deps.hydrateDesktopUiConfigStore).toHaveBeenCalledTimes(1);
    expect(deps.setGlobalAgentStopShortcutAccelerator).toHaveBeenCalledWith('CommandOrControl+.');
    expect(deps.onDesktopUiConfigLoaded).toHaveBeenCalledWith({
      speech_mode_enabled: true,
      global_agent_stop_shortcut: 'CommandOrControl+.',
      shortcutFallbackApplied: true,
    });
  });

  test('notifies startup consumers with persisted MCP enablement', async () => {
    const deps = createDeps({
      hydrateDesktopUiConfigStore: jest.fn(async () => ({
        agent_enabled_mcp_servers: ['mcp:cua-driver'],
        shortcutFallbackApplied: true,
      })),
    });

    initializeWithRuntime(deps);
    await flushPromises();

    expect(deps.onDesktopUiConfigLoaded).toHaveBeenCalledWith({
      agent_enabled_mcp_servers: ['mcp:cua-driver'],
      shortcutFallbackApplied: true,
    });
  });

  test('initializes stop shortcut state from the current response-overlay phase', () => {
    const deps = createDeps();

    initializeWithRuntime(deps);

    expect(deps.setAgentLoopStopShortcutEnabled).toHaveBeenCalledWith(true);
  });

  test('ignores invalid cached desktop UI config', async () => {
    const deps = createDeps({
      isValidConfigPayload: jest.fn(() => false),
    });

    initializeWithRuntime(deps);
    await flushPromises();

    expect(deps.setGlobalAgentStopShortcutAccelerator).not.toHaveBeenCalled();
    expect(deps.onDesktopUiConfigLoaded).not.toHaveBeenCalled();
  });

  test('startup hydration failures are fail-open', async () => {
    const deps = createDeps({
      loadInstallAuthStateFromDisk: jest.fn(async () => {
        throw new Error('auth read failed');
      }),
      hydrateDesktopUiConfigStore: jest.fn(async () => {
        throw new Error('config read failed');
      }),
    });

    initializeWithRuntime(deps);
    await expect(flushPromises()).resolves.toBeUndefined();

    expect(deps.applyInstallAuthState).not.toHaveBeenCalled();
  });

  test('runtime resolves initialize-time shortcut callbacks before hydration', async () => {
    const deps = createDeps({
      setGlobalAgentStopShortcutAccelerator: undefined,
      setAgentLoopStopShortcutEnabled: undefined,
    });
    const setGlobalAgentStopShortcutAccelerator = jest.fn();
    const setAgentLoopStopShortcutEnabled = jest.fn();
    const getGlobalAgentStopShortcutAcceleratorSetter = jest.fn(
      () => setGlobalAgentStopShortcutAccelerator,
    );
    const getAgentLoopStopShortcutEnabledSetter = jest.fn(
      () => setAgentLoopStopShortcutEnabled,
    );
    const runtime = createIpcStartupStateRuntime({
      ...deps,
      getGlobalAgentStopShortcutAcceleratorSetter,
      getAgentLoopStopShortcutEnabledSetter,
    });

    runtime.initialize();
    await flushPromises();

    expect(getGlobalAgentStopShortcutAcceleratorSetter).toHaveBeenCalledTimes(1);
    expect(getAgentLoopStopShortcutEnabledSetter).toHaveBeenCalledTimes(1);
    expect(setGlobalAgentStopShortcutAccelerator).toHaveBeenCalledWith('CommandOrControl+.');
    expect(setAgentLoopStopShortcutEnabled).toHaveBeenCalledWith(true);
  });

  test('ipc.cjs initializes startup state through the runtime wrapper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_startup_state.cjs'),
      'utf8',
    );
    const initializationSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_initialization_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createIpcStartupStateRuntime({');
    expect(mainSource).not.toContain('ipcStartupStateRuntime.initialize()');
    expect(initializationSource).toContain('ipcStartupStateRuntime.initialize()');
    expect(mainSource).not.toContain('initializeIpcStartupState({');
    expect(helperSource).toContain('function createIpcStartupStateRuntime');
    expect(helperSource).toContain('return initializeIpcStartupState({');
    const helperModule = require('../../src/main/ipc/ipc_startup_state.cjs');
    expect(helperModule.initializeIpcStartupState).toBeUndefined();
  });
});
