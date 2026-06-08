/** @jest-environment node */

const {
  createLocalBackendReadinessRuntime,
  getReadinessRetryDelay,
} = require('../../frontend/src/main/sidecar/local_backend_readiness_runtime.cjs');

describe('local_backend_readiness_runtime', () => {
  function createRuntimeHarness() {
    const processRef = {
      stdin: {
        write: jest.fn(),
      },
    };
    const supervisor = {
      getSnapshot: jest.fn(() => ({ generation: 7 })),
      markError: jest.fn(),
      markReady: jest.fn(),
    };
    const sendStatus = jest.fn();
    const logger = {
      error: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
    };
    const setTimeoutFn = jest.fn();
    const runtime = createLocalBackendReadinessRuntime({
      getProcess: () => processRef,
      supervisor,
      sendStatus,
      logger,
      isTestEnv: true,
      setTimeoutFn,
    });
    const mainWindow = { id: 'main' };
    return {
      logger,
      mainWindow,
      processRef,
      runtime,
      sendStatus,
      setTimeoutFn,
      supervisor,
    };
  }

  test('writes ping and marks backend ready from matching response', () => {
    const {
      mainWindow,
      processRef,
      runtime,
      sendStatus,
      supervisor,
    } = createRuntimeHarness();

    runtime.check(mainWindow);
    const request = JSON.parse(processRef.stdin.write.mock.calls[0][0].trim());

    runtime.getCallback()({
      id: request.id,
      result: { status: 'ok' },
    });

    expect(request).toEqual({
      jsonrpc: '2.0',
      id: '__readiness_check_1__',
      method: 'ping',
      params: {},
    });
    expect(supervisor.markReady).toHaveBeenCalledTimes(1);
    expect(sendStatus).toHaveBeenCalledWith(mainWindow, { ready: true });
    expect(runtime.getCallback()).toBeNull();
  });

  test('stale callback is ignored after generation reset', () => {
    const {
      mainWindow,
      processRef,
      runtime,
      sendStatus,
      supervisor,
    } = createRuntimeHarness();

    runtime.check(mainWindow);
    const request = JSON.parse(processRef.stdin.write.mock.calls[0][0].trim());
    const staleCallback = runtime.getCallback();
    runtime.resetToGeneration(99);

    staleCallback({
      id: request.id,
      result: { status: 'ok' },
    });

    expect(supervisor.markReady).not.toHaveBeenCalled();
    expect(sendStatus).not.toHaveBeenCalled();
  });

  test('marks failed when max readiness attempts return non-ready results', () => {
    const {
      mainWindow,
      processRef,
      runtime,
      sendStatus,
      supervisor,
    } = createRuntimeHarness();

    runtime.check(mainWindow, 10, 10);
    const request = JSON.parse(processRef.stdin.write.mock.calls[0][0].trim());

    runtime.getCallback()({
      id: request.id,
      result: { status: 'starting' },
    });

    expect(supervisor.markError).toHaveBeenCalledWith(
      'Local backend readiness check failed after max attempts',
    );
    expect(sendStatus).toHaveBeenCalledWith(mainWindow, {
      ready: false,
      status: 'error',
      error: 'Local backend readiness check failed after max attempts',
    });
  });

  test('uses bounded exponential retry delays', () => {
    expect(getReadinessRetryDelay(1)).toBe(50);
    expect(getReadinessRetryDelay(2)).toBe(100);
    expect(getReadinessRetryDelay(10)).toBe(1000);
  });
});
