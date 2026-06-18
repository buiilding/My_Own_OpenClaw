/** @jest-environment node */

const {
  createIpcSettingsSyncRuntime,
} = require('../../frontend/src/main/ipc/ipc_settings_sync_runtime.cjs');

describe('ipc_settings_sync_runtime', () => {
  async function waitForUpdateSettings(updateSettings) {
    while (updateSettings.mock.calls.length === 0) {
      await Promise.resolve();
    }
  }

  async function waitForPendingSettingsSync(runtime, updateSettings) {
    await waitForUpdateSettings(updateSettings);
    while (!runtime.getPendingSettingsSyncPromise()) {
      await Promise.resolve();
    }
  }

  test('sendSettingsUpdate strips renderer-only config fields', async () => {
    const updateSettings = jest.fn(async () => 'settings-msg-1');
    const runtime = createIpcSettingsSyncRuntime({
      getLatestDesktopUiConfig: () => null,
      setLatestDesktopUiConfig: jest.fn(),
      isBackendRuntimeConnected: () => true,
      ensureBackendConnection: jest.fn(),
      updateSettings,
      log: jest.fn(),
      timeoutMs: 1000,
    });

    const promise = runtime.sendSettingsUpdate({
      selected_model_id: 'model-1',
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-test', renderer_only: true },
        future_provider: { enabled: true, api_key: 'future' },
      },
      global_agent_stop_shortcut: { resolvedAccelerator: 'Ctrl+Alt+.' },
      show_tool_logs: true,
      agent_custom_instructions: 'local prompt layer',
      appearance_theme: 'graphite',
    });

    await waitForPendingSettingsSync(runtime, updateSettings);
    runtime.resolveAck('settings-msg-1', true);

    await expect(promise).resolves.toBe(true);
    expect(updateSettings).toHaveBeenCalledWith({
      selected_model_id: 'model-1',
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-test' },
      },
    });
  });

  test('sendSettingsUpdate rejects invalid config payloads before backend send', async () => {
    const updateSettings = jest.fn();
    const runtime = createIpcSettingsSyncRuntime({
      updateSettings,
      log: jest.fn(),
      timeoutMs: 1000,
    });

    await expect(runtime.sendSettingsUpdate(null)).resolves.toBe(false);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  test('sendSettingsUpdate connects, sends update-settings, and resolves on ack', async () => {
    const ensureBackendConnection = jest.fn(async () => {});
    const updateSettings = jest.fn(async () => 'settings-msg-1');
    const setLatestDesktopUiConfig = jest.fn();
    const runtime = createIpcSettingsSyncRuntime({
      getLatestDesktopUiConfig: () => ({ selected_model_id: 'model-1' }),
      setLatestDesktopUiConfig,
      isBackendRuntimeConnected: () => false,
      ensureBackendConnection,
      updateSettings,
      log: jest.fn(),
      timeoutMs: 1000,
    });

    const promise = runtime.sendSettingsUpdate({
      selected_model_id: 'model-2',
      global_agent_stop_shortcut: { resolvedAccelerator: 'Ctrl+Alt+.' },
    }, 'renderer');

    await waitForPendingSettingsSync(runtime, updateSettings);
    runtime.resolveAck('settings-msg-1', true);

    await expect(promise).resolves.toBe(true);
    expect(ensureBackendConnection).toHaveBeenCalledWith('update-settings:renderer');
    expect(setLatestDesktopUiConfig).toHaveBeenCalledWith(expect.objectContaining({
      selected_model_id: 'model-2',
    }));
    expect(updateSettings).toHaveBeenCalledWith({ selected_model_id: 'model-2' });
  });

  test('sendSettingsUpdate preserves local MCP enablement in latest config', async () => {
    const updateSettings = jest.fn(async () => 'settings-msg-1');
    const setLatestDesktopUiConfig = jest.fn();
    const runtime = createIpcSettingsSyncRuntime({
      getLatestDesktopUiConfig: () => ({
        selected_model_id: 'model-1',
        agent_enabled_mcp_servers: ['mcp:cua-driver'],
      }),
      setLatestDesktopUiConfig,
      loadCachedDesktopUiConfig: jest.fn(async () => {
        throw new Error('disk should not be needed');
      }),
      isBackendRuntimeConnected: () => true,
      ensureBackendConnection: jest.fn(),
      updateSettings,
      log: jest.fn(),
      timeoutMs: 1000,
    });

    const promise = runtime.sendSettingsUpdate({
      selected_model_id: 'model-2',
    }, 'renderer');

    await waitForPendingSettingsSync(runtime, updateSettings);
    runtime.resolveAck('settings-msg-1', true);

    await expect(promise).resolves.toBe(true);
    expect(setLatestDesktopUiConfig).toHaveBeenCalledWith({
      selected_model_id: 'model-2',
      agent_enabled_mcp_servers: ['mcp:cua-driver'],
    });
    expect(updateSettings).toHaveBeenCalledWith({ selected_model_id: 'model-2' });
  });

  test('sendSettingsUpdate preserves disk MCP enablement when latest config is incomplete', async () => {
    const updateSettings = jest.fn(async () => 'settings-msg-1');
    const setLatestDesktopUiConfig = jest.fn();
    const runtime = createIpcSettingsSyncRuntime({
      getLatestDesktopUiConfig: () => ({ selected_model_id: 'model-1' }),
      setLatestDesktopUiConfig,
      loadCachedDesktopUiConfig: jest.fn(async () => ({
        selected_model_id: 'model-1',
        agent_enabled_mcp_servers: ['mcp:cua-driver'],
      })),
      isBackendRuntimeConnected: () => true,
      ensureBackendConnection: jest.fn(),
      updateSettings,
      log: jest.fn(),
      timeoutMs: 1000,
    });

    const promise = runtime.sendSettingsUpdate({
      selected_model_id: 'model-2',
    }, 'renderer');

    await waitForPendingSettingsSync(runtime, updateSettings);
    runtime.resolveAck('settings-msg-1', true);

    await expect(promise).resolves.toBe(true);
    expect(setLatestDesktopUiConfig).toHaveBeenCalledWith({
      selected_model_id: 'model-2',
      agent_enabled_mcp_servers: ['mcp:cua-driver'],
    });
    expect(updateSettings).toHaveBeenCalledWith({ selected_model_id: 'model-2' });
  });

  test('ensureInitialSettingsSync loads cached config once and waits for pending ack', async () => {
    const updateSettings = jest.fn(async () => 'settings-msg-1');
    const setLatestDesktopUiConfig = jest.fn();
    const runtime = createIpcSettingsSyncRuntime({
      getLatestDesktopUiConfig: () => null,
      setLatestDesktopUiConfig,
      loadCachedDesktopUiConfig: jest.fn(async () => ({ model_provider: 'openai' })),
      isConnected: () => true,
      isBackendRuntimeConnected: () => true,
      ensureBackendConnection: jest.fn(),
      updateSettings,
      log: jest.fn(),
      timeoutMs: 1000,
    });

    const promise = runtime.ensureInitialSettingsSync();
    await waitForPendingSettingsSync(runtime, updateSettings);
    runtime.resolveAck('settings-msg-1', true);

    await expect(promise).resolves.toBeUndefined();
    expect(setLatestDesktopUiConfig).toHaveBeenCalledWith({ model_provider: 'openai' });
    expect(updateSettings).toHaveBeenCalledTimes(1);

    await runtime.ensureInitialSettingsSync();
    expect(updateSettings).toHaveBeenCalledTimes(1);
  });

});
