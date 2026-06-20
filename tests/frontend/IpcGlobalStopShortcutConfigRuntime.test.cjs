/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  applyGlobalStopShortcutFallbackToConfig,
  createGlobalStopShortcutConfigRuntime,
  normalizeGlobalAgentStopShortcutStatus,
} = require('../../frontend/src/main/ipc/ipc_global_stop_shortcut_config_runtime.cjs');

function isValidConfigPayload(config) {
  return Boolean(config) && typeof config === 'object' && !Array.isArray(config);
}

describe('ipc_global_stop_shortcut_config_runtime', () => {
  test('normalizes shortcut status fields for renderer snapshots', () => {
    expect(normalizeGlobalAgentStopShortcutStatus(null)).toBeNull();
    expect(normalizeGlobalAgentStopShortcutStatus([])).toBeNull();

    expect(normalizeGlobalAgentStopShortcutStatus({
      enabled: true,
      requestedAccelerator: ' CommandOrControl+Alt+. ',
      resolvedAccelerator: ' CommandOrControl+Shift+. ',
      registered: true,
      registeredAccelerator: ' CommandOrControl+Shift+. ',
      registrationFailed: false,
      usingFallback: true,
      supportedAccelerators: [
        ' CommandOrControl+Alt+. ',
        '',
        42,
        'CommandOrControl+Shift+.',
      ],
    })).toEqual({
      enabled: true,
      requestedAccelerator: 'CommandOrControl+Alt+.',
      resolvedAccelerator: 'CommandOrControl+Shift+.',
      registered: true,
      registeredAccelerator: 'CommandOrControl+Shift+.',
      registrationFailed: false,
      usingFallback: true,
      supportedAccelerators: [
        'CommandOrControl+Alt+.',
        'CommandOrControl+Shift+.',
      ],
    });
  });

  test('applies resolved fallback accelerator to valid desktop UI config', () => {
    const config = {
      global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
      model_mode: 'online',
    };

    expect(applyGlobalStopShortcutFallbackToConfig(config, {
      status: {
        registrationFailed: false,
        resolvedAccelerator: 'CommandOrControl+Shift+.',
      },
      isValidConfigPayload,
    })).toEqual({
      global_agent_stop_shortcut: 'CommandOrControl+Shift+.',
      model_mode: 'online',
    });

    expect(applyGlobalStopShortcutFallbackToConfig(config, {
      status: {
        registrationFailed: true,
        resolvedAccelerator: 'CommandOrControl+Shift+.',
      },
      isValidConfigPayload,
    })).toBe(config);
    expect(applyGlobalStopShortcutFallbackToConfig(null, {
      status: {
        resolvedAccelerator: 'CommandOrControl+Shift+.',
      },
      isValidConfigPayload,
    })).toBeNull();
  });

  test('runtime persists fallback config and broadcasts connection status after status updates', () => {
    let latestConfig = {
      global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
      model_mode: 'online',
    };
    const persistDesktopUiConfigToDisk = jest.fn((config) => {
      latestConfig = config;
      return Promise.resolve({ success: true });
    });
    const broadcastConnectionStatus = jest.fn();
    const runtime = createGlobalStopShortcutConfigRuntime({
      isValidConfigPayload,
      getLatestDesktopUiConfig: () => latestConfig,
      persistDesktopUiConfigToDisk,
      broadcastConnectionStatus,
      isConnected: () => true,
    });

    runtime.updateGlobalAgentStopShortcutStatus({
      requestedAccelerator: 'CommandOrControl+Alt+.',
      resolvedAccelerator: 'CommandOrControl+Shift+.',
      registeredAccelerator: 'CommandOrControl+Shift+.',
      usingFallback: true,
      registrationFailed: false,
    });

    expect(runtime.getStatus()).toEqual(expect.objectContaining({
      resolvedAccelerator: 'CommandOrControl+Shift+.',
      usingFallback: true,
    }));
    expect(persistDesktopUiConfigToDisk).toHaveBeenCalledWith({
      global_agent_stop_shortcut: 'CommandOrControl+Shift+.',
      model_mode: 'online',
    });
    expect(broadcastConnectionStatus).toHaveBeenCalledWith(true);
  });

  test('runtime skips persistence when registration failed or fallback is already saved', () => {
    const persistDesktopUiConfigToDisk = jest.fn();
    const broadcastConnectionStatus = jest.fn();
    const runtime = createGlobalStopShortcutConfigRuntime({
      isValidConfigPayload,
      getLatestDesktopUiConfig: () => ({
        global_agent_stop_shortcut: 'CommandOrControl+Shift+.',
      }),
      persistDesktopUiConfigToDisk,
      broadcastConnectionStatus,
      isConnected: () => false,
    });

    runtime.updateGlobalAgentStopShortcutStatus({
      resolvedAccelerator: 'CommandOrControl+Shift+.',
      registrationFailed: false,
    });
    runtime.updateGlobalAgentStopShortcutStatus({
      resolvedAccelerator: 'CommandOrControl+Alt+.',
      registrationFailed: true,
    });

    expect(persistDesktopUiConfigToDisk).not.toHaveBeenCalled();
    expect(broadcastConnectionStatus).toHaveBeenCalledTimes(2);
    expect(broadcastConnectionStatus).toHaveBeenLastCalledWith(false);
  });

  test('reset clears normalized status', () => {
    const runtime = createGlobalStopShortcutConfigRuntime();

    runtime.updateGlobalAgentStopShortcutStatus({
      resolvedAccelerator: 'CommandOrControl+Alt+.',
    });
    expect(runtime.getStatus()).toEqual(expect.objectContaining({
      resolvedAccelerator: 'CommandOrControl+Alt+.',
    }));

    runtime.reset();

    expect(runtime.getStatus()).toBeNull();
  });

  test('ipc.cjs delegates shortcut status normalization and fallback persistence to the helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_global_stop_shortcut_config_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createGlobalStopShortcutConfigRuntime({');
    expect(mainSource).not.toContain('let currentGlobalAgentStopShortcutStatus');
    expect(mainSource).not.toContain('function normalizeGlobalAgentStopShortcutStatus');
    expect(mainSource).not.toContain('status.supportedAccelerators');
    expect(helperSource).toContain('function normalizeGlobalAgentStopShortcutStatus');
    expect(helperSource).toContain('function applyGlobalStopShortcutFallbackToConfig');
  });
});
