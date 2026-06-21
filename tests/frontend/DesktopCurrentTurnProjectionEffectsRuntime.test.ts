/**
 * Covers SDK current-turn projection side effects for chat UI state.
 */

import type { CurrentTurnProjectionEffectsInput } from '../../frontend/src/renderer/app/runtime/desktopCurrentTurnProjectionEffectsRuntime';
import { DesktopCurrentTurnProjectionEffectsRuntime } from '../../frontend/src/renderer/app/runtime/desktopCurrentTurnProjectionEffectsRuntime';

const {
  applyCurrentTurnProjectionSideEffects,
  createProjectionCursor,
} = DesktopCurrentTurnProjectionEffectsRuntime;

function projection(
  overrides: Partial<CurrentTurnProjectionEffectsInput> = {},
): CurrentTurnProjectionEffectsInput {
  return {
    conversationRef: 'conv-1',
    turnRef: 'turn-1',
    phase: 'awaiting',
    userMessageRowId: null,
    assistantText: '',
    reasoningText: '',
    toolEvents: [],
    lastError: null,
    presentation: {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'awaiting',
      entries: [],
      hasVisibleContent: false,
      typingVisible: true,
      overlayVisible: false,
      isBusy: true,
      isTerminal: false,
      lastError: null,
      awaitingAnchor: null,
      overlayIntent: {
        visible: false,
        mode: 'awaiting',
        turnRef: 'turn-1',
        conversationRef: 'conv-1',
        staleGuardRef: 'turn-1',
      },
    },
    ...overrides,
  };
}

function createDeps() {
  return {
    getWorkspaceState: jest.fn(() => ({ thinkingStatus: null })),
    setIsSending: jest.fn(),
    setThinkingStatus: jest.fn(),
    setThinkingSourceEventType: jest.fn(),
    updateStreamTracking: jest.fn(),
    recordTrackingEvent: jest.fn(),
  };
}

describe('current turn projection side effects', () => {
  test('records accepted and streaming deltas without duplicating already-seen text', () => {
    const deps = createDeps();

    const awaitingCursor = applyCurrentTurnProjectionSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection(),
      cursor: createProjectionCursor(),
      deps,
    });

    expect(deps.setIsSending).toHaveBeenCalledWith(true, 'conv-1');
    expect(deps.recordTrackingEvent).toHaveBeenCalledWith(
      deps.updateStreamTracking,
      'query-accepted',
      'turn-1',
      { phase: 'awaiting-first-chunk', resetForTurn: true },
      'conv-1',
    );

    deps.recordTrackingEvent.mockClear();
    const streamingCursor = applyCurrentTurnProjectionSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection({
        phase: 'streaming',
        assistantText: 'hello',
        presentation: {
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          phase: 'streaming',
          entries: [],
          hasVisibleContent: true,
          typingVisible: false,
          overlayVisible: true,
          isBusy: true,
          isTerminal: false,
          lastError: null,
          awaitingAnchor: null,
          overlayIntent: {
            visible: true,
            mode: 'response',
            turnRef: 'turn-1',
            conversationRef: 'conv-1',
            staleGuardRef: 'turn-1',
          },
        },
      }),
      cursor: awaitingCursor,
      deps,
    });

    expect(deps.recordTrackingEvent).toHaveBeenCalledWith(
      deps.updateStreamTracking,
      'streaming-response',
      'turn-1',
      { phase: 'streaming', chunkSize: 5 },
      'conv-1',
    );

    deps.recordTrackingEvent.mockClear();
    applyCurrentTurnProjectionSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection({
        phase: 'streaming',
        assistantText: 'hello',
        presentation: {
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          phase: 'streaming',
          entries: [],
          hasVisibleContent: true,
          typingVisible: false,
          overlayVisible: true,
          isBusy: true,
          isTerminal: false,
          lastError: null,
          awaitingAnchor: null,
          overlayIntent: {
            visible: true,
            mode: 'response',
            turnRef: 'turn-1',
            conversationRef: 'conv-1',
            staleGuardRef: 'turn-1',
          },
        },
      }),
      cursor: streamingCursor,
      deps,
    });

    expect(deps.recordTrackingEvent).not.toHaveBeenCalledWith(
      deps.updateStreamTracking,
      'streaming-response',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  test('deduplicates tool events and preserves execution-skipped typing state', () => {
    const deps = createDeps();
    const cursor = applyCurrentTurnProjectionSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection({
        phase: 'tool_call',
        toolEvents: [{
          id: 'tool-1',
          kind: 'tool_call',
          toolName: 'read_file',
          text: 'Using read_file',
          executionSkipped: true,
          payload: {},
        }],
      }),
      cursor: createProjectionCursor(),
      deps,
    });

    expect(deps.recordTrackingEvent).toHaveBeenCalledWith(
      deps.updateStreamTracking,
      'tool-call',
      'turn-1',
      { phase: 'tool-call', toolCall: true },
      'conv-1',
    );
    expect(deps.setThinkingStatus).not.toHaveBeenCalledWith(null, 'conv-1');

    deps.recordTrackingEvent.mockClear();
    applyCurrentTurnProjectionSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection({
        phase: 'tool_call',
        toolEvents: [{
          id: 'tool-1',
          kind: 'tool_call',
          toolName: 'read_file',
          text: 'Using read_file',
          payload: {},
        }],
      }),
      cursor,
      deps,
    });

    expect(deps.recordTrackingEvent).not.toHaveBeenCalled();
  });
});
