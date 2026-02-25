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
});
