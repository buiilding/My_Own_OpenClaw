const {
  registerSdkCommandForwardingHandler,
} = require('../../frontend/src/main/ipc/ipc_sdk_command_forwarding.cjs');

function createHarness(overrides = {}) {
  const handlers = {};
  const deps = {
    isBackendRuntimeConnected: jest.fn(() => true),
    queueListModelsRequest: jest.fn(),
    ensureBackendConnection: jest.fn(async () => undefined),
    ensureInitialSettingsSync: jest.fn(async () => undefined),
    getPendingSettingsSyncPromise: jest.fn(() => null),
    sendSettingsUpdate: jest.fn(),
    requestModelList: jest.fn(async () => 'models-message-1'),
    rehydrate: jest.fn(async () => 'rehydrate-message-1'),
    compactHistory: jest.fn(async () => 'compact-message-1'),
    wakewordDetected: jest.fn(async () => 'wakeword-message-1'),
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
    expect(deps.rehydrate).not.toHaveBeenCalled();
    expect(deps.compactHistory).not.toHaveBeenCalled();
    expect(deps.wakewordDetected).not.toHaveBeenCalled();
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
    expect(deps.rehydrate).not.toHaveBeenCalled();
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
    expect(deps.wakewordDetected).not.toHaveBeenCalled();
  });

  test('queues list-models until backend connection is ready', async () => {
    const { deps, handlers } = createHarness({
      isBackendRuntimeConnected: jest.fn(() => false),
    });

    await handlers['to-backend'](null, { type: 'list-models', payload: {} });

    expect(deps.queueListModelsRequest).toHaveBeenCalledTimes(1);
    expect(deps.ensureBackendConnection).toHaveBeenCalledWith('list-models');
    expect(deps.requestModelList).not.toHaveBeenCalled();
  });

  test('forwards rehydrate payload unchanged after connection setup', async () => {
    const { deps, handlers } = createHarness();

    await handlers['to-backend'](null, {
      type: 'rehydrate',
      payload: {
        conversation_ref: 'conv-1',
        messages: [],
        rehydrate_mode: 'replace',
      },
    });

    expect(deps.rehydrate).toHaveBeenCalledWith({
      conversation_ref: 'conv-1',
      messages: [],
      rehydrate_mode: 'replace',
    });
  });
});
