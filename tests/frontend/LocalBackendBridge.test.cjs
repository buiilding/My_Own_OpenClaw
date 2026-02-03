/** @jest-environment node */

const path = require('path');

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'req-1'),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
}));

describe('local_backend_bridge', () => {
  let spawn;
  let ipcMain;
  let uuid;
  let handlers;
  let stdoutHandler;
  let processHandlers;
  let pythonProcess;
  let bridge;

  const initBridge = () => {
    jest.resetModules();
    handlers = {};
    stdoutHandler = null;
    processHandlers = {};

    spawn = require('child_process').spawn;
    ipcMain = require('electron').ipcMain;
    uuid = require('uuid');

    pythonProcess = {
      stdin: { write: jest.fn() },
      stdout: {
        on: jest.fn((event, handler) => {
          if (event === 'data') {
            stdoutHandler = handler;
          }
        }),
      },
      stderr: { on: jest.fn() },
      on: jest.fn((event, handler) => {
        processHandlers[event] = handler;
      }),
      kill: jest.fn(),
    };

    spawn.mockReturnValue(pythonProcess);
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    bridge = require(path.join(
      __dirname,
      '../../frontend/src/main/local_backend_bridge.cjs',
    ));

    const mainWindow = {
      webContents: {
        send: jest.fn(),
      },
    };

    bridge.initializeLocalBackendBridge(mainWindow);

    return { mainWindow };
  };

  const markReady = () => {
    stdoutHandler(
      Buffer.from(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: '__readiness_check_1__',
          result: { status: 'ok' },
        })}\n`,
      ),
    );
  };

  test('execute-tool handler returns success for valid response', async () => {
    initBridge();
    markReady();

    const response = {
      jsonrpc: '2.0',
      id: 'req-1',
      result: { success: true, data: { value: 1 } },
    };

    const promise = handlers['execute-tool'](null, {
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
    });

    stdoutHandler(Buffer.from(`${JSON.stringify(response)}\n`));

    const result = await promise;
    expect(result).toEqual({ success: true, data: { value: 1 } });
  });

  test('execute-tool handler returns error on json-rpc error', async () => {
    initBridge();
    markReady();

    const response = {
      jsonrpc: '2.0',
      id: 'req-1',
      error: { message: 'bad' },
    };

    const promise = handlers['execute-tool'](null, {
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
    });

    stdoutHandler(Buffer.from(`${JSON.stringify(response)}\n`));

    const result = await promise;
    expect(result).toEqual({ success: false, error: 'bad' });
  });

  test('get-system-state handler returns null on error response', async () => {
    initBridge();
    markReady();

    const response = {
      jsonrpc: '2.0',
      id: 'req-1',
      result: { success: false, error: 'fail' },
    };

    const promise = handlers['get-system-state'](null, { fields: ['active_window'] });
    stdoutHandler(Buffer.from(`${JSON.stringify(response)}\n`));

    const result = await promise;
    expect(result).toBeNull();
  });

  test('search-memory handler returns error on json-rpc error', async () => {
    initBridge();
    markReady();

    const response = {
      jsonrpc: '2.0',
      id: 'req-1',
      error: { message: 'nope' },
    };

    const promise = handlers['search-memory'](null, {
      query: 'q',
      user_id: 'u',
      limit: 3,
      memory_type: 'semantic',
    });
    stdoutHandler(Buffer.from(`${JSON.stringify(response)}\n`));

    const result = await promise;
    expect(result).toEqual({ success: false, error: 'nope' });
  });
});
