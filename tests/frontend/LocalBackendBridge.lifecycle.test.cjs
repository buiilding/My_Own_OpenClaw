/** @jest-environment node */

const {
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
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('local-backend-status', {
      ready: false,
      error: 'Sidecar daemon launch is unavailable.',
    });
    await expect(handlers['search-memory'](null, { query: 'hello' })).resolves.toEqual({
      success: false,
      error: 'Windie SDK local runtime provider is not initialized.',
    });
  });

  test('SDK local runtime provider is resolved lazily and marks local backend ready', async () => {
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
    const result = await handlers['search-memory'](null, {
      query: 'hello',
    });
    expect(result).toEqual({ success: true });
    expect(localRuntimeProvider).toHaveBeenCalledTimes(1);
    expect(localRuntimeProvider).toHaveBeenCalledWith({
      wakeUp: {},
      needsLocalRuntime: true,
    });
    expect(localRuntime.subscribeEvents).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('local-backend-status', {
      ready: true,
    });
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
});
