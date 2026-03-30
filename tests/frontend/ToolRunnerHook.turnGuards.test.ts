import {
  IpcBridge,
  SEND_CHANNELS,
  emitBackendEventAsync,
  mockExecuteTool,
  mockExecuteToolBundle,
  renderToolRunner,
  resetToolRunnerTestState,
  restoreToolRunnerMocks,
  setStreamTracking,
  useChatStore,
} from './ToolRunnerHook.testUtils';

describe('useToolRunner stale turn guards', () => {
  beforeEach(() => {
    resetToolRunnerTestState();
  });

  afterEach(() => {
    restoreToolRunnerMocks();
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

  test('keeps same-turn tool-call events during terminal handoff when an incomplete assistant placeholder is present', async () => {
    useChatStore.setState((state) => ({
      ...state,
      isSending: true,
      messages: [
        {
          id: 'assistant-placeholder',
          sender: 'assistant',
          text: '',
          type: 'llm-text',
          isComplete: false,
          turnRef: 'turn-1',
          sourceEventType: 'streaming-response',
        },
      ],
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          isSending: true,
          messages: [
            {
              id: 'assistant-placeholder',
              sender: 'assistant',
              text: '',
              type: 'llm-text',
              isComplete: false,
              turnRef: 'turn-1',
              sourceEventType: 'streaming-response',
            },
          ],
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-1',
            phase: 'complete',
          },
        },
      },
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-1',
        phase: 'complete',
      },
    }));

    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-id-allowed',
      turn_ref: 'turn-1',
      payload: {
        tool_name: 'read_file',
        parameters: { file_path: '/tmp/a' },
        correlation_id: 'corr-allowed',
      },
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'read_file',
      { file_path: '/tmp/a' },
      expect.objectContaining({
        correlationId: 'corr-allowed',
      }),
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

  test('stale-turn guard still cancels skipped direct-tool validation failures', async () => {
    setStreamTracking({
      activeTurnRef: 'turn-active',
      phase: 'streaming',
    });

    renderToolRunner(true);

    await emitBackendEventAsync({
      type: 'tool-call',
      id: 'event-stale-skip-computer-use',
      turn_ref: 'turn-old',
      payload: {
        tool_name: 'mouse_control',
        parameters: { action: 'click', x: 100, y: 200 },
        request_id: 'req-stale-skip-computer-use',
        metadata: {
          llm_tool_call_validation_failed: true,
          skip_frontend_execution: true,
        },
      },
    });

    expect(mockExecuteTool).not.toHaveBeenCalled();
    expect(IpcBridge.send).toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      {
        type: 'tool-result',
        payload: {
          request_id: 'req-stale-skip-computer-use',
          success: false,
          data: null,
          error: 'frontend_stale_turn_cancelled',
        },
      },
    );
  });
});
