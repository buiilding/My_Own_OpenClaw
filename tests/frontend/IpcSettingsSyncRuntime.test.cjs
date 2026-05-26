/** @jest-environment node */

const {
  buildBackendSettingsPayload,
  createIpcSettingsSyncRuntime,
} = require('../../frontend/src/main/ipc/ipc_settings_sync_runtime.cjs');

describe('ipc_settings_sync_runtime', () => {
  test('buildBackendSettingsPayload strips renderer-only shortcut state', () => {
    expect(buildBackendSettingsPayload({
      selected_model_id: 'model-1',
      global_agent_stop_shortcut: { resolvedAccelerator: 'Ctrl+Alt+.' },
    })).toEqual({
      selected_model_id: 'model-1',
    });
    expect(buildBackendSettingsPayload(null)).toBeNull();
  });

  test('sendSettingsUpdate connects, sends update-settings, and resolves on ack', async () => {
    const ensureBackendConnection = jest.fn(async () => {});
    const sendSdkRuntimeCommand = jest.fn(() => 'settings-msg-1');
    const setLatestFrontendConfig = jest.fn();
    const runtime = createIpcSettingsSyncRuntime({
      getLatestFrontendConfig: () => ({ selected_model_id: 'model-1' }),
      setLatestFrontendConfig,
      isBackendRuntimeConnected: () => false,
      ensureBackendConnection,
      getRuntime: () => ({ runtime: true }),
      sendSdkRuntimeCommand,
      log: jest.fn(),
      timeoutMs: 1000,
    });

    const promise = runtime.sendSettingsUpdate({
      selected_model_id: 'model-2',
      global_agent_stop_shortcut: { resolvedAccelerator: 'Ctrl+Alt+.' },
    }, 'renderer');

    await Promise.resolve();
    runtime.resolveAck('settings-msg-1', true);

    await expect(promise).resolves.toBe(true);
    expect(ensureBackendConnection).toHaveBeenCalledWith('update-settings:renderer');
    expect(setLatestFrontendConfig).toHaveBeenCalledWith(expect.objectContaining({
      selected_model_id: 'model-2',
    }));
    expect(sendSdkRuntimeCommand).toHaveBeenCalledWith({ runtime: true }, {
      type: 'update-settings',
      payload: { selected_model_id: 'model-2' },
    });
  });

  test('ensureInitialSettingsSync loads cached config once and waits for pending ack', async () => {
    const sendSdkRuntimeCommand = jest.fn(() => 'settings-msg-1');
    const setLatestFrontendConfig = jest.fn();
    const runtime = createIpcSettingsSyncRuntime({
      getLatestFrontendConfig: () => null,
      setLatestFrontendConfig,
      loadCachedFrontendConfig: jest.fn(async () => ({ model_provider: 'openai' })),
      isConnected: () => true,
      isBackendRuntimeConnected: () => true,
      ensureBackendConnection: jest.fn(),
      getRuntime: () => ({ runtime: true }),
      sendSdkRuntimeCommand,
      log: jest.fn(),
      timeoutMs: 1000,
    });

    const promise = runtime.ensureInitialSettingsSync();
    await Promise.resolve();
    runtime.resolveAck('settings-msg-1', true);

    await expect(promise).resolves.toBeUndefined();
    expect(setLatestFrontendConfig).toHaveBeenCalledWith({ model_provider: 'openai' });
    expect(sendSdkRuntimeCommand).toHaveBeenCalledTimes(1);

    await runtime.ensureInitialSettingsSync();
    expect(sendSdkRuntimeCommand).toHaveBeenCalledTimes(1);
  });
});
