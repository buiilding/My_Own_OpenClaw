import { act } from '@testing-library/react';

import {
  IpcBridge,
  INVOKE_CHANNELS,
  ON_CHANNELS,
  SEND_CHANNELS,
  emitBackendEventAsync,
  getRemoveListenerMock,
  mockExecuteTool,
  mockExecuteToolBundle,
  recordToolMessage,
  renderToolRunner,
  resetToolRunnerTestState,
  restoreToolRunnerMocks,
  useChatStore,
} from './ToolRunnerHook.testUtils';

describe('useToolRunner event handling', () => {
  beforeEach(() => {
    resetToolRunnerTestState();
  });

  afterEach(() => {
    restoreToolRunnerMocks();
  });

  test('subscribes to backend events when enabled', () => {
    renderToolRunner(true);

    expect(IpcBridge.on).toHaveBeenCalledWith(
      ON_CHANNELS.FROM_BACKEND,
      expect.any(Function),
    );
  });

  test('does not subscribe when disabled', () => {
    renderToolRunner(false);

    expect(IpcBridge.on).not.toHaveBeenCalled();
  });

  test('removes backend listener on unmount', () => {
    const { unmount } = renderToolRunner(true);

    unmount();

    expect(getRemoveListenerMock()).toHaveBeenCalledTimes(1);
  });

  test('dispatches tool-call events to ToolExecutionService', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-id',
      payload: {
        tool_name: 'read_file',
        parameters: { file_path: '/tmp/a' },
        correlation_id: 'corr-1',
      },
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'read_file',
      { file_path: '/tmp/a' },
      { correlationId: 'corr-1', skipAutoCapture: false },
    );
    expect(IpcBridge.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      expect.anything(),
    );
  });

  test.each([
    {
      caseName: 'mouse click tool-call',
      eventId: 'event-click-delay',
      requestId: 'req-click-delay',
      toolName: 'mouse_control',
      parameters: { action: 'click', x: 64, y: 48 },
    },
    {
      caseName: 'direct click tool-call',
      eventId: 'event-click-tool-delay',
      requestId: 'req-click-tool-delay',
      toolName: 'click',
      parameters: { x: 88, y: 44 },
    },
    {
      caseName: 'browser action click tool-call',
      eventId: 'event-browser-click-delay',
      requestId: 'req-browser-click-delay',
      toolName: 'browser',
      parameters: { action: 'click', ref: '3' },
    },
  ])('dispatches $caseName without ghost-sync delay', async ({
    eventId,
    requestId,
    toolName,
    parameters,
  }) => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: eventId,
      payload: {
        tool_name: toolName,
        parameters,
        request_id: requestId,
      },
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      toolName,
      parameters,
      { correlationId: requestId, skipAutoCapture: false },
    );
    expect(IpcBridge.invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      { focus: false },
    );
    expect(IpcBridge.invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS,
      { waitMs: 180 },
    );
    const showCallOrder = (IpcBridge.invoke as jest.Mock).mock.invocationCallOrder[0];
    const prepareCallOrder = (IpcBridge.invoke as jest.Mock).mock.invocationCallOrder[1];
    const executeCallOrder = mockExecuteTool.mock.invocationCallOrder[0];
    expect(showCallOrder).toBeLessThan(prepareCallOrder);
    expect(prepareCallOrder).toBeLessThan(executeCallOrder);
  });

  test('does not force chat-pill handoff for switch_tab tool-call', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-switch-tab',
      payload: {
        tool_name: 'switch_tab',
        parameters: { tab_name: 'Editor' },
        request_id: 'req-switch-tab',
      },
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'switch_tab',
      { tab_name: 'Editor' },
      { correlationId: 'req-switch-tab', skipAutoCapture: false },
    );
    expect(IpcBridge.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      expect.anything(),
    );
  });


  test('dispatches tool-bundle events with mapped tools', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-bundle',
      payload: {
        bundle_id: 'bundle-abc',
        tools: [
          { name: 'read_file', args: { file_path: '/tmp/a' } },
          { name: 'write_file', args: { file_path: '/tmp/b', content: 'x' } },
          { name: '', args: {} },
        ],
      },
    });

    expect(mockExecuteToolBundle).toHaveBeenCalledWith(
      [
        { toolName: 'read_file', args: { file_path: '/tmp/a' } },
        { toolName: 'write_file', args: { file_path: '/tmp/b', content: 'x' } },
      ],
      'bundle-abc',
    );
    expect(IpcBridge.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      expect.anything(),
    );
  });

  test('forces chat-pill handoff before executing computer-use tool bundles', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-bundle',
      payload: {
        bundle_id: 'bundle-computer-tool',
        tools: [
          { name: 'read_file', args: { file_path: '/tmp/a' } },
          { name: 'screenshot', args: {} },
        ],
      },
    });

    const invokeCalls = (IpcBridge.invoke as jest.Mock).mock.calls;
    expect(invokeCalls).toContainEqual([
      INVOKE_CHANNELS.SHOW_CHATBOX,
      { focus: false },
    ]);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.HIDE_CHATBOX)).toBe(true);
    expect(mockExecuteToolBundle).toHaveBeenCalledWith(
      [
        { toolName: 'read_file', args: { file_path: '/tmp/a' } },
        { toolName: 'screenshot', args: {} },
      ],
      'bundle-computer-tool',
    );
    expect(invokeCalls).toContainEqual([
      INVOKE_CHANNELS.SHOW_CHATBOX,
      { focus: false },
    ]);
  });

  test('uses generated bundle id when bundle_id is missing', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-bundle',
      payload: {
        tools: [{ name: 'read_file', args: { file_path: '/tmp/a' } }],
      },
    });

    expect(mockExecuteToolBundle).toHaveBeenCalledTimes(1);
    const calledTools = mockExecuteToolBundle.mock.calls[0]?.[0];
    const calledBundleId = mockExecuteToolBundle.mock.calls[0]?.[1];
    if (typeof calledBundleId !== 'string' || !calledBundleId.startsWith('bundle-')) {
      throw new Error(`expected generated bundle id prefix, got: ${String(calledBundleId)}`);
    }
    if (
      JSON.stringify(calledTools) !==
      JSON.stringify([{ toolName: 'read_file', args: { file_path: '/tmp/a' } }])
    ) {
      throw new Error(`unexpected mapped tools payload: ${JSON.stringify(calledTools)}`);
    }
  });

  test('falls back to event id for tool-call correlation id', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-fallback-id',
      payload: {
        tool_name: 'read_file',
        parameters: { file_path: '/tmp/a' },
      },
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'read_file',
      { file_path: '/tmp/a' },
      { correlationId: 'event-fallback-id', skipAutoCapture: false },
    );
  });

  test('dispatches tool-call with empty args object', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-empty-args',
      payload: {
        tool_name: 'screenshot',
        parameters: {},
      },
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'screenshot',
      {},
      { correlationId: 'event-empty-args', skipAutoCapture: false },
    );
    const invokeCalls = (IpcBridge.invoke as jest.Mock).mock.calls;
    expect(invokeCalls).toContainEqual([
      INVOKE_CHANNELS.SHOW_CHATBOX,
      { focus: false },
    ]);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.HIDE_CHATBOX)).toBe(true);
    const firstShowIndex = invokeCalls.findIndex(([channel]: unknown[]) => channel === INVOKE_CHANNELS.SHOW_CHATBOX);
    const hideIndex = invokeCalls.findIndex(([channel]: unknown[]) => channel === INVOKE_CHANNELS.HIDE_CHATBOX);
    let lastShowIndex = -1;
    invokeCalls.forEach((call: unknown[], index: number) => {
      if (call[0] === INVOKE_CHANNELS.SHOW_CHATBOX) {
        lastShowIndex = index;
      }
    });
    expect(firstShowIndex).toBeGreaterThanOrEqual(0);
    expect(hideIndex).toBeGreaterThan(firstShowIndex);
    expect(lastShowIndex).toBeGreaterThan(hideIndex);
  });

  test('emits local tool-output when interactive focus verification fails', async () => {
    renderToolRunner(true);
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS) {
        return {
          success: true,
          data: {
            canVerifyExternalFocus: true,
            externalFocusActive: false,
          },
        };
      }
      if (
        channel === INVOKE_CHANNELS.SHOW_CHATBOX
        || channel === INVOKE_CHANNELS.HIDE_CHATBOX
      ) {
        return { success: true };
      }
      return {};
    });

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-focus-fail',
      payload: {
        tool_name: 'browser',
        parameters: { action: 'click', ref: '444' },
        request_id: 'req-focus-fail',
      },
    });

    expect(mockExecuteTool).not.toHaveBeenCalled();
    expect(IpcBridge.send).toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      expect.objectContaining({
        type: 'tool-result',
        payload: expect.objectContaining({
          request_id: 'req-focus-fail',
          success: false,
          error: 'frontend_execution_surface_unavailable: external_window_focus_not_verified',
        }),
      }),
    );
    const lastMessage = useChatStore.getState().messages.at(-1);
    expect(lastMessage).toEqual(expect.objectContaining({
      type: 'tool-output',
      toolName: 'browser',
      correlationId: 'req-focus-fail',
      success: false,
    }));
    expect(lastMessage?.text).toContain('frontend_execution_surface_unavailable: external_window_focus_not_verified');
    expect(recordToolMessage).toHaveBeenCalledWith(
      expect.stringContaining('frontend_execution_surface_unavailable: external_window_focus_not_verified'),
      expect.objectContaining({
        messageType: 'tool-output',
        toolName: 'browser',
        correlationId: 'req-focus-fail',
      }),
    );
  });

  test('emits local tool-output when interactive bundle focus verification fails', async () => {
    renderToolRunner(true);
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS) {
        return {
          success: true,
          data: {
            canVerifyExternalFocus: true,
            externalFocusActive: false,
          },
        };
      }
      if (
        channel === INVOKE_CHANNELS.SHOW_CHATBOX
        || channel === INVOKE_CHANNELS.HIDE_CHATBOX
      ) {
        return { success: true };
      }
      return {};
    });

    await emitBackendEventAsync({
      type: 'tool-bundle',
      payload: {
        bundle_id: 'bundle-focus-fail',
        tools: [
          { name: 'browser', args: { action: 'click', ref: '444' } },
          { name: 'read_file', args: { file_path: '/tmp/a' } },
        ],
      },
    });

    expect(mockExecuteToolBundle).not.toHaveBeenCalled();
    expect(IpcBridge.send).toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      expect.objectContaining({
        type: 'tool-bundle-result',
        payload: expect.objectContaining({
          bundle_id: 'bundle-focus-fail',
          status: 'failure',
          error: 'frontend_execution_surface_unavailable: external_window_focus_not_verified',
        }),
      }),
    );
    const lastMessage = useChatStore.getState().messages.at(-1);
    expect(lastMessage).toEqual(expect.objectContaining({
      type: 'tool-output',
      toolName: 'bundled_tools (2 tools)',
      correlationId: 'bundle-focus-fail',
      success: false,
    }));
    expect(lastMessage?.text).toContain('frontend_execution_surface_unavailable: external_window_focus_not_verified');
    expect(recordToolMessage).toHaveBeenCalledWith(
      expect.stringContaining('frontend_execution_surface_unavailable: external_window_focus_not_verified'),
      expect.objectContaining({
        messageType: 'tool-output',
        toolName: 'bundled_tools (2 tools)',
        correlationId: 'bundle-focus-fail',
      }),
    );
  });

  test('skips frontend execution for non-executable tool-call metadata', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-skip',
      payload: {
        tool_name: 'mouse_control',
        parameters: { action: 'click' },
        metadata: {
          coordinate_resolution_failed: true,
          skip_frontend_execution: true,
        },
      },
    });

    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  test('logs executeToolBundle failures', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockExecuteToolBundle.mockRejectedValueOnce(new Error('bundle-failed'));
    renderToolRunner(true);

    await act(async () => {
      await emitBackendEventAsync({
        type: 'tool-bundle',
        payload: {
          bundle_id: 'bundle-err',
          tools: [{ name: 'read_file', args: { file_path: '/tmp/a' } }],
        },
      });
      await Promise.resolve();
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[useToolRunner] Failed to execute bundle:',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  test('logs executeTool failures', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockExecuteTool.mockRejectedValueOnce(new Error('tool-failed'));
    renderToolRunner(true);

    await act(async () => {
      await emitBackendEventAsync({
        type: 'tool-call',
        id: 'event-id',
        payload: {
          tool_name: 'read_file',
          parameters: { file_path: '/tmp/a' },
        },
      });
      await Promise.resolve();
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[useToolRunner] Failed to execute tool:',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  test('ignores invalid backend payloads', async () => {
    renderToolRunner(true);

    await act(async () => {
      await emitBackendEventAsync({ type: 'unknown-event', payload: {} });
      await emitBackendEventAsync({ type: 'tool-call', payload: {} });
      await emitBackendEventAsync({ type: 'tool-bundle', payload: { tools: [{ name: '', args: {} }] } });
    });

    expect(mockExecuteTool).not.toHaveBeenCalled();
    expect(mockExecuteToolBundle).not.toHaveBeenCalled();
  });
});
