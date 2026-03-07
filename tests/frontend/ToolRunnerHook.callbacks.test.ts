import { act } from '@testing-library/react';

import {
  IpcBridge,
  SEND_CHANNELS,
  emitBackendEvent,
  emitBackendEventAsync,
  getCapturedServiceCallbacks,
  getToolExecutionServiceMock,
  mockExecuteTool,
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

    callbacks.sendToBackend({ type: 'query', payload: { ok: true } });
    const sendCalls = (IpcBridge.send as jest.Mock).mock.calls;
    expect(sendCalls.at(-1)).toEqual([
      SEND_CHANNELS.TO_BACKEND,
      { type: 'query', payload: { ok: true } },
    ]);

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

  test('keeps inline screenshot on tool-output rows when artifact upload fallback is used', () => {
    renderToolRunner(true);

    act(() => {
      emitBackendEvent({
        type: 'tool-call',
        id: 'event-track-corr-inline-shot',
        payload: {
          tool_name: 'mouse_control',
          parameters: { action: 'click', x: 1, y: 2 },
          correlation_id: 'corr-inline-shot',
        },
      });
    });

    const callbacks = getCapturedServiceCallbacks();
    callbacks.onToolResult({
      toolName: 'mouse_control',
      result: { success: true, data: { metadata: {} }, error: null },
      executionTime: 0.1,
      correlationId: 'corr-inline-shot',
      formattedMessage: 'clicked',
      screenshot: 'inline-shot',
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: 'image/png',
    });

    const lastMessage = useChatStore.getState().messages.at(-1);
    expect(lastMessage).toEqual(expect.objectContaining({
      type: 'tool-output',
      toolName: 'mouse_control',
      screenshot: 'inline-shot',
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: 'image/png',
    }));
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

  test('drops late bundled tool results after active turn is stopped/completed', async () => {
    setStreamTracking({
      activeTurnRef: 'turn-stop-bundle',
      phase: 'streaming',
    });

    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-bundle',
      turn_ref: 'turn-stop-bundle',
      payload: {
        bundle_id: 'bundle-stop',
        tools: [
          { name: 'read_file', args: { file_path: '/tmp/a' } },
        ],
      },
    });

    await act(async () => {
      setStreamTracking({
        activeTurnRef: 'turn-stop-bundle',
        phase: 'complete',
      });
      await Promise.resolve();
    });

    const messagesBefore = useChatStore.getState().messages.length;
    (IpcBridge.send as jest.Mock).mockClear();
    (recordToolMessage as jest.Mock).mockClear();

    const callbacks = getCapturedServiceCallbacks();

    await act(async () => {
      callbacks.onBundleResult({
        formattedMessage: 'bundle should be dropped',
        screenshotRef: null,
        screenshotUrl: null,
        totalTime: 0.2,
        correlationId: 'bundle-stop',
        results: [
          { tool_name: 'read_file', success: true, error: null },
        ],
      });
    });

    callbacks.sendToBackend({
      type: 'tool-bundle-result',
      payload: {
        bundle_id: 'bundle-stop',
        status: 'success',
        step_results: [],
        error: null,
      },
    });

    expect(useChatStore.getState().messages.length).toBe(messagesBefore);
    expect(recordToolMessage).not.toHaveBeenCalled();
    expect(IpcBridge.send).not.toHaveBeenCalled();
  });

  test('drops correlated backend payloads after executeTool failure untracks the request', async () => {
    mockExecuteTool.mockRejectedValueOnce(new Error('tool-failed'));
    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-track-corr-failed',
      payload: {
        tool_name: 'read_file',
        parameters: { file_path: '/tmp/a' },
        correlation_id: 'corr-failed',
      },
    });

    await act(async () => {
      await Promise.resolve();
    });

    const callbacks = getCapturedServiceCallbacks();
    callbacks.sendToBackend({
      type: 'tool-result',
      payload: { request_id: 'corr-failed', success: false, error: 'tool-failed', data: null },
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'read_file',
      { file_path: '/tmp/a' },
      { correlationId: 'corr-failed', skipAutoCapture: false },
    );
    expect(IpcBridge.send).not.toHaveBeenCalled();
  });

  test('drops late single-tool callbacks after conversation switches and prior turn is completed', async () => {
    act(() => {
      useChatStore.getState().setActiveConversationRef('conv-a');
      useChatStore.getState().updateStreamTracking((current) => ({
        ...current,
        activeTurnRef: 'turn-a',
        phase: 'streaming',
      }), 'conv-a');
    });

    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-conv-switch',
      conversation_ref: 'conv-a',
      turn_ref: 'turn-a',
      payload: {
        tool_name: 'read_file',
        parameters: { file_path: '/tmp/a' },
        correlation_id: 'corr-conv-switch',
      },
    });

    await act(async () => {
      useChatStore.getState().setActiveConversationRef('conv-b');
      useChatStore.getState().updateStreamTracking((current) => ({
        ...current,
        activeTurnRef: 'turn-a',
        phase: 'complete',
      }), 'conv-a');
      await Promise.resolve();
    });

    const messagesBefore = useChatStore.getState().messages.length;
    (recordToolMessage as jest.Mock).mockClear();
    (IpcBridge.send as jest.Mock).mockClear();

    const callbacks = getCapturedServiceCallbacks();

    await act(async () => {
      callbacks.onToolResult({
        toolName: 'read_file',
        result: { success: true, data: { metadata: {} }, error: null },
        executionTime: 0.1,
        correlationId: 'corr-conv-switch',
        formattedMessage: 'late result should be dropped',
        screenshotRef: null,
        screenshotUrl: null,
      });
    });

    callbacks.sendToBackend({
      type: 'tool-result',
      payload: { request_id: 'corr-conv-switch', success: true, data: {} },
    });

    expect(useChatStore.getState().messages.length).toBe(messagesBefore);
    expect(recordToolMessage).not.toHaveBeenCalled();
    expect(IpcBridge.send).not.toHaveBeenCalled();
  });

  test('drops backend payloads that carry unknown or stale correlation ids', () => {
    renderToolRunner(true);
    const callbacks = getCapturedServiceCallbacks();

    callbacks.sendToBackend({
      type: 'tool-result',
      payload: { request_id: 'untracked-correlation', success: true, data: {} },
    });
    callbacks.sendToBackend({
      type: 'tool-bundle-result',
      payload: { bundle_id: 'unknown-bundle', status: 'success', step_results: [] },
    });

    expect(IpcBridge.send).not.toHaveBeenCalled();
  });

  test('drops malformed correlated backend payloads that omit request or bundle ids', () => {
    renderToolRunner(true);
    const callbacks = getCapturedServiceCallbacks();

    callbacks.sendToBackend({
      type: 'tool-result',
      payload: { success: true, data: {} },
    });
    callbacks.sendToBackend({
      type: 'tool-bundle-result',
      payload: { status: 'success', step_results: [] },
    });

    expect(IpcBridge.send).not.toHaveBeenCalled();
  });

  test('drops malformed correlated backend payloads with whitespace-only ids', () => {
    renderToolRunner(true);
    const callbacks = getCapturedServiceCallbacks();

    callbacks.sendToBackend({
      type: 'tool-result',
      payload: { request_id: '   ', success: true, data: {} },
    });
    callbacks.sendToBackend({
      type: 'tool-bundle-result',
      payload: { bundle_id: ' \t ', status: 'success', step_results: [] },
    });

    expect(IpcBridge.send).not.toHaveBeenCalled();
  });

  test('accepts tracked backend payloads when envelope correlation id is padded', async () => {
    renderToolRunner(true);
    const callbacks = getCapturedServiceCallbacks();

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-track-corr-trim',
      payload: {
        tool_name: 'read_file',
        parameters: { file_path: '/tmp/a' },
        correlation_id: 'corr-trim',
      },
    });

    callbacks.sendToBackend({
      type: 'tool-result',
      payload: { request_id: '  corr-trim  ', success: true, data: {} },
    });

    expect(IpcBridge.send).toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      {
        type: 'tool-result',
        payload: { request_id: '  corr-trim  ', success: true, data: {} },
      },
    );

    (IpcBridge.send as jest.Mock).mockClear();
    callbacks.sendToBackend({
      type: 'tool-result',
      payload: { request_id: 'corr-trim', success: true, data: {} },
    });

    expect(IpcBridge.send).not.toHaveBeenCalled();
  });

  test('accepts tracked bundled payloads when envelope bundle id is padded', async () => {
    renderToolRunner(true);
    const callbacks = getCapturedServiceCallbacks();

    await emitBackendEventAsync({
      type: 'tool-bundle',
      payload: {
        bundle_id: 'bundle-trim',
        tools: [
          { name: 'read_file', args: { file_path: '/tmp/a' } },
        ],
      },
    });

    callbacks.sendToBackend({
      type: 'tool-bundle-result',
      payload: {
        bundle_id: '  bundle-trim  ',
        status: 'success',
        step_results: [],
        error: null,
      },
    });

    expect(IpcBridge.send).toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      {
        type: 'tool-bundle-result',
        payload: {
          bundle_id: '  bundle-trim  ',
          status: 'success',
          step_results: [],
          error: null,
        },
      },
    );

    (IpcBridge.send as jest.Mock).mockClear();
    callbacks.sendToBackend({
      type: 'tool-bundle-result',
      payload: {
        bundle_id: 'bundle-trim',
        status: 'success',
        step_results: [],
        error: null,
      },
    });

    expect(IpcBridge.send).not.toHaveBeenCalled();
  });
});
