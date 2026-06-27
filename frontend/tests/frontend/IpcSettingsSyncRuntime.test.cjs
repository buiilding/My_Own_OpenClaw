/** @jest-environment node */

const {
  createIpcSettingsSyncRuntime,
} = require('../../src/main/ipc/ipc_settings_sync_runtime.cjs');

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
      replaceDesktopUiConfigFromRenderer: jest.fn(),
      isBackendRuntimeConnected: () => true,
      ensureBackendConnection: jest.fn(),
      updateSettings,
      log: jest.fn(),
      timeoutMs: 1000,
    });

    const promise = runtime.sendSettingsUpdate({
      selected_model_id: 'model-1',
      provider_api_keys: {
        openai: {
          enabled: true,
          api_key: 'sk-test',
          has_saved_key: true,
          clear_saved_key: true,
          renderer_only: true,
        },
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
        future_provider: { enabled: true, api_key: 'future' },
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
    const replaceDesktopUiConfigFromRenderer = jest.fn();
    const runtime = createIpcSettingsSyncRuntime({
      getLatestDesktopUiConfig: () => ({ selected_model_id: 'model-1' }),
      replaceDesktopUiConfigFromRenderer,
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
    expect(replaceDesktopUiConfigFromRenderer).toHaveBeenCalledWith(expect.objectContaining({
      selected_model_id: 'model-2',
    }));
    expect(updateSettings).toHaveBeenCalledWith({ selected_model_id: 'model-2' });
  });

  test('sendSettingsUpdate hydrates redacted provider credentials only for backend payloads', async () => {
    const updateSettings = jest.fn(async () => 'settings-msg-1');
    const replaceDesktopUiConfigFromRenderer = jest.fn();
    const hydrateProviderApiKeySecretsForBackendSettings = jest.fn((config) => ({
      ...config,
      provider_api_keys: {
        ...config.provider_api_keys,
        anthropic: {
          ...config.provider_api_keys.anthropic,
          api_key: 'sk-ant-secret',
        },
      },
    }));
    const traceSettingsUpdate = jest.fn();
    const runtime = createIpcSettingsSyncRuntime({
      getLatestDesktopUiConfig: () => null,
      replaceDesktopUiConfigFromRenderer,
      isBackendRuntimeConnected: () => true,
      ensureBackendConnection: jest.fn(),
      updateSettings,
      hydrateProviderApiKeySecretsForBackendSettings,
      traceSettingsUpdate,
      log: jest.fn(),
      timeoutMs: 1000,
    });

    const redactedConfig = {
      model_provider: 'anthropic',
      provider_api_keys: {
        anthropic: { enabled: true, api_key: '' },
      },
    };
    const promise = runtime.sendSettingsUpdate(redactedConfig, 'initial-sync');

    await waitForPendingSettingsSync(runtime, updateSettings);
    runtime.resolveAck('settings-msg-1', true);

    await expect(promise).resolves.toBe(true);
    expect(hydrateProviderApiKeySecretsForBackendSettings).toHaveBeenCalledWith(
      redactedConfig,
      expect.any(Function),
    );
    expect(replaceDesktopUiConfigFromRenderer).toHaveBeenCalledWith(redactedConfig);
    expect(updateSettings).toHaveBeenCalledWith({
      model_provider: 'anthropic',
      provider_api_keys: {
        anthropic: { enabled: true, api_key: 'sk-ant-secret' },
      },
    });
    expect(traceSettingsUpdate).toHaveBeenCalledWith(
      {
        model_provider: 'anthropic',
        provider_api_keys: {
          anthropic: { enabled: true, api_key: '' },
        },
      },
      'initial-sync',
      'settings-msg-1',
    );
  });

  test('sendSettingsUpdate falls back to redacted provider credentials when hydration fails', async () => {
    const log = jest.fn();
    const updateSettings = jest.fn(async () => 'settings-msg-1');
    const runtime = createIpcSettingsSyncRuntime({
      replaceDesktopUiConfigFromRenderer: jest.fn(),
      isBackendRuntimeConnected: () => true,
      updateSettings,
      hydrateProviderApiKeySecretsForBackendSettings: jest.fn(() => {
        throw new Error('decrypt unavailable');
      }),
      log,
      timeoutMs: 1000,
    });

    const promise = runtime.sendSettingsUpdate({
      provider_api_keys: {
        anthropic: { enabled: true, api_key: '' },
      },
    }, 'initial-sync');

    await waitForPendingSettingsSync(runtime, updateSettings);
    runtime.resolveAck('settings-msg-1', true);

    await expect(promise).resolves.toBe(true);
    expect(updateSettings).toHaveBeenCalledWith({
      provider_api_keys: {
        anthropic: { enabled: true, api_key: '' },
      },
    });
    expect(log).toHaveBeenCalledWith(
      'Failed to hydrate provider credentials for settings sync: decrypt unavailable',
    );
  });

  test('sendSettingsUpdate times out pending ACKs with source context', async () => {
    jest.useFakeTimers();
    const log = jest.fn();
    const updateSettings = jest.fn(async () => 'settings-msg-timeout');
    const runtime = createIpcSettingsSyncRuntime({
      replaceDesktopUiConfigFromRenderer: jest.fn(),
      isBackendRuntimeConnected: () => true,
      updateSettings,
      log,
      timeoutMs: 2500,
    });

    const promise = runtime.sendSettingsUpdate({ selected_model_id: 'model-timeout' }, 'query-gate');
    await waitForPendingSettingsSync(runtime, updateSettings);

    jest.advanceTimersByTime(2500);

    await expect(promise).resolves.toBe(false);
    expect(runtime.getPendingSettingsSyncPromise()).toBeNull();
    expect(log).toHaveBeenCalledWith(
      'Settings sync timeout (query-gate) for message settings-msg-timeout',
    );
    jest.useRealTimers();
  });

  test('reset clears pending settings ACKs with false', async () => {
    const updateSettings = jest.fn(async () => 'settings-msg-reset');
    const runtime = createIpcSettingsSyncRuntime({
      replaceDesktopUiConfigFromRenderer: jest.fn(),
      isBackendRuntimeConnected: () => true,
      updateSettings,
      log: jest.fn(),
      timeoutMs: 1000,
    });

    const promise = runtime.sendSettingsUpdate({ selected_model_id: 'model-reset' }, 'renderer');
    await waitForPendingSettingsSync(runtime, updateSettings);

    runtime.reset();

    await expect(promise).resolves.toBe(false);
    expect(runtime.getPendingSettingsSyncPromise()).toBeNull();
  });

  test('sendSettingsUpdate reports Agent SDK runtime connection failures', async () => {
    const log = jest.fn();
    const updateSettings = jest.fn();
    const runtime = createIpcSettingsSyncRuntime({
      getLatestDesktopUiConfig: () => null,
      replaceDesktopUiConfigFromRenderer: jest.fn(),
      isBackendRuntimeConnected: () => false,
      ensureBackendConnection: jest.fn(async () => {
        throw new Error('socket unavailable');
      }),
      updateSettings,
      log,
      timeoutMs: 1000,
    });

    await expect(runtime.sendSettingsUpdate({ selected_model_id: 'model-2' })).resolves.toBe(false);
    expect(updateSettings).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      'Failed to connect Agent SDK runtime for update-settings: socket unavailable',
    );
  });

  test('sendSettingsUpdate preserves local MCP enablement in latest config', async () => {
    const updateSettings = jest.fn(async () => 'settings-msg-1');
    const replaceDesktopUiConfigFromRenderer = jest.fn();
    const runtime = createIpcSettingsSyncRuntime({
      getLatestDesktopUiConfig: () => ({
        selected_model_id: 'model-1',
        agent_enabled_mcp_servers: ['mcp:cua-driver'],
      }),
      replaceDesktopUiConfigFromRenderer,
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
    expect(replaceDesktopUiConfigFromRenderer).toHaveBeenCalledWith({
      selected_model_id: 'model-2',
      agent_enabled_mcp_servers: ['mcp:cua-driver'],
    });
    expect(updateSettings).toHaveBeenCalledWith({ selected_model_id: 'model-2' });
  });

  test('sendSettingsUpdate preserves disk MCP enablement when latest config is incomplete', async () => {
    const updateSettings = jest.fn(async () => 'settings-msg-1');
    const replaceDesktopUiConfigFromRenderer = jest.fn();
    const runtime = createIpcSettingsSyncRuntime({
      getLatestDesktopUiConfig: () => ({ selected_model_id: 'model-1' }),
      replaceDesktopUiConfigFromRenderer,
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
    expect(replaceDesktopUiConfigFromRenderer).toHaveBeenCalledWith({
      selected_model_id: 'model-2',
      agent_enabled_mcp_servers: ['mcp:cua-driver'],
    });
    expect(updateSettings).toHaveBeenCalledWith({ selected_model_id: 'model-2' });
  });

  test('ensureInitialSettingsSync loads cached config once and waits for pending ack', async () => {
    const updateSettings = jest.fn(async () => 'settings-msg-1');
    const replaceDesktopUiConfigFromRenderer = jest.fn();
    const runtime = createIpcSettingsSyncRuntime({
      getLatestDesktopUiConfig: () => null,
      replaceDesktopUiConfigFromRenderer,
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
    expect(replaceDesktopUiConfigFromRenderer).toHaveBeenCalledWith({ model_provider: 'openai' });
    expect(updateSettings).toHaveBeenCalledTimes(1);

    await runtime.ensureInitialSettingsSync();
    expect(updateSettings).toHaveBeenCalledTimes(1);
  });

  test('ensureInitialSettingsSync hydrates cached provider credentials after restart', async () => {
    const updateSettings = jest.fn(async () => 'settings-msg-1');
    const replaceDesktopUiConfigFromRenderer = jest.fn();
    const runtime = createIpcSettingsSyncRuntime({
      getLatestDesktopUiConfig: () => null,
      replaceDesktopUiConfigFromRenderer,
      loadCachedDesktopUiConfig: jest.fn(async () => ({
        model_provider: 'anthropic',
        provider_api_keys: {
          anthropic: { enabled: true, api_key: '' },
        },
      })),
      hydrateProviderApiKeySecretsForBackendSettings: jest.fn((config) => ({
        ...config,
        provider_api_keys: {
          anthropic: { enabled: true, api_key: 'sk-ant-secret' },
        },
      })),
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
    expect(replaceDesktopUiConfigFromRenderer).toHaveBeenCalledWith({
      model_provider: 'anthropic',
      provider_api_keys: {
        anthropic: { enabled: true, api_key: '' },
      },
    });
    expect(updateSettings).toHaveBeenCalledWith({
      model_provider: 'anthropic',
      provider_api_keys: {
        anthropic: { enabled: true, api_key: 'sk-ant-secret' },
      },
    });
  });

});
