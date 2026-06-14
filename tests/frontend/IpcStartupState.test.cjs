/**
 * Covers ipc startup state. behavior in the frontend test suite.
 */

const {
  initializeIpcStartupState,
} = require('../../frontend/src/main/ipc/ipc_startup_state.cjs');

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
    loadCachedFrontendConfigFromDisk: jest.fn(async () => ({
      speech_mode_enabled: true,
      global_agent_stop_shortcut: 'CommandOrControl+.',
    })),
    isValidConfigPayload: jest.fn((config) => Boolean(config && typeof config === 'object')),
    applyShortcutStatusFallbackToConfig: jest.fn((config) => ({
      ...config,
      shortcutFallbackApplied: true,
    })),
    setLatestFrontendConfig: jest.fn(),
    setGlobalAgentStopShortcutAccelerator: jest.fn(),
    setAgentLoopStopShortcutEnabled: jest.fn(),
    getResponseOverlayPhase: jest.fn(() => 'active-loop'),
    isAgentLoopStopShortcutPhase: jest.fn((phase) => phase === 'active-loop'),
    onFrontendConfigLoaded: jest.fn(),
    ...overrides,
  };
}

describe('ipc_startup_state', () => {
  test('hydrates install auth and cached frontend config', async () => {
    const deps = createDeps();

    initializeIpcStartupState(deps);
    await flushPromises();

    expect(deps.applyInstallAuthState).toHaveBeenCalledWith({
      installToken: 'token',
      installId: 'install-1',
      userId: 'user-1',
    });
    expect(deps.applyShortcutStatusFallbackToConfig).toHaveBeenCalledWith({
      speech_mode_enabled: true,
      global_agent_stop_shortcut: 'CommandOrControl+.',
    });
    expect(deps.setLatestFrontendConfig).toHaveBeenCalledWith({
      speech_mode_enabled: true,
      global_agent_stop_shortcut: 'CommandOrControl+.',
      shortcutFallbackApplied: true,
    });
    expect(deps.setGlobalAgentStopShortcutAccelerator).toHaveBeenCalledWith('CommandOrControl+.');
    expect(deps.onFrontendConfigLoaded).toHaveBeenCalledWith({
      speech_mode_enabled: true,
      global_agent_stop_shortcut: 'CommandOrControl+.',
      shortcutFallbackApplied: true,
    });
  });

  test('notifies startup consumers with persisted MCP enablement', async () => {
    const deps = createDeps({
      loadCachedFrontendConfigFromDisk: jest.fn(async () => ({
        agent_enabled_mcp_servers: ['mcp:cua-driver'],
      })),
    });

    initializeIpcStartupState(deps);
    await flushPromises();

    expect(deps.onFrontendConfigLoaded).toHaveBeenCalledWith({
      agent_enabled_mcp_servers: ['mcp:cua-driver'],
      shortcutFallbackApplied: true,
    });
  });

  test('initializes stop shortcut state from the current response-overlay phase', () => {
    const deps = createDeps();

    initializeIpcStartupState(deps);

    expect(deps.setAgentLoopStopShortcutEnabled).toHaveBeenCalledWith(true);
  });

  test('ignores invalid cached frontend config', async () => {
    const deps = createDeps({
      isValidConfigPayload: jest.fn(() => false),
    });

    initializeIpcStartupState(deps);
    await flushPromises();

    expect(deps.setLatestFrontendConfig).not.toHaveBeenCalled();
    expect(deps.setGlobalAgentStopShortcutAccelerator).not.toHaveBeenCalled();
    expect(deps.onFrontendConfigLoaded).not.toHaveBeenCalled();
  });

  test('startup hydration failures are fail-open', async () => {
    const deps = createDeps({
      loadInstallAuthStateFromDisk: jest.fn(async () => {
        throw new Error('auth read failed');
      }),
      loadCachedFrontendConfigFromDisk: jest.fn(async () => {
        throw new Error('config read failed');
      }),
    });

    initializeIpcStartupState(deps);
    await expect(flushPromises()).resolves.toBeUndefined();

    expect(deps.applyInstallAuthState).not.toHaveBeenCalled();
    expect(deps.setLatestFrontendConfig).not.toHaveBeenCalled();
  });
});
