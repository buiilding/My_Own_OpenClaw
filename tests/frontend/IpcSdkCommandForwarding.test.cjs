const {
  registerSdkCommandForwardingHandler,
} = require('../../frontend/src/main/ipc/ipc_sdk_command_forwarding.cjs');

function createHarness(overrides = {}) {
  const handlers = {};
  const runtime = { send: jest.fn() };
  const deps = {
    normalizeSdkRuntimeCommand: jest.fn((message) => message || {}),
    shouldQueueUntilConnected: jest.fn((type) => type === 'list-models'),
    shouldLogRendererSdkRuntimeCommand: jest.fn(() => false),
    shouldConnectForSdkRuntimeCommand: jest.fn((type) => type !== 'update-settings'),
    shouldSyncSettingsBeforeSdkRuntimeCommand: jest.fn((type) => type === 'rehydrate'),
    isBackendRuntimeConnected: jest.fn(() => true),
    queueListModelsRequest: jest.fn(),
    ensureBackendConnection: jest.fn(async () => undefined),
    ensureInitialSettingsSync: jest.fn(async () => undefined),
    getPendingSettingsSyncPromise: jest.fn(() => null),
    attachAgentDefinitionContext: jest.fn((payload) => ({
      ...payload,
      agent_definition: { version: 1 },
    })),
    sendSettingsUpdate: jest.fn(),
    sendSdkRuntimeCommand: jest.fn(),
    getWindieSdkRuntime: jest.fn(() => runtime),
    log: jest.fn(),
    ...overrides,
  };
  const ipcMain = {
    on: jest.fn((channel, handler) => {
      handlers[channel] = handler;
    }),
  };

  registerSdkCommandForwardingHandler({
    ipcMain,
    ...deps,
  });

  return {
    deps,
    handlers,
    runtime,
  };
}

describe('ipc_sdk_command_forwarding', () => {
  test('registers the remaining non-chat to-backend handler', () => {
    const { handlers } = createHarness();

    expect(typeof handlers['to-backend']).toBe('function');
  });

  test('ignores malformed messages without forwarding', async () => {
    const { deps, handlers } = createHarness();

    await handlers['to-backend'](null, {});

    expect(deps.log).toHaveBeenCalledWith(
      'Ignoring malformed to-backend message: missing string "type"',
    );
    expect(deps.sendSdkRuntimeCommand).not.toHaveBeenCalled();
  });

  test('routes settings updates through the settings sync path', async () => {
    const { deps, handlers } = createHarness();

    await handlers['to-backend'](null, {
      type: 'update-settings',
      payload: { speech_mode_enabled: true },
    });

    expect(deps.sendSettingsUpdate).toHaveBeenCalledWith(
      { speech_mode_enabled: true },
      'renderer-update',
    );
    expect(deps.sendSdkRuntimeCommand).not.toHaveBeenCalled();
  });

  test('rejects generic query and stop-query messages', async () => {
    const { deps, handlers } = createHarness();

    await handlers['to-backend'](null, { type: 'query', payload: {} });
    await handlers['to-backend'](null, { type: 'stop-query', payload: {} });

    expect(deps.log).toHaveBeenCalledWith(
      'Ignoring query on generic to-backend IPC; use the typed chat IPC channel.',
    );
    expect(deps.log).toHaveBeenCalledWith(
      'Ignoring stop-query on generic to-backend IPC; use the typed chat IPC channel.',
    );
    expect(deps.sendSdkRuntimeCommand).not.toHaveBeenCalled();
  });

  test('queues list-models until backend connection is ready', async () => {
    const { deps, handlers } = createHarness({
      isBackendRuntimeConnected: jest.fn(() => false),
    });

    await handlers['to-backend'](null, { type: 'list-models', payload: {} });

    expect(deps.queueListModelsRequest).toHaveBeenCalledTimes(1);
    expect(deps.ensureBackendConnection).toHaveBeenCalledWith('list-models');
    expect(deps.sendSdkRuntimeCommand).not.toHaveBeenCalled();
  });

  test('attaches agent definition context and waits for settings before rehydrate', async () => {
    const pendingSettings = Promise.resolve();
    const { deps, handlers, runtime } = createHarness({
      getPendingSettingsSyncPromise: jest.fn(() => pendingSettings),
    });

    await handlers['to-backend'](null, {
      type: 'rehydrate',
      payload: { conversation_ref: 'conv-1' },
    });

    expect(deps.ensureInitialSettingsSync).toHaveBeenCalledTimes(1);
    expect(deps.sendSdkRuntimeCommand).toHaveBeenCalledWith(runtime, {
      type: 'rehydrate',
      payload: {
        conversation_ref: 'conv-1',
        agent_definition: { version: 1 },
      },
    });
  });
});
