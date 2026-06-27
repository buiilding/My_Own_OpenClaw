/**
 * Covers desktop chat stream tracking runtime. behavior in the frontend test suite.
 */

import {
  DesktopChatStreamTrackingRuntime,
} from '../../src/renderer/app/runtime/desktopChatStreamTrackingRuntime';
import type {
  StreamTracking,
} from '../../src/renderer/app/runtime/desktopChatStreamTrackingRuntime';

const { applyTrackingEvent } = DesktopChatStreamTrackingRuntime;
const { buildUpdateStreamTrackingStateUpdate } = DesktopChatStreamTrackingRuntime;
const { createInitialStreamTracking } = DesktopChatStreamTrackingRuntime;

function buildTracking(overrides: Partial<StreamTracking> = {}): StreamTracking {
  const seed: StreamTracking = {
    phase: 'idle',
    activeTurnRef: null,
    eventCount: 0,
    startedAt: null,
    lastEventAt: null,
    lastEventType: null,
    firstChunkAt: null,
    completedAt: null,
    chunkCount: 0,
    toolCallCount: 0,
    toolOutputCount: 0,
    lastChunkSize: 0,
    lastError: null,
  };
  return {
    ...seed,
    ...overrides,
  };
}

describe('DesktopChatStreamTrackingRuntime', () => {
  test('creates the idle stream tracking seed', () => {
    expect(createInitialStreamTracking()).toEqual({
      activeTurnRef: null,
      phase: 'idle',
      startedAt: null,
      firstChunkAt: null,
      completedAt: null,
      lastEventAt: null,
      lastEventType: null,
      eventCount: 0,
      chunkCount: 0,
      toolCallCount: 0,
      toolOutputCount: 0,
      lastChunkSize: 0,
      lastError: null,
    });
  });

  test('resetForTurn seeds a fresh tracking state', () => {
    const now = '2026-02-24T00:00:00.000Z';
    const next = applyTrackingEvent(
      buildTracking({
        activeTurnRef: 'old-turn',
        phase: 'streaming',
        eventCount: 12,
      }),
      'local-user-message',
      'turn-1',
      now,
      { resetForTurn: true },
    );
    expect(next).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-1',
        phase: 'awaiting-first-chunk',
        startedAt: now,
        firstChunkAt: null,
        eventCount: 1,
      }),
    );
  });

  test('streaming-response updates chunk counters and firstChunkAt', () => {
    const current = buildTracking({
      activeTurnRef: 'turn-1',
      phase: 'awaiting-first-chunk',
      eventCount: 1,
    });

    const next = applyTrackingEvent(
      current,
      'streaming-response',
      'turn-1',
      '2026-02-24T00:00:01.000Z',
      { chunkSize: 42 },
    );

    expect(next).toEqual(
      expect.objectContaining({
        phase: 'streaming',
        chunkCount: 1,
        lastChunkSize: 42,
        firstChunkAt: '2026-02-24T00:00:01.000Z',
        eventCount: 2,
      }),
    );
  });

  test('tool and completion events stamp counters and completedAt', () => {
    const current = buildTracking({
      activeTurnRef: 'turn-2',
      phase: 'streaming',
      eventCount: 2,
    });
    const withTool = applyTrackingEvent(
      current,
      'tool-call',
      'turn-2',
      '2026-02-24T00:00:02.000Z',
      { toolCall: true },
    );
    expect(withTool).toEqual(
      expect.objectContaining({
        phase: 'tool-call',
        toolCallCount: 1,
      }),
    );

    const completed = applyTrackingEvent(
      withTool,
      'streaming-complete',
      'turn-2',
      '2026-02-24T00:00:03.000Z',
      { phase: 'complete' },
    );
    expect(completed).toEqual(
      expect.objectContaining({
        phase: 'complete',
        completedAt: '2026-02-24T00:00:03.000Z',
      }),
    );
  });

  test('error updates terminal state and lastError', () => {
    const current = buildTracking({
      activeTurnRef: 'turn-3',
      phase: 'streaming',
      eventCount: 3,
    });

    const next = applyTrackingEvent(
      current,
      'error',
      'turn-3',
      '2026-02-24T00:00:04.000Z',
      { errorText: 'boom' },
    );

    expect(next).toEqual(
      expect.objectContaining({
        phase: 'error',
        lastError: 'boom',
        completedAt: '2026-02-24T00:00:04.000Z',
      }),
    );
  });

  test('buildUpdateStreamTrackingStateUpdate resolves workspace and applies updater result', () => {
    const state = {
      activeConversationRef: 'conv-1',
      workspaces: {
        'conv-1': {
          streamTracking: buildTracking({
            activeTurnRef: 'turn-1',
            phase: 'awaiting-first-chunk',
            eventCount: 1,
          }),
        },
      },
    };
    const deps = {
      buildWorkspaceUpdate: jest.fn((currentState, workspaceRef, nextWorkspace) => ({
        ...currentState,
        workspaces: {
          ...currentState.workspaces,
          [workspaceRef]: nextWorkspace,
        },
      })),
      readWorkspaceState: jest.fn((currentState, workspaceRef) => currentState.workspaces[workspaceRef]),
      resolveWorkspaceKey: jest.fn(() => 'conv-1'),
    };

    const nextState = buildUpdateStreamTrackingStateUpdate({
      conversationRef: 'conv-1',
      deps,
      state,
      updater: (current) => ({
        ...current,
        phase: 'streaming',
        eventCount: current.eventCount + 1,
      }),
    });

    expect(deps.resolveWorkspaceKey).toHaveBeenCalledWith('conv-1', 'conv-1');
    expect(deps.readWorkspaceState).toHaveBeenCalledWith(state, 'conv-1');
    expect(deps.buildWorkspaceUpdate).toHaveBeenCalledWith(
      state,
      'conv-1',
      expect.objectContaining({
        streamTracking: expect.objectContaining({
          phase: 'streaming',
          eventCount: 2,
        }),
      }),
    );
    expect(nextState).toEqual(expect.objectContaining({
      workspaces: {
        'conv-1': expect.objectContaining({
          streamTracking: expect.objectContaining({
            phase: 'streaming',
            eventCount: 2,
          }),
        }),
      },
    }));
  });

  test('buildUpdateStreamTrackingStateUpdate no-ops when updater returns same reference', () => {
    const streamTracking = buildTracking();
    const state = {
      activeConversationRef: 'conv-1',
      workspaces: {
        'conv-1': {
          streamTracking,
        },
      },
    };
    const deps = {
      buildWorkspaceUpdate: jest.fn(),
      readWorkspaceState: jest.fn((currentState, workspaceRef) => currentState.workspaces[workspaceRef]),
      resolveWorkspaceKey: jest.fn(() => 'conv-1'),
    };

    const nextState = buildUpdateStreamTrackingStateUpdate({
      deps,
      state,
      updater: (current) => current,
    });

    expect(nextState).toBeNull();
    expect(deps.buildWorkspaceUpdate).not.toHaveBeenCalled();
  });
});
