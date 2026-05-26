/** @jest-environment node */

const {
  markRendererToolEventDisplayOnly,
  routeSdkToolEventToLocalRuntime,
} = require('../../frontend/src/main/ipc/ipc_sdk_tool_router.cjs');

describe('ipc sdk tool router', () => {
  const flushRoutedToolExecution = () => new Promise((resolve) => setImmediate(resolve));

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
    const onToolOutput = jest.fn();

    routeSdkToolEventToLocalRuntime({
      id: 'event-1',
      type: 'tool-call',
      conversation_ref: 'conv-1',
      turn_ref: 'turn-1',
      payload: {
        tool_name: 'read_file',
        request_id: 'req-read',
        parameters: { path: '/tmp/a' },
      },
    }, {
      executeLocalTool,
      sendToolResult,
      onToolOutput,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(executeLocalTool).toHaveBeenCalledWith({
      toolName: 'read_file',
      args: { path: '/tmp/a' },
      requestId: 'req-read',
      toolCallId: null,
      correlationId: null,
    });
    expect(sendToolResult).toHaveBeenCalledWith({
      request_id: 'req-read',
      success: true,
      data: expect.objectContaining({ output: 'ok', llm_content: 'ok' }),
      error: undefined,
    });
    expect(onToolOutput).toHaveBeenCalledWith(expect.objectContaining({
      id: 'req-read:tool-output',
      type: 'tool-output',
      conversation_ref: 'conv-1',
      turn_ref: 'turn-1',
      payload: expect.objectContaining({
        tool_name: 'read_file',
        request_id: 'req-read',
        success: true,
        output: 'ok',
        error: null,
        metadata: expect.objectContaining({
          skip_frontend_execution: true,
          execution_owner: 'sdk-runtime',
          display_projection: 'local-tool-result',
        }),
      }),
    }));
  });

  test('routes first-class camelCase tool identity fields through local execution', async () => {
    const executeLocalTool = jest.fn(async () => ({
      success: true,
      data: { output: 'ok', llm_content: 'ok' },
    }));
    const sendToolResult = jest.fn();

    routeSdkToolEventToLocalRuntime({
      id: 'event-camel',
      type: 'tool-call',
      payload: {
        toolName: 'read_file',
        requestId: 'req-read',
        toolCallId: 'call-read',
        correlationId: 'corr-read',
        args: { path: '/tmp/a' },
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
      requestId: 'req-read',
      toolCallId: 'call-read',
      correlationId: 'corr-read',
    });
    expect(sendToolResult).toHaveBeenCalledWith(expect.objectContaining({
      request_id: 'req-read',
      success: true,
    }));
  });

  test('attaches one post-action screenshot to single computer-use results', async () => {
    const executeLocalTool = jest
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: { output: 'typed', llm_content: 'typed' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          screenshot_ref: 'after-keyboard.jpg',
          screenshot_content_type: 'image/jpeg',
          capture_meta: { capture_backend: 'test' },
        },
      });
    const sendToolResult = jest.fn();

    routeSdkToolEventToLocalRuntime({
      type: 'tool-call',
      turn_ref: 'turn-1',
      conversation_ref: 'conv-1',
      payload: {
        tool_name: 'keyboard_control',
        request_id: 'req-keyboard',
        parameters: { action: 'type', text: '123456', wait: 0 },
      },
    }, {
      executeLocalTool,
      sendToolResult,
    });
    await flushRoutedToolExecution();

    expect(executeLocalTool).toHaveBeenCalledTimes(2);
    expect(executeLocalTool).toHaveBeenNthCalledWith(2, {
      toolName: 'screenshot',
      args: {
        explanation: 'Capturing the screen after keyboard_control execution.',
        wait: 0,
      },
      turnRef: 'turn-1',
      conversationRef: 'conv-1',
    });
    expect(sendToolResult).toHaveBeenCalledWith({
      request_id: 'req-keyboard',
      success: true,
      data: expect.objectContaining({
        output: 'typed',
        llm_content: 'typed',
        screenshot_ref: 'after-keyboard.jpg',
        screenshot_content_type: 'image/jpeg',
        capture_meta: { capture_backend: 'test' },
        post_action_screenshot: true,
        post_action_screenshot_tool: 'keyboard_control',
      }),
      error: undefined,
    });
  });

  test('uses event id as the request id fallback for tool calls', async () => {
    const executeLocalTool = jest.fn(async () => ({
      success: true,
      data: { output: 'read ok' },
    }));
    const sendToolResult = jest.fn();

    const claimed = routeSdkToolEventToLocalRuntime({
      id: 'event-only-id',
      type: 'tool-call',
      payload: {
        tool_name: 'read_file',
        correlation_id: 'corr-only',
        tool_call_id: 'call-only',
        parameters: { path: '/tmp/a' },
      },
    }, {
      executeLocalTool,
      sendToolResult,
    });
    await flushRoutedToolExecution();

    expect(claimed).toBe(true);
    expect(executeLocalTool).toHaveBeenCalledWith({
      toolName: 'read_file',
      args: { path: '/tmp/a' },
      requestId: 'event-only-id',
      toolCallId: 'call-only',
      correlationId: 'corr-only',
    });
    expect(sendToolResult).toHaveBeenCalledWith({
      request_id: 'event-only-id',
      success: true,
      data: expect.objectContaining({
        output: 'read ok',
        llm_content: 'read ok',
      }),
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
      data: expect.objectContaining({
        output: 'raw output',
        llm_content: 'raw output',
      }),
      error: undefined,
    });
  });

  test('routes tool-bundle results through local execution steps', async () => {
    const executeLocalTool = jest
      .fn()
      .mockResolvedValueOnce({ success: true, data: { output: 'one', llm_content: 'one display' } })
      .mockResolvedValueOnce({ success: false, error: 'failed-two' });
    const sendToolBundleResult = jest.fn();
    const onToolOutput = jest.fn();

    routeSdkToolEventToLocalRuntime({
      id: 'event-bundle',
      type: 'tool-bundle',
      conversation_ref: 'conv-1',
      turn_ref: 'turn-1',
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
      onToolOutput,
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendToolBundleResult).toHaveBeenCalledWith(
      expect.objectContaining({
        bundle_id: 'bundle-1',
        status: 'partial_failure',
        step_results: [
          { tool: 'read_file', status: 'ok', output: expect.objectContaining({ output: 'one', llm_content: 'one display' }) },
          { tool: 'save_note', status: 'error', output: { error: 'failed-two' } },
        ],
      }),
    );
    expect(onToolOutput).toHaveBeenCalledWith(expect.objectContaining({
      id: 'bundle-1:tool-output',
      type: 'tool-output',
      conversation_ref: 'conv-1',
      turn_ref: 'turn-1',
      payload: expect.objectContaining({
        tool_name: 'tool-bundle',
        bundle_id: 'bundle-1',
        success: false,
        output: expect.stringContaining('one'),
        step_results: [
          { tool: 'read_file', status: 'ok', output: expect.objectContaining({ output: 'one', llm_content: 'one display' }) },
          { tool: 'save_note', status: 'error', output: { error: 'failed-two' } },
        ],
        metadata: expect.objectContaining({
          execution_owner: 'sdk-runtime',
          display_projection: 'local-tool-bundle-result',
        }),
      }),
    }));
  });

  test('captures once after bundled computer-use execution', async () => {
    const executeLocalTool = jest
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: { output: 'switched', llm_content: 'switched' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { output: 'typed', llm_content: 'typed' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          screenshot_ref: 'after-bundle.jpg',
          screenshot_content_type: 'image/jpeg',
        },
      });
    const sendToolBundleResult = jest.fn();
    const onToolOutput = jest.fn();

    routeSdkToolEventToLocalRuntime({
      type: 'tool-bundle',
      turn_ref: 'turn-1',
      conversation_ref: 'conv-1',
      payload: {
        bundle_id: 'bundle-computer',
        tools: [
          { name: 'switch_window', args: { tab_name: 'Messages', wait: 0 } },
          { name: 'keyboard_control', args: { action: 'type', text: '123456', wait: 0 } },
        ],
      },
    }, {
      executeLocalTool,
      sendToolBundleResult,
      onToolOutput,
    });
    await flushRoutedToolExecution();

    expect(executeLocalTool).toHaveBeenCalledTimes(3);
    expect(executeLocalTool).toHaveBeenNthCalledWith(3, {
      toolName: 'screenshot',
      args: {
        explanation: 'Capturing the screen after bundled computer-use execution.',
        wait: 0,
      },
      turnRef: 'turn-1',
      conversationRef: 'conv-1',
    });
    expect(sendToolBundleResult).toHaveBeenCalledWith(expect.objectContaining({
      bundle_id: 'bundle-computer',
      status: 'success',
      screenshot_ref: 'after-bundle.jpg',
      screenshot_content_type: 'image/jpeg',
      step_results: [
        { tool: 'switch_window', status: 'ok', output: expect.objectContaining({ output: 'switched' }) },
        { tool: 'keyboard_control', status: 'ok', output: expect.objectContaining({ output: 'typed' }) },
      ],
    }));
    expect(onToolOutput).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        tool_name: 'tool-bundle',
        screenshot_ref: 'after-bundle.jpg',
      }),
    }));
  });

  test('promotes explicit bundle screenshot instead of taking a duplicate capture', async () => {
    const executeLocalTool = jest
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: { output: 'switched', llm_content: 'switched' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          output: 'Screenshot captured',
          llm_content: 'Screenshot captured',
          screenshot_ref: 'explicit-shot.jpg',
        },
      });
    const sendToolBundleResult = jest.fn();

    routeSdkToolEventToLocalRuntime({
      type: 'tool-bundle',
      payload: {
        bundle_id: 'bundle-explicit-shot',
        tools: [
          { name: 'switch_window', args: { tab_name: 'Messages', wait: 0 } },
          { name: 'screenshot', args: { explanation: 'Checking Messages' } },
        ],
      },
    }, {
      executeLocalTool,
      sendToolBundleResult,
    });
    await flushRoutedToolExecution();

    expect(executeLocalTool).toHaveBeenCalledTimes(2);
    expect(sendToolBundleResult).toHaveBeenCalledWith(expect.objectContaining({
      bundle_id: 'bundle-explicit-shot',
      screenshot_ref: 'explicit-shot.jpg',
    }));
  });

  test('captures bundle screenshot after skipped invalid step before computer-use action', async () => {
    const executeLocalTool = jest
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: { output: 'typed', llm_content: 'typed' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          screenshot_ref: 'after-shifted.jpg',
          screenshot_content_type: 'image/jpeg',
        },
      });
    const sendToolBundleResult = jest.fn();

    routeSdkToolEventToLocalRuntime({
      type: 'tool-bundle',
      turn_ref: 'turn-1',
      conversation_ref: 'conv-1',
      payload: {
        bundle_id: 'bundle-shifted-action',
        tools: [
          {},
          { name: 'keyboard_control', args: { action: 'type', text: '123456', wait: 0 } },
        ],
      },
    }, {
      executeLocalTool,
      sendToolBundleResult,
    });
    await flushRoutedToolExecution();

    expect(executeLocalTool).toHaveBeenCalledTimes(2);
    expect(executeLocalTool).toHaveBeenNthCalledWith(2, {
      toolName: 'screenshot',
      args: {
        explanation: 'Capturing the screen after bundled computer-use execution.',
        wait: 0,
      },
      turnRef: 'turn-1',
      conversationRef: 'conv-1',
    });
    expect(sendToolBundleResult).toHaveBeenCalledWith(expect.objectContaining({
      bundle_id: 'bundle-shifted-action',
      status: 'success',
      screenshot_ref: 'after-shifted.jpg',
      screenshot_content_type: 'image/jpeg',
      step_results: [
        { tool: 'keyboard_control', status: 'ok', output: expect.objectContaining({ output: 'typed' }) },
      ],
    }));
  });

  test('promotes explicit bundle screenshot after skipped invalid step', async () => {
    const executeLocalTool = jest
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: {
          output: 'Screenshot captured',
          llm_content: 'Screenshot captured',
          screenshot_ref: 'explicit-shifted.jpg',
        },
      });
    const sendToolBundleResult = jest.fn();

    routeSdkToolEventToLocalRuntime({
      type: 'tool-bundle',
      payload: {
        bundle_id: 'bundle-explicit-shifted-shot',
        tools: [
          {},
          { name: 'screenshot', args: { explanation: 'Checking Messages' } },
        ],
      },
    }, {
      executeLocalTool,
      sendToolBundleResult,
    });
    await flushRoutedToolExecution();

    expect(executeLocalTool).toHaveBeenCalledTimes(1);
    expect(sendToolBundleResult).toHaveBeenCalledWith(expect.objectContaining({
      bundle_id: 'bundle-explicit-shifted-shot',
      screenshot_ref: 'explicit-shifted.jpg',
      step_results: [
        { tool: 'screenshot', status: 'ok', output: expect.objectContaining({ screenshot_ref: 'explicit-shifted.jpg' }) },
      ],
    }));
  });
});
