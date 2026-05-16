/** @jest-environment node */

const {
  markRendererToolEventDisplayOnly,
  routeSdkToolEventToLocalRuntime,
} = require('../../frontend/src/main/ipc/ipc_sdk_tool_router.cjs');

describe('ipc sdk tool router', () => {
  test('marks tool-call events display-only for renderer execution', () => {
    const event = {
      type: 'tool-call',
      payload: {
        tool_name: 'read_file',
        request_id: 'req-1',
        metadata: { attempt: 1 },
      },
    };

    expect(markRendererToolEventDisplayOnly(event)).toEqual({
      type: 'tool-call',
      payload: {
        tool_name: 'read_file',
        request_id: 'req-1',
        metadata: {
          attempt: 1,
          skip_frontend_execution: true,
          execution_owner: 'sdk-runtime',
        },
      },
    });
    expect(event.payload.metadata).toEqual({ attempt: 1 });
  });

  test('routes tool-call results to the typed backend tool-result sender', async () => {
    const executeLocalTool = jest.fn(async () => ({
      success: true,
      data: { output: 'ok', llm_content: 'ok' },
    }));
    const sendToolResult = jest.fn();

    routeSdkToolEventToLocalRuntime({
      id: 'event-1',
      type: 'tool-call',
      payload: {
        tool_name: 'read_file',
        request_id: 'req-read',
        parameters: { path: '/tmp/a' },
      },
    }, {
      executeLocalTool,
      sendToolResult,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(executeLocalTool).toHaveBeenCalledWith({
      toolName: 'read_file',
      args: { path: '/tmp/a' },
    });
    expect(sendToolResult).toHaveBeenCalledWith({
      request_id: 'req-read',
      success: true,
      data: { output: 'ok', llm_content: 'ok' },
      error: undefined,
    });
  });

  test('adds llm_content fallback without adding schema-invalid metadata', async () => {
    const executeLocalTool = jest.fn(async () => ({
      success: true,
      data: { output: 'raw output' },
    }));
    const sendToolResult = jest.fn();

    routeSdkToolEventToLocalRuntime({
      type: 'tool-call',
      payload: {
        tool_name: 'run_shell_command',
        request_id: 'req-shell',
        parameters: { command: 'pwd' },
      },
    }, {
      executeLocalTool,
      sendToolResult,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(sendToolResult).toHaveBeenCalledWith({
      request_id: 'req-shell',
      success: true,
      data: {
        output: 'raw output',
        llm_content: 'raw output',
      },
      error: undefined,
    });
  });

  test('routes tool-bundle results through local execution steps', async () => {
    const executeLocalTool = jest
      .fn()
      .mockResolvedValueOnce({ success: true, data: { output: 'one' } })
      .mockResolvedValueOnce({ success: false, error: 'failed-two' });
    const sendToolBundleResult = jest.fn();

    routeSdkToolEventToLocalRuntime({
      type: 'tool-bundle',
      payload: {
        bundle_id: 'bundle-1',
        tools: [
          { name: 'read_file', args: { path: '/tmp/a' } },
          { name: 'save_note', args: { text: 'hello' } },
        ],
      },
    }, {
      executeLocalTool,
      sendToolBundleResult,
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendToolBundleResult).toHaveBeenCalledWith(
      expect.objectContaining({
        bundle_id: 'bundle-1',
        status: 'partial_failure',
        step_results: [
          { tool: 'read_file', status: 'ok', output: { output: 'one' } },
          { tool: 'save_note', status: 'error', output: { error: 'failed-two' } },
        ],
      }),
    );
  });
});
