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
    expect(IpcBridge.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      expect.anything(),
    );
    expect(IpcBridge.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.HIDE_CHATBOX,
      expect.anything(),
    );
    expect(IpcBridge.invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE,
      { ignore: true },
    );
    expect(IpcBridge.invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS,
      expect.objectContaining({ waitMs: 180 }),
    );
    const setIgnoreCallOrder = (IpcBridge.invoke as jest.Mock).mock.invocationCallOrder[0];
    const prepareCallOrder = (IpcBridge.invoke as jest.Mock).mock.invocationCallOrder[1];
    const executeCallOrder = mockExecuteTool.mock.invocationCallOrder[0];
    expect(setIgnoreCallOrder).toBeLessThan(prepareCallOrder);
    expect(prepareCallOrder).toBeLessThan(executeCallOrder);
  });

  test('dispatches browser click without surface handoff', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-browser-click-delay',
      payload: {
        tool_name: 'browser',
        parameters: { action: 'click', ref: '3' },
        request_id: 'req-browser-click-delay',
      },
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'browser',
      { action: 'click', ref: '3' },
      { correlationId: 'req-browser-click-delay', skipAutoCapture: false },
    );
    expect(IpcBridge.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      expect.anything(),
    );
    expect(IpcBridge.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.HIDE_CHATBOX,
      expect.anything(),
    );
    expect(IpcBridge.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS,
      expect.anything(),
    );
  });

  test('keeps chat pill visible for switch_tab tool-call when dashboard is closed', async () => {
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
    const invokeCalls = (IpcBridge.invoke as jest.Mock).mock.calls;
    expect(invokeCalls).toContainEqual([INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY]);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.SHOW_CHATBOX)).toBe(false);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.HIDE_CHATBOX)).toBe(false);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS)).toBe(false);
  });

  test('hides then restores chat pill for screenshot tool-call when dashboard is open', async () => {
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY) {
        return { success: true, data: { visible: true } };
      }
      return { success: true };
    });
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-screenshot-dashboard-open',
      payload: {
        tool_name: 'screenshot',
        parameters: {},
        request_id: 'req-screenshot-dashboard-open',
      },
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'screenshot',
      {},
      { correlationId: 'req-screenshot-dashboard-open', skipAutoCapture: false },
    );
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.HIDE_CHATBOX],
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
    ]);
  });

  test('keeps chat pill visible for interactive tool-call even when dashboard is open', async () => {
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY) {
        return { success: true, data: { visible: true } };
      }
      return { success: true };
    });
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-interactive-dashboard-open',
      payload: {
        tool_name: 'click',
        parameters: { x: 120, y: 80 },
        request_id: 'req-interactive-dashboard-open',
      },
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'click',
      { x: 120, y: 80 },
      { correlationId: 'req-interactive-dashboard-open', skipAutoCapture: false },
    );
    const invokeCalls = (IpcBridge.invoke as jest.Mock).mock.calls;
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY)).toBe(false);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.SHOW_CHATBOX)).toBe(false);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.HIDE_CHATBOX)).toBe(false);
    expect(invokeCalls).toContainEqual([
      INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE,
      { ignore: true },
    ]);
  });

  test('enables and then restores click-through around interactive tool execution window', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-interactive-click-through-window',
      payload: {
        tool_name: 'click',
        parameters: { x: 24, y: 12 },
        request_id: 'req-interactive-click-through-window',
      },
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'click',
      { x: 24, y: 12 },
      { correlationId: 'req-interactive-click-through-window', skipAutoCapture: false },
    );
    expect(IpcBridge.invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE,
      { ignore: true },
    );
    expect(IpcBridge.invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE,
      { ignore: false },
    );
    const invokeCallOrder = (IpcBridge.invoke as jest.Mock).mock.invocationCallOrder;
    const enableOrder = invokeCallOrder[
      (IpcBridge.invoke as jest.Mock).mock.calls.findIndex(
        ([channel, payload]: unknown[]) => (
          channel === INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE
          && (payload as Record<string, unknown> | undefined)?.ignore === true
        ),
      )
    ];
    const disableOrder = invokeCallOrder[
      (IpcBridge.invoke as jest.Mock).mock.calls.findIndex(
        ([channel, payload]: unknown[]) => (
          channel === INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE
          && (payload as Record<string, unknown> | undefined)?.ignore === false
        ),
      )
    ];
    const executeOrder = mockExecuteTool.mock.invocationCallOrder[0];
    expect(enableOrder).toBeLessThan(executeOrder);
    expect(executeOrder).toBeLessThan(disableOrder);
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

  test('keeps chat pill visible for screenshot bundles when dashboard is closed', async () => {
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
    expect(invokeCalls).toContainEqual([INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY]);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.SHOW_CHATBOX)).toBe(false);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.HIDE_CHATBOX)).toBe(false);
    expect(mockExecuteToolBundle).toHaveBeenCalledWith(
      [
        { toolName: 'read_file', args: { file_path: '/tmp/a' } },
        { toolName: 'screenshot', args: {} },
      ],
      'bundle-computer-tool',
    );
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.SHOW_CHATBOX)).toBe(false);
  });

  test('keeps chat pill visible for switch_tab-only bundles without focus verification', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-bundle',
      payload: {
        bundle_id: 'bundle-switch-tab',
        tools: [
          { name: 'switch_tab', args: { tab_name: 'Editor' } },
        ],
      },
    });

    expect(mockExecuteToolBundle).toHaveBeenCalledWith(
      [
        { toolName: 'switch_tab', args: { tab_name: 'Editor' } },
      ],
      'bundle-switch-tab',
    );
    const invokeCalls = (IpcBridge.invoke as jest.Mock).mock.calls;
    expect(invokeCalls).toContainEqual([INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY]);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.SHOW_CHATBOX)).toBe(false);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.HIDE_CHATBOX)).toBe(false);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS)).toBe(false);
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
    expect(invokeCalls).toContainEqual([INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY]);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.SHOW_CHATBOX)).toBe(false);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.HIDE_CHATBOX)).toBe(false);
    expect(invokeCalls.findIndex(([channel]: unknown[]) => channel === INVOKE_CHANNELS.HIDE_CHATBOX)).toBe(-1);
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
        tool_name: 'click',
        parameters: { x: 444, y: 222 },
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
      toolName: 'click',
      correlationId: 'req-focus-fail',
      success: false,
    }));
    expect(lastMessage?.text).toContain('frontend_execution_surface_unavailable: external_window_focus_not_verified');
    expect(recordToolMessage).toHaveBeenCalledWith(
      expect.stringContaining('frontend_execution_surface_unavailable: external_window_focus_not_verified'),
      expect.objectContaining({
        messageType: 'tool-output',
        toolName: 'click',
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
          { name: 'click', args: { x: 444, y: 222 } },
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
