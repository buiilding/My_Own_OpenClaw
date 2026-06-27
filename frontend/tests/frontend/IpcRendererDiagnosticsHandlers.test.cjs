/**
 * Covers renderer diagnostics IPC handler registration behavior.
 */

const fs = require('fs/promises');
const path = require('path');

const {
  createRendererDiagnosticsHandlersRuntime,
} = require('../../src/main/ipc/ipc_renderer_diagnostics_handlers.cjs');

function createHarness() {
  const listeners = {};
  const ipcMain = {
    on: jest.fn((channel, listener) => {
      listeners[channel] = listener;
    }),
  };
  const handleRendererLog = jest.fn();
  const handleRendererLiveSurfaceTrace = jest.fn();

  const runtime = createRendererDiagnosticsHandlersRuntime({
    handleRendererLog,
    handleRendererLiveSurfaceTrace,
  });
  runtime.register({ ipcMain });

  return {
    handleRendererLiveSurfaceTrace,
    handleRendererLog,
    ipcMain,
    listeners,
  };
}

describe('renderer diagnostics IPC handlers', () => {
  test('registers renderer log and live-surface trace listeners', () => {
    const { listeners } = createHarness();

    expect(typeof listeners['renderer-log']).toBe('function');
    expect(typeof listeners['live-surface-trace']).toBe('function');
  });

  test('forwards renderer log payloads to the diagnostics runtime', () => {
    const { handleRendererLog, listeners } = createHarness();
    const payload = {
      source: 'renderer-interaction',
      entry: { action: 'click' },
    };

    listeners['renderer-log'](null, payload);

    expect(handleRendererLog).toHaveBeenCalledWith(payload);
  });

  test('forwards live-surface trace payloads to the trace runtime', () => {
    const { handleRendererLiveSurfaceTrace, listeners } = createHarness();
    const payload = {
      event: 'typing.show',
      payload: { surface: 'chatbox' },
    };

    listeners['live-surface-trace'](null, payload);

    expect(handleRendererLiveSurfaceTrace).toHaveBeenCalledWith(payload);
  });

  test('runtime registers renderer diagnostic handlers with injected callbacks', () => {
    const listeners = {};
    const ipcMain = {
      on: jest.fn((channel, listener) => {
        listeners[channel] = listener;
      }),
    };
    const handleRendererLog = jest.fn();
    const handleRendererLiveSurfaceTrace = jest.fn();
    const runtime = createRendererDiagnosticsHandlersRuntime({
      handleRendererLog,
      handleRendererLiveSurfaceTrace,
    });

    runtime.register({ ipcMain });
    listeners['renderer-log'](null, { message: 'renderer event' });
    listeners['live-surface-trace'](null, { event: 'surface.event' });

    expect(handleRendererLog).toHaveBeenCalledWith({ message: 'renderer event' });
    expect(handleRendererLiveSurfaceTrace).toHaveBeenCalledWith({ event: 'surface.event' });
  });

  test('ipc.cjs delegates renderer diagnostics channel bodies to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_renderer_diagnostics_handlers.cjs'),
      'utf8',
    );
    const initializationSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_initialization_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createRendererDiagnosticsHandlersRuntime({');
    expect(mainSource).not.toContain('rendererDiagnosticsHandlersRuntime.register({ ipcMain })');
    expect(initializationSource).toContain('rendererDiagnosticsHandlersRuntime.register({ ipcMain })');
    expect(mainSource).not.toContain('registerRendererDiagnosticsHandlers({');
    expect(mainSource).not.toContain("ipcMain.on('renderer-log'");
    expect(mainSource).not.toContain("ipcMain.on('live-surface-trace'");
    expect(helperSource).toContain('function createRendererDiagnosticsHandlersRuntime');
    expect(helperSource).toContain('return registerRendererDiagnosticsHandlers({');
    const rendererDiagnosticsModule = require('../../src/main/ipc/ipc_renderer_diagnostics_handlers.cjs');
    expect(rendererDiagnosticsModule.registerRendererDiagnosticsHandlers).toBeUndefined();
    expect(helperSource).toContain("ipcMain.on('renderer-log'");
    expect(helperSource).toContain("ipcMain.on('live-surface-trace'");
  });
});
