import { act } from '@testing-library/react';

import {
  IpcBridge,
  ON_CHANNELS,
  SEND_CHANNELS,
  emitBackendEventAsync,
  getRemoveListenerMock,
  mockExecuteTool,
  mockExecuteToolBundle,
  renderToolRunner,
  resetToolRunnerTestState,
  restoreToolRunnerMocks,
  setStreamTracking,
} from './ToolRunnerHook.testUtils';
import { TOOL_GHOST_CLICK_SYNC_DELAY_MS } from '../../frontend/src/renderer/features/chat/constants/toolGhostRuntime';

async function assertDelayedClickToolCall({
  eventId,
  requestId,
  toolName,
  parameters,
}) {
  await emitBackendEventAsync({
    type: 'tool-call',
    id: eventId,
    payload: {
      tool_name: toolName,
      parameters,
      request_id: requestId,
    },
  });

  expect(mockExecuteTool).not.toHaveBeenCalled();

  await act(async () => {
    jest.advanceTimersByTime(TOOL_GHOST_CLICK_SYNC_DELAY_MS - 1);
    await Promise.resolve();
  });
  expect(mockExecuteTool).not.toHaveBeenCalled();

  await act(async () => {
    jest.advanceTimersByTime(1);
    await Promise.resolve();
  });

  expect(mockExecuteTool).toHaveBeenCalledWith(
    toolName,
    parameters,
    { correlationId: requestId, skipAutoCapture: false },
  );
}

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
  ])('delays $caseName execution until ghost preview sync window completes', async ({
    eventId,
    requestId,
    toolName,
    parameters,
  }) => {
    jest.useFakeTimers();
    try {
      renderToolRunner(true);
      await assertDelayedClickToolCall({
        eventId,
        requestId,
        toolName,
        parameters,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('ignores tool-call events for a completed active turn', async () => {
    setStreamTracking({
      activeTurnRef: 'turn-1',
      phase: 'complete',
    });

    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-id',
      turn_ref: 'turn-1',
      payload: {
        tool_name: 'read_file',
        parameters: { file_path: '/tmp/a' },
        correlation_id: 'corr-1',
      },
    });

    expect(mockExecuteTool).not.toHaveBeenCalled();
    expect(IpcBridge.send).toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      {
        type: 'tool-result',
        payload: {
          request_id: 'corr-1',
          success: false,
          data: null,
          error: 'frontend_stale_turn_cancelled',
        },
      },
    );
  });

  test('cancels delayed click tool-call if turn becomes stale before execution', async () => {
    jest.useFakeTimers();
    try {
      setStreamTracking({
        activeTurnRef: 'turn-1',
        phase: 'streaming',
      });

      renderToolRunner(true);

      await emitBackendEventAsync({
        type: 'tool-call',
        id: 'event-click-stale',
        turn_ref: 'turn-1',
        payload: {
          tool_name: 'mouse_control',
          parameters: { action: 'click', x: 10, y: 20 },
          request_id: 'req-click-stale',
        },
      });

      await act(async () => {
        setStreamTracking({
          activeTurnRef: 'turn-1',
          phase: 'complete',
        });
      });

      await act(async () => {
        jest.advanceTimersByTime(TOOL_GHOST_CLICK_SYNC_DELAY_MS);
        await Promise.resolve();
      });

      expect(mockExecuteTool).not.toHaveBeenCalled();
      expect(IpcBridge.send).toHaveBeenCalledWith(
        SEND_CHANNELS.TO_BACKEND,
        {
          type: 'tool-result',
          payload: {
            request_id: 'req-click-stale',
            success: false,
            data: null,
            error: 'frontend_stale_turn_cancelled',
          },
        },
      );
    } finally {
      jest.useRealTimers();
    }
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
  });

  test('ignores tool-bundle events from stale turns', async () => {
    setStreamTracking({
      activeTurnRef: 'turn-active',
      phase: 'streaming',
    });

    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-bundle',
      turn_ref: 'turn-old',
      payload: {
        bundle_id: 'bundle-abc',
        tools: [
          { name: 'read_file', args: { file_path: '/tmp/a' } },
        ],
      },
    });

    expect(mockExecuteToolBundle).not.toHaveBeenCalled();
    expect(IpcBridge.send).toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      {
        type: 'tool-bundle-result',
        payload: {
          bundle_id: 'bundle-abc',
          status: 'failure',
          step_results: [],
          error: 'frontend_stale_turn_cancelled',
        },
      },
    );
  });

  test('sends stale-turn cancellation when active turn was reset by new chat', async () => {
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-reset',
      turn_ref: 'turn-old',
      payload: {
        tool_name: 'read_file',
        parameters: { file_path: '/tmp/a' },
        request_id: 'req-old',
      },
    });

    expect(mockExecuteTool).not.toHaveBeenCalled();
    expect(IpcBridge.send).toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      {
        type: 'tool-result',
        payload: {
          request_id: 'req-old',
          success: false,
          data: null,
          error: 'frontend_stale_turn_cancelled',
        },
      },
    );
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
