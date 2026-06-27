/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createIpcAppDiagnosticsRuntime,
} = require('../../src/main/ipc/ipc_app_diagnostics_runtime.cjs');

describe('ipc_app_diagnostics_runtime', () => {
  test('forwards app diagnostics to the injected append function', () => {
    const event = {
      path: 'conversation.metadata.list',
      stage: 'ipc_received',
    };
    const appendDiagnosticEvent = jest.fn(input => ({ stored: true, input }));
    const runtime = createIpcAppDiagnosticsRuntime({
      appendDiagnosticEvent,
    });

    expect(runtime.appendAppDiagnostic(event)).toEqual({
      stored: true,
      input: event,
    });
    expect(appendDiagnosticEvent).toHaveBeenCalledWith(event);
  });

  test('logs append failures with the event path and returns a stable failure result', () => {
    const log = jest.fn();
    const runtime = createIpcAppDiagnosticsRuntime({
      appendDiagnosticEvent: jest.fn(() => {
        throw new Error('disk is full');
      }),
      defaultDiagnosticsPath: 'fallback.path',
      log,
    });

    expect(runtime.appendAppDiagnostic({
      path: 'custom.path',
    })).toEqual({
      stored: false,
      reason: 'disk is full',
    });
    expect(log).toHaveBeenCalledWith(
      '[AppDiagnostics] failed to persist custom.path: disk is full',
    );
  });

  test('uses the default diagnostics path when failure input has no path', () => {
    const log = jest.fn();
    const runtime = createIpcAppDiagnosticsRuntime({
      appendDiagnosticEvent: jest.fn(() => {
        throw 'boom';
      }),
      defaultDiagnosticsPath: 'fallback.path',
      log,
    });

    expect(runtime.appendAppDiagnostic({})).toEqual({
      stored: false,
      reason: 'boom',
    });
    expect(log).toHaveBeenCalledWith(
      '[AppDiagnostics] failed to persist fallback.path: boom',
    );
  });

  test('ipc.cjs delegates app diagnostic append failure handling to the helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_app_diagnostics_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createIpcAppDiagnosticsRuntime({');
    expect(mainSource).toContain('ipcAppDiagnosticsRuntime.appendAppDiagnostic(input)');
    expect(mainSource).not.toContain('[AppDiagnostics] failed to persist');
    expect(mainSource).not.toContain('APP_DIAGNOSTICS_PATH');
    expect(helperSource).toContain('[AppDiagnostics] failed to persist');
    expect(helperSource).toContain('APP_DIAGNOSTICS_PATH');
  });
});
