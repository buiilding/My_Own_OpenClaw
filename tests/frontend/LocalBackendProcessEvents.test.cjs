/** @jest-environment node */

const {
  createLocalBackendProcessEvents,
  formatLocalBackendProcessError,
} = require('../../frontend/src/main/sidecar/local_backend_process_events.cjs');

function createProcessRef() {
  const handlers = {};
  return {
    handlers,
    on: jest.fn((event, handler) => {
      handlers[event] = handler;
    }),
  };
}

describe('local backend process events', () => {
  test('non-zero exit resets backend as error and reports unavailable status', () => {
    const processRef = createProcessRef();
    const mainWindow = {};
    const resetBackendProcessState = jest.fn();
    const notifyBackendUnavailable = jest.fn();
    const lifecycle = createLocalBackendProcessEvents({
      isActiveProcessReference: () => true,
      resetBackendProcessState,
      notifyBackendUnavailable,
      logger: { log: jest.fn(), error: jest.fn() },
    });

    lifecycle.handleExit({
      processRef,
      mainWindow,
      code: 2,
      signal: null,
    });

    expect(resetBackendProcessState).toHaveBeenCalledWith({
      reason: 'Local backend process exited',
      status: 'error',
    });
    expect(notifyBackendUnavailable).toHaveBeenCalledWith(
      mainWindow,
      'Python process exited with code 2',
    );
  });

  test('clean exit resets backend as stopped without unavailable status', () => {
    const resetBackendProcessState = jest.fn();
    const notifyBackendUnavailable = jest.fn();
    const lifecycle = createLocalBackendProcessEvents({
      isActiveProcessReference: () => true,
      resetBackendProcessState,
      notifyBackendUnavailable,
      logger: { log: jest.fn(), error: jest.fn() },
    });

    lifecycle.handleExit({
      processRef: {},
      mainWindow: {},
      code: 0,
      signal: null,
    });

    expect(resetBackendProcessState).toHaveBeenCalledWith({
      reason: 'Local backend process exited',
      status: 'stopped',
    });
    expect(notifyBackendUnavailable).not.toHaveBeenCalled();
  });

  test('stale process events are ignored', () => {
    const resetBackendProcessState = jest.fn();
    const notifyBackendUnavailable = jest.fn();
    const lifecycle = createLocalBackendProcessEvents({
      isActiveProcessReference: () => false,
      resetBackendProcessState,
      notifyBackendUnavailable,
      logger: { log: jest.fn(), error: jest.fn() },
    });

    lifecycle.handleExit({
      processRef: {},
      mainWindow: {},
      code: 1,
      signal: null,
    });
    lifecycle.handleError({
      processRef: {},
      mainWindow: {},
      launchTarget: { kind: 'python', command: 'python' },
      error: new Error('spawn fail'),
    });

    expect(resetBackendProcessState).not.toHaveBeenCalled();
    expect(notifyBackendUnavailable).not.toHaveBeenCalled();
  });

  test('process error resets backend and reports formatted spawn error', () => {
    const mainWindow = {};
    const resetBackendProcessState = jest.fn();
    const notifyBackendUnavailable = jest.fn();
    const lifecycle = createLocalBackendProcessEvents({
      isActiveProcessReference: () => true,
      resetBackendProcessState,
      notifyBackendUnavailable,
      logger: { log: jest.fn(), error: jest.fn() },
    });
    const error = new Error('missing command');
    error.code = 'ENOENT';

    lifecycle.handleError({
      processRef: {},
      mainWindow,
      launchTarget: { kind: 'python', command: 'python3' },
      error,
    });

    expect(resetBackendProcessState).toHaveBeenCalledWith({
      reason: 'Local backend process error',
      status: 'error',
    });
    expect(notifyBackendUnavailable).toHaveBeenCalledWith(
      mainWindow,
      "Python executable 'python3' not found. Please install Python 3 or ensure it is in your PATH.",
    );
  });

  test('attach registers exit and error handlers with stable process reference', () => {
    const processRef = createProcessRef();
    const resetBackendProcessState = jest.fn();
    const notifyBackendUnavailable = jest.fn();
    const lifecycle = createLocalBackendProcessEvents({
      isActiveProcessReference: (candidate) => candidate === processRef,
      resetBackendProcessState,
      notifyBackendUnavailable,
      logger: { log: jest.fn(), error: jest.fn() },
    });

    lifecycle.attach({
      processRef,
      mainWindow: {},
      launchTarget: { kind: 'python', command: 'python3' },
    });

    processRef.handlers.exit(1, null);

    expect(processRef.on).toHaveBeenCalledWith('exit', expect.any(Function));
    expect(processRef.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(resetBackendProcessState).toHaveBeenCalledWith({
      reason: 'Local backend process exited',
      status: 'error',
    });
  });

  test('binary ENOENT errors use bundled sidecar message', () => {
    const error = new Error('missing binary');
    error.code = 'ENOENT';

    expect(formatLocalBackendProcessError(error, {
      kind: 'binary',
      command: '/app/local_backend.exe',
    })).toBe(
      "Bundled sidecar executable '/app/local_backend.exe' not found. Reinstall WindieOS.",
    );
  });
});
