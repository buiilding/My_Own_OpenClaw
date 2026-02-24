/** @jest-environment node */

const {
  createMockPythonProcess,
  initBridge,
  initBridgeWithProcesses,
  markProcessReady,
  markReady,
  registerBridgeSuiteLifecycleHooks,
} = require('./__mocks__/localBackendBridgeHarness.cjs');

describe('local_backend_bridge process lifecycle', () => {
  registerBridgeSuiteLifecycleHooks();

  test('execute-tool rejects in-flight request when sidecar exits', async () => {
    const { handlers, processHandlers } = initBridge();
    markReady();

    const promise = handlers['execute-tool'](null, {
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

  test('execute-tool rejects in-flight request when sidecar emits process error', async () => {
    const { mainWindow, handlers, processHandlers } = initBridge();
    markReady();

    const promise = handlers['execute-tool'](null, {
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
});
