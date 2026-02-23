import { act } from '@testing-library/react';

import {
  IpcBridge,
  SEND_CHANNELS,
  emitBackendEvent,
  emitBackendEventAsync,
  getCapturedServiceCallbacks,
  getToolExecutionServiceMock,
  recordToolMessage,
  renderToolRunner,
  renderToolRunnerWithProps,
  resetToolRunnerTestState,
  restoreToolRunnerMocks,
  setMockConfig,
  setStreamTracking,
  useChatStore,
} from './ToolRunnerHook.testUtils';

describe('useToolRunner callback wiring', () => {
  beforeEach(() => {
    resetToolRunnerTestState();
  });

  afterEach(() => {
    restoreToolRunnerMocks();
  });

  test('wires service callbacks to chat store and backend sender', () => {
    renderToolRunner(true);

    const callbacks = getCapturedServiceCallbacks();
    expect(callbacks).toEqual(
      expect.objectContaining({
        onToolResult: expect.any(Function),
        onBundleResult: expect.any(Function),
        sendToBackend: expect.any(Function),
      }),
    );

    callbacks.sendToBackend({ type: 'tool-result', payload: { ok: true } });
    expect(IpcBridge.send).toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      { type: 'tool-result', payload: { ok: true } },
    );

    act(() => {
      emitBackendEvent({
        type: 'tool-call',
        id: 'event-track-corr-2',
        payload: {
          tool_name: 'read_file',
          parameters: { file_path: '/tmp/a' },
          correlation_id: 'corr-2',
        },
      });
    });

    callbacks.onToolResult({
      toolName: 'read_file',
      result: { success: true, data: { metadata: { request_id: 'corr-2' } }, error: null },
      executionTime: 0.1,
      correlationId: 'corr-2',
      formattedMessage: 'formatted output',
      screenshotRef: 'artifact-1',
      screenshotUrl: '/api/artifacts/artifact-1',
    });

    const lastMessage = useChatStore.getState().messages.at(-1);
    expect(lastMessage).toEqual(
      expect.objectContaining({
        type: 'tool-output',
        text: 'formatted output',
        toolName: 'read_file',
        correlationId: 'corr-2',
        screenshotRef: 'artifact-1',
      }),
    );
    expect(recordToolMessage).toHaveBeenCalledWith(
      'formatted output',
      expect.objectContaining({
        messageType: 'tool-output',
        toolName: 'read_file',
        correlationId: 'corr-2',
      }),
    );
  });

  test('writes bundled tool results via onBundleResult callback', () => {
    renderToolRunner(true);

    act(() => {
      emitBackendEvent({
        type: 'tool-bundle',
        payload: {
          bundle_id: 'bundle-corr',
          tools: [
            { name: 'read_file', args: { file_path: '/tmp/a' } },
          ],
        },
      });
    });

    const callbacks = getCapturedServiceCallbacks();
    callbacks.onBundleResult({
      formattedMessage: 'bundle formatted output',
      screenshotRef: 'artifact-bundle',
      screenshotUrl: '/api/artifacts/artifact-bundle',
      totalTime: 0.5,
      correlationId: 'bundle-corr',
      results: [
        { tool_name: 'read_file', success: true, error: null },
      ],
    });

    const lastMessage = useChatStore.getState().messages.at(-1);
    expect(lastMessage).toEqual(
      expect.objectContaining({
        type: 'tool-output',
        toolName: 'bundled_tools (1 tools)',
      }),
    );
    expect(recordToolMessage).toHaveBeenCalledWith(
      'bundle formatted output',
      expect.objectContaining({
        toolName: 'bundled_tools',
        correlationId: 'bundle-corr',
      }),
    );
  });

  test('uses latest model metadata without recreating the tool execution service', () => {
    const ToolExecutionServiceMock = getToolExecutionServiceMock();

    const { rerender } = renderToolRunnerWithProps(true);

    expect(ToolExecutionServiceMock).toHaveBeenCalledTimes(1);

    setMockConfig({
      selected_model_id: 'updated-model',
      model_provider: 'updated-provider',
    });

    rerender({ enabled: true });

    expect(ToolExecutionServiceMock).toHaveBeenCalledTimes(1);

    act(() => {
      emitBackendEvent({
        type: 'tool-call',
        id: 'event-track-corr-config',
        payload: {
          tool_name: 'read_file',
          parameters: { file_path: '/tmp/a' },
          correlation_id: 'corr-config',
        },
      });
    });

    const callbacks = getCapturedServiceCallbacks();
    callbacks.onToolResult({
      toolName: 'read_file',
      result: { success: true, data: { metadata: {} }, error: null },
      executionTime: 0.1,
      correlationId: 'corr-config',
      formattedMessage: 'config-aware output',
      screenshotRef: null,
      screenshotUrl: null,
    });

    expect(recordToolMessage).toHaveBeenCalledWith(
      'config-aware output',
      expect.objectContaining({
        modelId: 'updated-model',
        modelProvider: 'updated-provider',
      }),
    );
  });

  test('drops late tool results after active turn is stopped/completed', async () => {
    setStreamTracking({
      activeTurnRef: 'turn-stop',
      phase: 'streaming',
    });

    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-track-corr-stop',
      turn_ref: 'turn-stop',
      payload: {
        tool_name: 'read_file',
        parameters: { file_path: '/tmp/a' },
        correlation_id: 'corr-stop',
      },
    });

    await act(async () => {
      setStreamTracking({
        activeTurnRef: 'turn-stop',
        phase: 'complete',
      });
      await Promise.resolve();
    });

    const messagesBefore = useChatStore.getState().messages.length;
    (IpcBridge.send as jest.Mock).mockClear();
    (recordToolMessage as jest.Mock).mockClear();

    const callbacks = getCapturedServiceCallbacks();

    await act(async () => {
      callbacks.onToolResult({
        toolName: 'read_file',
        result: { success: true, data: { metadata: {} }, error: null },
        executionTime: 0.1,
        correlationId: 'corr-stop',
        formattedMessage: 'should be dropped',
        screenshotRef: null,
        screenshotUrl: null,
      });
    });

    callbacks.sendToBackend({
      type: 'tool-result',
      payload: { request_id: 'corr-stop', success: true, data: {} },
    });

    expect(useChatStore.getState().messages.length).toBe(messagesBefore);
    expect(recordToolMessage).not.toHaveBeenCalled();
    expect(IpcBridge.send).not.toHaveBeenCalled();
  });
});
