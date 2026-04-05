import { act } from '@testing-library/react';

import {
  IpcBridge,
  INVOKE_CHANNELS,
  ON_CHANNELS,
  emitBackendEventAsync,
  getRemoveListenerMock,
  mockExecuteTool,
  mockExecuteToolBundle,
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
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([]);
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
      INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT,
      expect.anything(),
    );
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
    ]);
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
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([]);
    expect(IpcBridge.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT,
      expect.anything(),
    );
    expect(IpcBridge.invoke).not.toHaveBeenCalledWith(
      'prepare-overlay-tool-focus',
      expect.anything(),
    );
  });

  test('hides and restores the active surface for switch_window tool-call when dashboard is closed', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-switch-window',
      payload: {
        tool_name: 'switch_window',
        parameters: { tab_name: 'Editor' },
        request_id: 'req-switch-window',
      },
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'switch_window',
      { tab_name: 'Editor' },
      { correlationId: 'req-switch-window', skipAutoCapture: false },
    );
    const invokeCalls = (IpcBridge.invoke as jest.Mock).mock.calls;
    expect(invokeCalls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
      [INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT, { hiddenSurface: 'chatbox' }],
    ]);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === 'prepare-overlay-tool-focus')).toBe(false);
  });

  test('hands off dashboard to pill before screenshot tool-call when dashboard is open', async () => {
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY) {
        return { success: true, data: { visible: true } };
      }
      if (channel === INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT) {
        return {
          success: true,
          waitMs: 0,
          settleMs: 120,
          waitTime: 0,
          hideInvokeTime: 0.001,
          settleTime: 0.12,
          hiddenSurface: 'chatbox',
        };
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
    const firstExecuteCall = mockExecuteTool.mock.calls[0];
    if (!firstExecuteCall) {
      throw new Error('executeTool was not called for screenshot tool-call');
    }
    if (firstExecuteCall[0] !== 'screenshot') {
      throw new Error(`unexpected tool execution target: ${String(firstExecuteCall[0])}`);
    }
    if (JSON.stringify(firstExecuteCall[1]) !== '{}') {
      throw new Error(`unexpected screenshot args: ${JSON.stringify(firstExecuteCall[1])}`);
    }
    if (firstExecuteCall[2]?.correlationId !== 'req-screenshot-dashboard-open') {
      throw new Error(`unexpected correlation id: ${String(firstExecuteCall[2]?.correlationId)}`);
    }
    if (firstExecuteCall[2]?.skipAutoCapture !== false) {
      throw new Error(`unexpected skipAutoCapture: ${String(firstExecuteCall[2]?.skipAutoCapture)}`);
    }
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.HANDOFF_SURFACE_FOR_COMPUTER_USE, {}],
      [INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
      [INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT, { hiddenSurface: 'chatbox' }],
    ]);
  });

  test('hands off dashboard to pill for interactive tool-call when dashboard is open', async () => {
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
    expect(invokeCalls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.HANDOFF_SURFACE_FOR_COMPUTER_USE, {}],
    ]);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT)).toBe(false);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === INVOKE_CHANNELS.SHOW_CHATBOX)).toBe(false);
  });

  test('keeps renderer-side overlay IPC disabled around interactive tool execution window', async () => {
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
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
    ]);
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

  test('hides and restores the active surface for screenshot bundles when dashboard is closed', async () => {
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
    expect(invokeCalls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
      [INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT, { hiddenSurface: 'chatbox' }],
    ]);
    expect(mockExecuteToolBundle).toHaveBeenCalledWith(
      [
        { toolName: 'read_file', args: { file_path: '/tmp/a' } },
        { toolName: 'screenshot', args: {} },
      ],
      'bundle-computer-tool',
    );
  });

  test('hides and restores the active surface for switch_window-only bundles without focus verification', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-bundle',
      payload: {
        bundle_id: 'bundle-switch-window',
        tools: [
          { name: 'switch_window', args: { tab_name: 'Editor' } },
        ],
      },
    });

    expect(mockExecuteToolBundle).toHaveBeenCalledWith(
      [
        { toolName: 'switch_window', args: { tab_name: 'Editor' } },
      ],
      'bundle-switch-window',
    );
    const invokeCalls = (IpcBridge.invoke as jest.Mock).mock.calls;
    expect(invokeCalls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
      [INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT, { hiddenSurface: 'chatbox' }],
    ]);
    expect(invokeCalls.some(([channel]: unknown[]) => channel === 'prepare-overlay-tool-focus')).toBe(false);
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

  test('dispatches screenshot tool-call with active-surface capture prep', async () => {
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
    expect(invokeCalls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
      [INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT, { hiddenSurface: 'chatbox' }],
    ]);
  });

  test('keeps interactive tool-call executable without focus verification IPC', async () => {
    renderToolRunner(true);
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (
        channel === INVOKE_CHANNELS.SHOW_CHATBOX
        || channel === INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT
        || channel === INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT
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

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'click',
      { x: 444, y: 222 },
      { correlationId: 'req-focus-fail', skipAutoCapture: false },
    );
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
    ]);
    expect(IpcBridge.send).not.toHaveBeenCalled();
    expect(useChatStore.getState().messages).toEqual([]);
  });

  test('keeps interactive tool bundles executable without focus verification IPC', async () => {
    renderToolRunner(true);
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (
        channel === INVOKE_CHANNELS.SHOW_CHATBOX
        || channel === INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT
        || channel === INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT
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

    expect(mockExecuteToolBundle).toHaveBeenCalledWith(
      [
        { toolName: 'click', args: { x: 444, y: 222 } },
        { toolName: 'read_file', args: { file_path: '/tmp/a' } },
      ],
      'bundle-focus-fail',
    );
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
    ]);
    expect(IpcBridge.send).not.toHaveBeenCalled();
    expect(useChatStore.getState().messages).toEqual([]);
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

  test('skips frontend execution for direct-tool validation-failure metadata', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-skip-computer-use-validation-failed',
      payload: {
        tool_name: 'mouse_control',
        parameters: { action: 'click', x: 100, y: 200 },
        metadata: {
          llm_tool_call_validation_failed: true,
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
      await emitBackendEventAsync({ type: 'tool-call', payload: { tool_name: 'read_file', parameters: [] } });
      await emitBackendEventAsync({ type: 'tool-bundle', payload: { tools: 'not-an-array' } });
      await emitBackendEventAsync({ type: 'tool-bundle', payload: { tools: [{ name: '', args: {} }] } });
    });

    expect(mockExecuteTool).not.toHaveBeenCalled();
    expect(mockExecuteToolBundle).not.toHaveBeenCalled();
  });
});
