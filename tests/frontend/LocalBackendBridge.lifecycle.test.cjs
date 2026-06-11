/** @jest-environment node */

const {
  getAppendDiagnosticEventMock,
  initBridge,
  registerBridgeSuiteLifecycleHooks,
  resolveNextSdkRuntimeRequest,
} = require('./__mocks__/localBackendBridgeHarness.cjs');

describe('local_backend_bridge SDK sidecar lifecycle', () => {
  registerBridgeSuiteLifecycleHooks();

  test('unavailable SDK sidecar launch plan reports failure without spawning a standalone sidecar', async () => {
    const { handlers, mainWindow, spawn } = initBridge({
      localRuntimeProvider: null,
      autoSidecarLaunchPlan: {
        ok: false,
        error: 'Sidecar daemon launch is unavailable.',
      },
    });

    expect(spawn).not.toHaveBeenCalled();
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('local-backend-status', expect.objectContaining({
      ready: false,
      status: 'error',
      error: 'Sidecar daemon launch is unavailable.',
    }));
    await expect(handlers['search-memory'](null, { query: 'hello' })).resolves.toEqual({
      success: false,
      error: 'Windie SDK local runtime provider is not initialized.',
    });
  });

  test('status bootstrap wakes the lazy SDK local runtime and marks local backend ready', async () => {
    const localRuntime = {
      executeTool: jest.fn(async () => ({ success: true, data: {} })),
      rpc: jest.fn(async () => ({ success: true })),
      subscribeEvents: jest.fn(() => jest.fn()),
      shutdown: jest.fn(async () => undefined),
    };
    const localRuntimeProvider = jest.fn(async () => localRuntime);

    const { handlers, mainWindow, spawn } = initBridge({ localRuntimeProvider });

    expect(spawn).not.toHaveBeenCalled();
    expect(localRuntimeProvider).not.toHaveBeenCalled();
    const result = await handlers['get-local-backend-status']();
    expect(result).toEqual(expect.objectContaining({
      ready: true,
      status: 'ready',
      sidecarDaemon: expect.objectContaining({
        provider: 'sdk',
        hasClient: true,
      }),
    }));
    expect(localRuntimeProvider).toHaveBeenCalledTimes(1);
    expect(localRuntimeProvider).toHaveBeenCalledWith({
      wakeUp: {},
      needsLocalRuntime: true,
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

  test('stopLocalBackend shuts down SDK runtime and rejects later backend tool execution', async () => {
    const { bridge, handlers, sdkRuntime } = initBridge();

    const searchPromise = handlers['search-memory'](null, { query: 'hello' });
    await Promise.resolve();
    resolveNextSdkRuntimeRequest({ success: true });
    await expect(searchPromise).resolves.toEqual({ success: true });

    bridge.stopLocalBackend();

    expect(sdkRuntime.shutdown).toHaveBeenCalledTimes(1);
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

  test('SDK provider errors fail closed for bridge RPC helpers', async () => {
    const localRuntimeProvider = jest.fn(async () => {
      throw new Error('daemon unavailable');
    });
    const { handlers, spawn } = initBridge({ localRuntimeProvider });

    expect(spawn).not.toHaveBeenCalled();
    await expect(handlers['search-memory'](null, { query: 'hello' })).resolves.toEqual({
      success: false,
      error: 'daemon unavailable',
    });
  });

  test('status bootstrap reports SDK provider failures without leaving the browser control spinning', async () => {
    const localRuntimeProvider = jest.fn(async () => {
      throw new Error('daemon unavailable');
    });
    const { handlers, mainWindow, spawn } = initBridge({ localRuntimeProvider });

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
