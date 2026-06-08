/** @jest-environment node */

const {
  createLocalBackendStopController,
  createStoppedToolExecutor,
} = require('../../frontend/src/main/sidecar/local_backend_stop_controller.cjs');

function createProcessRef() {
  return {
    kill: jest.fn(),
  };
}

describe('local backend stop controller', () => {
  test('stopped tool executor rejects backend tool execution', async () => {
    await expect(createStoppedToolExecutor()()).resolves.toEqual({
      success: false,
      error: 'Local backend bridge is stopped.',
    });
  });

  test('daemon shutdown clears daemon runtime and resets backend state', () => {
    const daemonManager = {
      shutdown: jest.fn(async () => undefined),
    };
    const clearDaemonRuntime = jest.fn();
    const resetBackendProcessState = jest.fn();
    const setRuntimeExecuteTool = jest.fn();
    const controller = createLocalBackendStopController({
      clearDaemonRuntime,
      getDaemonManager: () => daemonManager,
      getProcess: () => null,
      resetBackendProcessState,
      setRuntimeExecuteTool,
      supervisor: { beginStop: jest.fn() },
      logger: { log: jest.fn() },
      setTimeoutFn: jest.fn(),
    });

    controller.stop();

    expect(setRuntimeExecuteTool).toHaveBeenCalledWith(expect.any(Function));
    expect(daemonManager.shutdown).toHaveBeenCalledTimes(1);
    expect(clearDaemonRuntime).toHaveBeenCalledTimes(1);
    expect(resetBackendProcessState).toHaveBeenCalledWith({
      reason: 'Sidecar daemon stopped',
      status: 'stopped',
    });
  });

  test('standalone process stop sends SIGTERM and schedules stale-guarded force kill', () => {
    jest.useFakeTimers();
    const processRef = createProcessRef();
    let currentProcess = processRef;
    const supervisor = { beginStop: jest.fn() };
    const controller = createLocalBackendStopController({
      getDaemonManager: () => null,
      getProcess: () => currentProcess,
      setRuntimeExecuteTool: jest.fn(),
      supervisor,
      logger: { log: jest.fn() },
    });

    controller.stop();

    expect(supervisor.beginStop).toHaveBeenCalledTimes(1);
    expect(processRef.kill).toHaveBeenCalledWith('SIGTERM');

    currentProcess = null;
    jest.advanceTimersByTime(5000);

    expect(processRef.kill).not.toHaveBeenCalledWith('SIGKILL');
    jest.useRealTimers();
  });

  test('standalone process stop force kills still-active process after timeout', () => {
    jest.useFakeTimers();
    const processRef = createProcessRef();
    const controller = createLocalBackendStopController({
      getDaemonManager: () => null,
      getProcess: () => processRef,
      setRuntimeExecuteTool: jest.fn(),
      supervisor: { beginStop: jest.fn() },
      logger: { log: jest.fn() },
    });

    controller.stop();
    jest.advanceTimersByTime(5000);

    expect(processRef.kill).toHaveBeenCalledWith('SIGTERM');
    expect(processRef.kill).toHaveBeenCalledWith('SIGKILL');
    jest.useRealTimers();
  });
});
