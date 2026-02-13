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
  const ORIGINAL_ENV = process.env;
  let spawn;
  let ipcMain;
  let uuid;
  let handlers;
  let stdoutHandler;
  let processHandlers;
  let pythonProcess;
  let bridge;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.BACKEND_HOST;
    delete process.env.BACKEND_PORT;
    delete process.env.BACKEND_HTTP_URL;
    delete process.env.BACKEND_WS_URL;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

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

  const getLastWrittenRequest = () => {
    const calls = pythonProcess.stdin.write.mock.calls;
    const lastCall = calls[calls.length - 1];
    return JSON.parse(lastCall[0].trim());
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

  test('passes resolved backend http URL to Python sidecar env', () => {
    process.env.BACKEND_HOST = '192.168.1.55';
    process.env.BACKEND_PORT = '8811';
    initBridge();
    markReady();

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          WINDIE_BACKEND_HTTP_URL: 'http://192.168.1.55:8811',
        }),
      }),
    );
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

    const promise = handlers['search-memory'](null, {
      query: 'q',
      user_id: 'u',
      limit: 3,
      memory_type: 'semantic',
      excludeConversationId: 'conv-active',
    });
    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method: 'search_memory',
        params: {
          query: 'q',
          user_id: 'u',
          limit: 3,
          memory_type: 'semantic',
          exclude_conversation_id: 'conv-active',
        },
      }),
    );

    const response = {
      jsonrpc: '2.0',
      id: 'req-1',
      error: { message: 'nope' },
    };
    stdoutHandler(Buffer.from(`${JSON.stringify(response)}\n`));

    const result = await promise;
    expect(result).toEqual({ success: false, error: 'nope' });
  });

  test('list-conversations handler maps payload keys to backend params', async () => {
    initBridge();
    markReady();

    const promise = handlers['list-conversations'](null, {
      userId: 'u-1',
      limit: 7,
      recordKind: 'transcript',
    });

    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method: 'list_conversations',
        params: {
          user_id: 'u-1',
          limit: 7,
          record_kind: 'transcript',
        },
      }),
    );

    stdoutHandler(
      Buffer.from(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 'req-1',
          result: { success: true, data: { items: [] } },
        })}\n`,
      ),
    );

    await expect(promise).resolves.toEqual({ success: true, data: { items: [] } });
  });

  test('list-semantic-memories handler maps payload keys to backend params', async () => {
    initBridge();
    markReady();

    const promise = handlers['list-semantic-memories'](null, {
      userId: 'u-1',
      limit: 12,
    });

    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method: 'list_semantic_memories',
        params: {
          user_id: 'u-1',
          limit: 12,
        },
      }),
    );

    stdoutHandler(
      Buffer.from(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 'req-1',
          result: { success: true, data: { memories: [] } },
        })}\n`,
      ),
    );

    await expect(promise).resolves.toEqual({ success: true, data: { memories: [] } });
  });

  test('delete-conversation handler maps payload keys to backend params', async () => {
    initBridge();
    markReady();

    const promise = handlers['delete-conversation'](null, {
      userId: 'u-1',
      conversationId: 'c-1',
      recordKind: 'transcript',
    });

    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method: 'delete_conversation',
        params: {
          user_id: 'u-1',
          conversation_id: 'c-1',
          record_kind: 'transcript',
        },
      }),
    );

    stdoutHandler(
      Buffer.from(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 'req-1',
          result: { success: true, data: { deleted_count: 3 } },
        })}\n`,
      ),
    );

    await expect(promise).resolves.toEqual({ success: true, data: { deleted_count: 3 } });
  });

  test('delete-semantic-memory handler maps payload keys to backend params', async () => {
    initBridge();
    markReady();

    const promise = handlers['delete-semantic-memory'](null, {
      userId: 'u-1',
      memoryId: 'm-1',
    });

    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method: 'delete_semantic_memory',
        params: {
          user_id: 'u-1',
          memory_id: 'm-1',
        },
      }),
    );

    stdoutHandler(
      Buffer.from(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 'req-1',
          result: { success: true, data: { deleted: true } },
        })}\n`,
      ),
    );

    await expect(promise).resolves.toEqual({ success: true, data: { deleted: true } });
  });

  test('store-transcript handler returns standardized error payload', async () => {
    initBridge();
    markReady();

    const promise = handlers['store-transcript'](null, {
      content: 'hello',
      userId: 'u-1',
      conversationRef: 'conv-1',
      role: 'assistant',
    });

    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method: 'store_transcript',
        params: expect.objectContaining({
          user_id: 'u-1',
          conversation_ref: 'conv-1',
          role: 'assistant',
        }),
      }),
    );

    stdoutHandler(
      Buffer.from(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 'req-1',
          error: { message: 'store failed' },
        })}\n`,
      ),
    );

    await expect(promise).resolves.toEqual({ success: false, error: 'store failed' });
  });
});
