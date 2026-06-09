/** @jest-environment node */

const {
  createMockPythonProcess,
  initBridge,
  initBridgeWithProcesses,
  markProcessReady,
  markReady,
  registerBridgeSuiteLifecycleHooks,
} = require('./__mocks__/localBackendBridgeHarness.cjs');

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function samePath(actual, expected) {
  return toPosixPath(actual) === expected;
}

describe('local_backend_bridge process lifecycle', () => {
  registerBridgeSuiteLifecycleHooks();

  test('packaged mode reports missing bundled python runtime without spawning sidecar', () => {
    const originalResourcesPath = process.resourcesPath;
    process.resourcesPath = '/opt/WindieOS/resources';

    try {
      const { mainWindow, spawn } = initBridge({
        isPackaged: true,
        mockExistsSync: (candidate) => (
          samePath(candidate, '/opt/WindieOS/resources/python-runtime/sidecar/local_backend.pyc')
        ),
      });

      if (spawn.mock.calls.length !== 0) {
        throw new Error(`Expected no sidecar spawn, got ${spawn.mock.calls.length} call(s).`);
      }
      expect(mainWindow.webContents.send).toHaveBeenCalledWith('local-backend-status', {
        ready: false,
        error: 'Bundled Python runtime not found in app resources. Please reinstall WindieOS.',
      });
    } finally {
      process.resourcesPath = originalResourcesPath;
    }
  });

  test('packaged mode disables browser feature-pack autoinstall in sidecar env without bundled browser path overrides', () => {
    const originalResourcesPath = process.resourcesPath;
    process.resourcesPath = '/opt/WindieOS/resources';

    try {
      const runtimePython = process.platform === 'win32'
        ? '/opt/WindieOS/resources/python-runtime/python.exe'
        : '/opt/WindieOS/resources/python-runtime/bin/python3';
      const expectedEnv = {
        WINDIE_PACKAGED_APP: '1',
        WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL: '0',
        PYTHONDONTWRITEBYTECODE: '1',
      };
      if (process.platform !== 'win32') {
        expectedEnv.PYTHONHOME = '/opt/WindieOS/resources/python-runtime';
        expectedEnv.PYTHONNOUSERSITE = '1';
      }

      const { spawn } = initBridge({
        isPackaged: true,
        mockExistsSync: (candidate) => (
          samePath(candidate, '/opt/WindieOS/resources/python-runtime/sidecar/local_backend.pyc')
          || samePath(candidate, runtimePython)
        ),
      });

      const spawnOptions = spawn.mock.calls[0][2];
      expect(spawnOptions.env).toEqual(expect.objectContaining(expectedEnv));
      expect(spawnOptions.env.PLAYWRIGHT_BROWSERS_PATH).toBeUndefined();
      expect(spawnOptions.env.PYTHONPATH).toBeUndefined();
    } finally {
      process.resourcesPath = originalResourcesPath;
    }
  });

  test('daemon mode does not spawn standalone local backend process', async () => {
    const sidecarDaemonManager = {
      ensureDaemon: jest.fn(async () => ({ status: 'ok' })),
      executeTool: jest.fn(),
      getSnapshot: jest.fn(() => ({ hasClient: true, pid: 123 })),
      rpc: jest.fn(async ({ id }) => ({
        jsonrpc: '2.0',
        id,
        result: { status: 'ok' },
      })),
    };

    const { mainWindow, spawn } = initBridge({ sidecarDaemonManager });

    expect(spawn).not.toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    expect(sidecarDaemonManager.ensureDaemon).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('local-backend-status', {
      ready: true,
    });
  });

  test('exposes daemon-backed runtime for SDK startup without owning shutdown', async () => {
    const unsubscribe = jest.fn();
    const daemonClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      listTools: jest.fn(async () => ({ tools: [] })),
      registerModuleTool: jest.fn(async () => ({ success: true })),
      registerPlugin: jest.fn(async () => ({ success: true })),
      registerMcp: jest.fn(async () => ({ success: true })),
      executeTool: jest.fn(async () => ({ success: true, data: {} })),
      rpc: jest.fn(async () => ({ jsonrpc: '2.0', id: 'rpc-1', result: {} })),
    };
    const sidecarDaemonManager = {
      ensureDaemon: jest.fn(async () => daemonClient),
      executeTool: jest.fn(),
      getSnapshot: jest.fn(() => ({ hasClient: true, pid: 123 })),
      rpc: jest.fn(async ({ id }) => ({
        jsonrpc: '2.0',
        id,
        result: { status: 'ok' },
      })),
      subscribeEvents: jest.fn(() => unsubscribe),
    };

    const { bridge } = initBridge({ sidecarDaemonManager });
    await Promise.resolve();
    await Promise.resolve();
    sidecarDaemonManager.ensureDaemon.mockClear();
    sidecarDaemonManager.subscribeEvents.mockClear();

    const runtime = await bridge.ensureDaemonBackedLocalRuntime();

    expect(sidecarDaemonManager.ensureDaemon).toHaveBeenCalledWith(expect.objectContaining({
      isPackaged: false,
    }));
    await expect(runtime.status()).resolves.toEqual({ status: 'ok' });
    await expect(runtime.listTools()).resolves.toEqual({ tools: [] });
    await runtime.registerModuleTool({ name: 'tool' }, { workspacePath: '/tmp/workspace' });
    await runtime.registerPlugin({ path: '/tmp/plugin' });
    await runtime.registerMcp({ id: 'mcp' });
    await runtime.executeTool({ toolName: 'read_file', args: {} });
    await runtime.rpc({ method: 'get_status' });
    expect(runtime.subscribeEvents(jest.fn())).toBe(unsubscribe);
    expect(runtime.shutdown).toBeUndefined();
    expect(daemonClient.registerModuleTool).toHaveBeenCalledWith(
      { name: 'tool' },
      { workspacePath: '/tmp/workspace' },
    );
    expect(daemonClient.executeTool).toHaveBeenCalledWith({ toolName: 'read_file', args: {} });
    expect(daemonClient.rpc).toHaveBeenCalledWith({ method: 'get_status' });
  });

  test('rejects SDK local-runtime provider before daemon manager initialization', async () => {
    const { bridge } = initBridge();

    await expect(bridge.ensureDaemonBackedLocalRuntime()).rejects.toThrow(
      'Windie sidecar daemon manager is not initialized.',
    );
  });

  test('internal tool execution rejects in-flight request when sidecar exits', async () => {
    const { bridge, processHandlers } = initBridge();
    markReady();

    const promise = bridge.executeToolForBackend({
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
    });

    processHandlers.exit?.(1, null);

    await expect(promise).resolves.toEqual({
      success: false,
      error: 'Local backend process exited',
    });
  });

  test('sidecar non-zero exit reports unavailable status', () => {
    const { mainWindow, processHandlers } = initBridge();
    markReady();

    processHandlers.exit?.(2, null);

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('local-backend-status', {
      ready: false,
      error: 'Python process exited with code 2',
    });
  });

  test('internal tool execution rejects in-flight request when sidecar emits process error', async () => {
    const { mainWindow, bridge, processHandlers } = initBridge();
    markReady();

    const promise = bridge.executeToolForBackend({
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
    });

    processHandlers.error?.(new Error('spawn fail'));

    await expect(promise).resolves.toEqual({
      success: false,
      error: 'Local backend process error',
    });
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('local-backend-status', {
      ready: false,
      error: 'spawn fail',
    });
  });

  test('stale readiness timeout from previous process does not cancel new readiness callback', () => {
    jest.useFakeTimers();

    const firstProcess = createMockPythonProcess();
    const secondProcess = createMockPythonProcess();
    const { bridge, mainWindow } = initBridgeWithProcesses([firstProcess, secondProcess]);

    // Move time forward before restarting so first timeout fires earlier than second.
    jest.advanceTimersByTime(50);

    firstProcess._handlers.exit?.(0, null);
    bridge.initializeLocalBackendBridge(mainWindow);

    // Fire only the first process timeout at t=500ms.
    jest.advanceTimersByTime(450);

    markProcessReady(secondProcess);

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('local-backend-status', {
      ready: true,
    });
    jest.useRealTimers();
  });

  test('stale readiness retry timer from previous process does not override new readiness request', () => {
    jest.useFakeTimers();

    const firstProcess = createMockPythonProcess();
    const secondProcess = createMockPythonProcess();
    const { bridge, mainWindow } = initBridgeWithProcesses([firstProcess, secondProcess]);

    // Let first readiness timeout fire so it schedules retry attempt 2.
    jest.advanceTimersByTime(500);

    // Restart before that retry fires; stale retry must not affect new process.
    firstProcess._handlers.exit?.(0, null);
    bridge.initializeLocalBackendBridge(mainWindow);

    // Run stale retry timer from first process generation.
    jest.advanceTimersByTime(50);

    markProcessReady(secondProcess);

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('local-backend-status', {
      ready: true,
    });

    const pingRequestIds = secondProcess.stdin.write.mock.calls.map(([payload]) => (
      JSON.parse(payload.trim()).id
    ));
    expect(pingRequestIds).toEqual(['__readiness_check_1__']);
    jest.useRealTimers();
  });

  test('readiness timeout leaves local backend unavailable after max attempts', async () => {
    jest.useFakeTimers();

    const { bridge, handlers, mainWindow } = initBridge();

    jest.runAllTimers();
    await Promise.resolve();

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'local-backend-status',
      {
        ready: false,
        status: 'error',
        error: 'Local backend readiness check timed out after max attempts',
      },
    );
    await expect(handlers['get-local-backend-status']()).resolves.toEqual(
      expect.objectContaining({
        ready: false,
        status: 'error',
        error: 'Local backend readiness check timed out after max attempts',
      }),
    );
    await expect(bridge.executeToolForBackend({
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
    })).resolves.toEqual({
      success: false,
      error: 'Local backend not ready',
    });
    jest.useRealTimers();
  });

  test('failed readiness ping responses leave local backend unavailable after max attempts', async () => {
    jest.useFakeTimers();

    const { handlers, mainWindow, pythonProcess, stdoutHandler } = initBridge();

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const calls = pythonProcess.stdin.write.mock.calls;
      const request = JSON.parse(calls[calls.length - 1][0].trim());
      stdoutHandler()(Buffer.from(`${JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: { status: 'starting' },
      })}\n`));
      if (attempt < 10) {
        jest.runOnlyPendingTimers();
      }
    }

    await Promise.resolve();

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'local-backend-status',
      {
        ready: false,
        status: 'error',
        error: 'Local backend readiness check failed after max attempts',
      },
    );
    await expect(handlers['get-local-backend-status']()).resolves.toEqual(
      expect.objectContaining({
        ready: false,
        status: 'error',
        error: 'Local backend readiness check failed after max attempts',
      }),
    );
    jest.useRealTimers();
  });

  test('stopLocalBackend force-kill timer does not kill restarted process', () => {
    jest.useFakeTimers();

    const firstProcess = createMockPythonProcess();
    const secondProcess = createMockPythonProcess();
    const { bridge, mainWindow } = initBridgeWithProcesses([firstProcess, secondProcess]);

    bridge.stopLocalBackend();
    expect(firstProcess.kill).toHaveBeenCalledWith('SIGTERM');

    firstProcess._handlers.exit?.(0, null);
    bridge.initializeLocalBackendBridge(mainWindow);

    jest.advanceTimersByTime(5000);

    expect(firstProcess.kill).not.toHaveBeenCalledWith('SIGKILL');
    expect(secondProcess.kill).not.toHaveBeenCalledWith('SIGKILL');
    jest.useRealTimers();
  });

  test('stale process error event from previous sidecar instance is ignored after restart', () => {
    const firstProcess = createMockPythonProcess();
    const secondProcess = createMockPythonProcess();
    const { bridge, mainWindow } = initBridgeWithProcesses([firstProcess, secondProcess]);

    firstProcess._handlers.exit?.(0, null);
    bridge.initializeLocalBackendBridge(mainWindow);
    markProcessReady(secondProcess);
    mainWindow.webContents.send.mockClear();

    firstProcess._handlers.error?.(new Error('stale-process-error'));

    const statusCalls = mainWindow.webContents.send.mock.calls
      .filter(([channel]) => channel === 'local-backend-status');
    expect(statusCalls).toEqual([]);
  });
});
