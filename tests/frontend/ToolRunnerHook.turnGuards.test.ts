import { act } from '@testing-library/react';

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
import { TOOL_GHOST_CLICK_SYNC_DELAY_MS } from '../../frontend/src/renderer/features/chat/constants/toolGhostRuntime';

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
