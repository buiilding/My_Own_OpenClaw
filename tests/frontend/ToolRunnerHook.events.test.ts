import { act } from '@testing-library/react';

import {
  IpcBridge,
  ON_CHANNELS,
  emitBackendEventAsync,
  getRemoveListenerMock,
  mockExecuteTool,
  mockExecuteToolBundle,
  renderToolRunner,
  resetToolRunnerTestState,
  restoreToolRunnerMocks,
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
