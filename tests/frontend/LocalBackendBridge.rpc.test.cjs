/** @jest-environment node */

const {
  getLastWrittenRequest,
  initBridge,
  markReady,
  registerBridgeSuiteLifecycleHooks,
} = require('./__mocks__/localBackendBridgeHarness.cjs');

describe('local_backend_bridge RPC handlers', () => {
  registerBridgeSuiteLifecycleHooks();

  function emitRpcMessage(stdoutHandler, payload) {
    stdoutHandler()(Buffer.from(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 'req-1',
      ...payload,
    })}\n`));
  }

  function emitRpcResult(stdoutHandler, result) {
    emitRpcMessage(stdoutHandler, { result });
  }

  function emitRpcError(stdoutHandler, message) {
    emitRpcMessage(stdoutHandler, { error: { message } });
  }

  function expectLastRequestWith(method, params) {
    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method,
        params,
      }),
    );
  }

  test('execute-tool handler returns success for valid response', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['execute-tool'](null, {
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
    });

    emitRpcResult(stdoutHandler, { success: true, data: { value: 1 } });

    const result = await promise;
    expect(result).toEqual({ success: true, data: { value: 1 } });
  });

  test('passes resolved backend http URL to Python sidecar env', () => {
    process.env.BACKEND_HOST = '192.168.1.55';
    process.env.BACKEND_PORT = '8811';
    const { spawn } = initBridge();
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

  test('adds --no-deprecation to Node options for local backend subprocesses', () => {
    process.env.NODE_OPTIONS = '--max-old-space-size=4096';
    const { spawn } = initBridge();
    markReady();

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          NODE_OPTIONS: '--max-old-space-size=4096 --no-deprecation',
        }),
      }),
    );
  });

  test('suppresses known Node deprecation stderr lines from local backend logs', () => {
    const { stderrHandler } = initBridge();
    markReady();

    stderrHandler()(
      Buffer.from(
        [
          '(node:71611) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized',
          '(Use `node --trace-deprecation ...` to show where the warning was created)',
          '2026-02-16 16:24:39,551 - tools.browser.controller - INFO - Connected to Chrome: chrome://new-tab-page/',
        ].join('\n'),
      ),
    );

    const loggedLines = console.log.mock.calls.map((call) => call[0]);
    expect(
      loggedLines.some((line) => line.includes('[DEP0169] DeprecationWarning')),
    ).toBe(false);
    expect(
      loggedLines.some((line) => line.includes('trace-deprecation')),
    ).toBe(false);
    expect(
      loggedLines.some((line) => line.includes('Connected to Chrome')),
    ).toBe(true);
  });

  test('execute-tool handler returns error on json-rpc error', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['execute-tool'](null, {
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
    });

    emitRpcError(stdoutHandler, 'bad');

    const result = await promise;
    expect(result).toEqual({ success: false, error: 'bad' });
  });

  test('get-system-state handler returns null on error response', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['get-system-state'](null, { fields: ['active_window'] });
    emitRpcResult(stdoutHandler, { success: false, error: 'fail' });

    const result = await promise;
    expect(result).toBeNull();
  });

  test('search-memory handler returns error on json-rpc error', async () => {
    const { handlers, stdoutHandler } = initBridge();
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

    emitRpcError(stdoutHandler, 'nope');

    const result = await promise;
    expect(result).toEqual({ success: false, error: 'nope' });
  });

  test('search-memory handler accepts snake_case exclude_conversation_id payload key', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['search-memory'](null, {
      query: 'q2',
      user_id: 'u2',
      limit: 4,
      memory_type: 'episodic',
      exclude_conversation_id: 'conv-snake',
    });
    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method: 'search_memory',
        params: {
          query: 'q2',
          user_id: 'u2',
          limit: 4,
          memory_type: 'episodic',
          exclude_conversation_id: 'conv-snake',
        },
      }),
    );

    emitRpcResult(stdoutHandler, { success: true, data: { memories: [] } });

    const result = await promise;
    expect(result).toEqual({ success: true, data: { memories: [] } });
  });

  test('list-conversations handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['list-conversations'](null, {
      userId: 'u-1',
      limit: 7,
      recordKind: 'transcript',
    });

    expectLastRequestWith('list_conversations', {
      user_id: 'u-1',
      limit: 7,
      record_kind: 'transcript',
    });

    emitRpcResult(stdoutHandler, { success: true, data: { items: [] } });

    await expect(promise).resolves.toEqual({ success: true, data: { items: [] } });
  });

  test('list-conversations handler safely handles non-object payloads', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['list-conversations'](null, 'invalid-payload');

    expectLastRequestWith('list_conversations', {});

    emitRpcResult(stdoutHandler, { success: true, data: { items: [] } });

    await expect(promise).resolves.toEqual({ success: true, data: { items: [] } });
  });

  test('list-semantic-memories handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['list-semantic-memories'](null, {
      userId: 'u-1',
      limit: 12,
    });

    expectLastRequestWith('list_semantic_memories', {
      user_id: 'u-1',
      limit: 12,
    });

    emitRpcResult(stdoutHandler, { success: true, data: { memories: [] } });

    await expect(promise).resolves.toEqual({ success: true, data: { memories: [] } });
  });

  test('get-conversation handler maps missing conversationId to null', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['get-conversation'](null, {
      userId: 'u-1',
      limit: 4,
      recordKind: 'transcript',
    });

    expectLastRequestWith('get_conversation', {
      user_id: 'u-1',
      conversation_id: null,
      limit: 4,
      record_kind: 'transcript',
    });

    emitRpcResult(stdoutHandler, { success: true, data: { messages: [] } });

    await expect(promise).resolves.toEqual({ success: true, data: { messages: [] } });
  });

  test('delete-conversation handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['delete-conversation'](null, {
      userId: 'u-1',
      conversationId: 'c-1',
      recordKind: 'transcript',
    });

    expectLastRequestWith('delete_conversation', {
      user_id: 'u-1',
      conversation_id: 'c-1',
      record_kind: 'transcript',
    });

    emitRpcResult(stdoutHandler, { success: true, data: { deleted_count: 3 } });

    await expect(promise).resolves.toEqual({ success: true, data: { deleted_count: 3 } });
  });

  test('delete-semantic-memory handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['delete-semantic-memory'](null, {
      userId: 'u-1',
      memoryId: 'm-1',
    });

    expectLastRequestWith('delete_semantic_memory', {
      user_id: 'u-1',
      memory_id: 'm-1',
    });

    emitRpcResult(stdoutHandler, { success: true, data: { deleted: true } });

    await expect(promise).resolves.toEqual({ success: true, data: { deleted: true } });
  });

  test('store-transcript handler returns standardized error payload', async () => {
    const { handlers, stdoutHandler } = initBridge();
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

    emitRpcError(stdoutHandler, 'store failed');

    await expect(promise).resolves.toEqual({ success: false, error: 'store failed' });
  });

  test('store-memory handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['store-memory'](null, {
      userQuery: 'What is WindieOS?',
      assistantResponse: 'A desktop assistant.',
      memoryType: 'semantic',
      userId: 'u-1',
      sessionId: 'session-7',
    });

    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method: 'store_memory',
        params: {
          user_query: 'What is WindieOS?',
          assistant_response: 'A desktop assistant.',
          memory_type: 'semantic',
          user_id: 'u-1',
          session_id: 'session-7',
        },
      }),
    );

    emitRpcResult(stdoutHandler, { success: true, data: { stored: true } });

    await expect(promise).resolves.toEqual({ success: true, data: { stored: true } });
  });
});
