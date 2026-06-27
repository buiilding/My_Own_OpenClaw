import {
  DesktopConversationProjectionStreamRuntime,
} from '../../src/renderer/app/runtime/desktopConversationProjectionStreamRuntime';

const {
  applyCurrentTurnProjectionEvent,
  buildReplayProjectionTracePayload,
  normalizeTurnRef,
} = DesktopConversationProjectionStreamRuntime;

describe('DesktopConversationProjectionStreamRuntime', () => {
  test('normalizes turn refs', () => {
    expect(normalizeTurnRef(' turn-old ')).toBe('turn-old');
    expect(normalizeTurnRef('   ')).toBeNull();
  });

  test('builds replay trace payloads from workspace state', () => {
    expect(buildReplayProjectionTracePayload({
      action: 'sdk_current_turn_applied',
      conversationRef: 'conv-1',
      workspace: {
        messages: [{ id: 'm-1', sender: 'user', text: 'hello' }],
        pendingTurn: { turnRef: ' turn-new ' },
        sdkLiveTurn: {
          turnRef: 'turn-new',
          phase: 'streaming',
        },
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
        },
      },
      values: {
        newTurnRef: 'turn-new',
        oldTurnRef: 'turn-old',
      },
    })).toEqual(expect.objectContaining({
      action: 'sdk_current_turn_applied',
      conversationRef: 'conv-1',
      pendingTurnRef: 'turn-new',
      currentTurnRef: 'turn-new',
      streamActiveTurnRef: 'turn-new',
      pendingMatchesNewTurn: true,
      currentMatchesNewTurn: true,
      currentMatchesOldTurn: false,
      messageCount: 1,
    }));
  });

  test('builds replay trace payloads from ConversationView instead of stale raw state', () => {
    expect(buildReplayProjectionTracePayload({
      action: 'sdk_current_turn_applied',
      conversationRef: 'conv-1',
      workspace: {
        conversationView: {
          liveTurn: {
            turnRef: 'turn-view',
            phase: 'complete',
          },
          displayRows: [
            { id: 'view-user' },
            { id: 'view-assistant' },
          ],
        },
        messages: [{ id: 'stale-message', sender: 'user', text: 'stale' }],
        pendingTurn: { turnRef: 'turn-new' },
        sdkLiveTurn: {
          turnRef: 'turn-stale',
          phase: 'streaming',
        },
        streamTracking: {
          activeTurnRef: 'turn-stale',
          phase: 'streaming',
        },
      },
      values: {
        newTurnRef: 'turn-new',
        oldTurnRef: 'turn-view',
      },
    })).toEqual(expect.objectContaining({
      currentTurnRef: 'turn-view',
      currentTurnPhase: 'complete',
      streamActiveTurnRef: 'turn-view',
      currentMatchesOldTurn: true,
      currentMatchesNewTurn: false,
      displayRowCount: 2,
      messageCount: 0,
    }));
  });

  test('reports replay cleanup traces when current projection still points at the old turn', () => {
    expect(buildReplayProjectionTracePayload({
      action: 'sdk_replay_after_cleanup',
      conversationRef: 'conv-1',
      workspace: {
        messages: [],
        pendingTurn: { turnRef: 'turn-new' },
        sdkLiveTurn: {
          turnRef: 'turn-old',
          phase: 'completed',
        },
        streamTracking: {
          activeTurnRef: 'turn-old',
          phase: 'completed',
        },
      },
      values: {
        newTurnRef: 'turn-new',
        oldTurnRef: 'turn-old',
      },
    })).toEqual(expect.objectContaining({
      action: 'sdk_replay_after_cleanup',
      conversationRef: 'conv-1',
      pendingTurnRef: 'turn-new',
      currentTurnRef: 'turn-old',
      pendingMatchesNewTurn: true,
      currentMatchesNewTurn: false,
      currentMatchesOldTurn: true,
    }));
  });

  test('applies accepted current-turn projection events through runtime side effects', () => {
    const deps = {
      getWorkspaceState: jest.fn(() => ({
        messages: [],
        pendingTurn: null,
        sdkLiveTurn: {
          turnRef: 'turn-1',
          phase: 'streaming',
        },
        streamTracking: {
          activeTurnRef: 'turn-1',
          phase: 'streaming',
        },
      })),
      setNoViewSdkLiveTurn: jest.fn(),
      setIsSending: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      updateStreamTracking: jest.fn((updater) => updater({})),
    };
    const projectionCursors = new Map();

    applyCurrentTurnProjectionEvent({
      conversationRef: 'conv-1',
      currentTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        phase: 'streaming',
        assistantText: 'hello',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
        presentation: {
          entries: [
            {
              id: 'entry-assistant',
              type: 'llm-text',
              text: 'hello',
            },
          ],
        },
      },
      deps,
      projectionCursors,
    });

    expect(deps.setNoViewSdkLiveTurn).toHaveBeenCalledWith(
      expect.objectContaining({ turnRef: 'turn-1' }),
      'conv-1',
    );
    expect(deps.setIsSending).toHaveBeenCalledWith(false, 'conv-1');
    expect(deps.updateStreamTracking).toHaveBeenCalled();
    expect(projectionCursors.size).toBe(1);
  });

  test('does not expose a display-row stream writer', () => {
    expect(DesktopConversationProjectionStreamRuntime).not.toHaveProperty(
      'applyDisplayRowsProjectionEvent',
    );
    expect(DesktopConversationProjectionStreamRuntime).not.toHaveProperty(
      'buildDisplayRowsProjection',
    );
  });
});
