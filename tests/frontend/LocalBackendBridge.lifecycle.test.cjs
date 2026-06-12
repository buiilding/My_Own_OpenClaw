/** @jest-environment node */

const {
  getAppendDiagnosticEventMock,
  initBridge,
  registerBridgeSuiteLifecycleHooks,
  resolveNextSdkRuntimeRequest,
} = require('./__mocks__/localBackendBridgeHarness.cjs');

describe('local_backend_bridge SDK sidecar lifecycle', () => {
  registerBridgeSuiteLifecycleHooks();

  test('missing SDK local runtime resolver reports failure without spawning a standalone sidecar', async () => {
    const { handlers, mainWindow, spawn } = initBridge({
      ensureLocalRuntime: null,
      getKnownLocalRuntime: null,
    });

    expect(spawn).not.toHaveBeenCalled();
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('local-backend-status', expect.objectContaining({
      ready: false,
      status: 'error',
      error: 'Windie SDK local runtime resolver is unavailable.',
    }));
    await expect(handlers['search-memory'](null, { query: 'hello' })).resolves.toEqual({
      success: false,
      error: 'Windie SDK local runtime resolver is not initialized.',
    });
  });

  test('status bootstrap wakes the lazy SDK local runtime and marks local backend ready', async () => {
    const localRuntime = {
      executeTool: jest.fn(async () => ({ success: true, data: {} })),
      rpc: jest.fn(async () => ({ success: true })),
      subscribeEvents: jest.fn(() => jest.fn()),
      shutdown: jest.fn(async () => undefined),
    };
    const ensureLocalRuntime = jest.fn(async () => localRuntime);

    const { handlers, mainWindow, spawn } = initBridge({ ensureLocalRuntime });

    expect(spawn).not.toHaveBeenCalled();
    expect(ensureLocalRuntime).not.toHaveBeenCalled();
    const result = await handlers['get-local-backend-status']();
    expect(result).toEqual(expect.objectContaining({
      ready: true,
      status: 'ready',
      sidecarDaemon: expect.objectContaining({
        provider: 'sdk',
        hasClient: true,
      }),
    }));
    expect(ensureLocalRuntime).toHaveBeenCalledTimes(1);
    expect(ensureLocalRuntime).toHaveBeenCalledWith({
      reason: 'status_bootstrap',
    });
    expect(localRuntime.subscribeEvents).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('local-backend-status', expect.objectContaining({
      ready: true,
      status: 'ready',
    }));
    expect(getAppendDiagnosticEventMock()).toHaveBeenCalledWith(expect.objectContaining({
      path: 'browser.session_control',
      stage: 'status_bootstrap',
      status: 'succeeded',
    }));
  });

  test('status bootstrap reuses the known SDK local runtime before ensuring another one', async () => {
    const activeRuntime = {
      executeTool: jest.fn(async () => ({ success: true, data: {} })),
      rpc: jest.fn(async () => ({ success: true })),
      subscribeEvents: jest.fn(() => jest.fn()),
      shutdown: jest.fn(async () => undefined),
    };
    const ensureLocalRuntime = jest.fn(async () => {
      throw new Error('ensure resolver should not be called');
    });

    const { handlers, mainWindow, spawn } = initBridge({
      getKnownLocalRuntime: () => activeRuntime,
      ensureLocalRuntime,
    });

    const result = await handlers['get-local-backend-status']();

    expect(spawn).not.toHaveBeenCalled();
    expect(ensureLocalRuntime).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      ready: true,
      status: 'ready',
      sidecarDaemon: expect.objectContaining({
        provider: 'sdk',
        hasClient: true,
        source: 'sdk-client-known',
      }),
    }));
    expect(activeRuntime.subscribeEvents).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('local-backend-status', expect.objectContaining({
      ready: true,
      status: 'ready',
    }));
  });

  test('stopLocalBackend stops bridge execution without shutting down the SDK-owned runtime', async () => {
    const { bridge, handlers, sdkRuntime } = initBridge();

    const searchPromise = handlers['search-memory'](null, { query: 'hello' });
    await Promise.resolve();
    resolveNextSdkRuntimeRequest({ success: true });
    await expect(searchPromise).resolves.toEqual({ success: true });

    bridge.stopLocalBackend();

    expect(sdkRuntime.shutdown).not.toHaveBeenCalled();
    await expect(bridge.executeToolForBackend({
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
    })).resolves.toEqual({
      success: false,
      error: 'Local backend bridge is stopped.',
    });
    await expect(handlers['get-local-backend-status']()).resolves.toEqual(
      expect.objectContaining({
        ready: false,
        status: 'stopped',
      }),
    );
  });

  test('SDK resolver errors fail closed for bridge RPC helpers', async () => {
    const ensureLocalRuntime = jest.fn(async () => {
      throw new Error('daemon unavailable');
    });
    const { handlers, spawn } = initBridge({ ensureLocalRuntime });

    expect(spawn).not.toHaveBeenCalled();
    await expect(handlers['search-memory'](null, { query: 'hello' })).resolves.toEqual({
      success: false,
      error: 'daemon unavailable',
    });
  });

  test('status bootstrap reports SDK resolver failures without leaving the browser control spinning', async () => {
    const ensureLocalRuntime = jest.fn(async () => {
      throw new Error('daemon unavailable');
    });
    const { handlers, mainWindow, spawn } = initBridge({ ensureLocalRuntime });

    expect(spawn).not.toHaveBeenCalled();
    await expect(handlers['get-local-backend-status']()).resolves.toEqual(expect.objectContaining({
      ready: false,
      status: 'error',
      error: 'daemon unavailable',
    }));
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('local-backend-status', expect.objectContaining({
      ready: false,
      status: 'error',
      error: 'daemon unavailable',
    }));
    expect(getAppendDiagnosticEventMock()).toHaveBeenCalledWith(expect.objectContaining({
      path: 'browser.session_control',
      stage: 'status_bootstrap',
      status: 'failed',
    }));
  });
});
