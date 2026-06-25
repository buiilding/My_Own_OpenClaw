import {
  DesktopChatSurfaceRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopChatSurfaceRuntime';

const {
  buildChatSurfaceControllerState,
} = DesktopChatSurfaceRuntime;

describe('DesktopChatSurfaceRuntime', () => {
  test('reads busy and stop affordance from ConversationView surface state', () => {
    const state = buildChatSurfaceControllerState({
      conversationViewSurface: 'dashboard',
      conversationView: {
        conversationRef: 'conv-1',
        liveTurn: {
          turnRef: 'turn-1',
          phase: 'streaming',
          canStop: true,
          isBusy: true,
          entries: [],
        },
        surfaces: {
          dashboard: {
            mode: 'busy',
          },
        },
      },
      currentTurnProjection: {
        conversationRef: 'conv-stale',
        turnRef: 'turn-stale',
        phase: 'complete',
      },
      messages: [],
    });

    expect(state).toMatchObject({
      isBusy: true,
      canStop: true,
      liveTurnPhase: 'streaming',
      liveTurnSource: 'conversation-view',
    });
  });

  test('keeps renderer pending bridge busy and stoppable before SDK view exists', () => {
    const state = buildChatSurfaceControllerState({
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-pending',
        text: 'hello',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
      sessionConversationRef: 'conv-1',
      messages: [],
    });

    expect(state).toMatchObject({
      isBusy: true,
      canStop: true,
      liveTurnSource: 'pending-turn',
    });
    expect(state.visibleTurnLifecycle.status).toBe('local_pending');
  });

  test('does not allow raw current-turn projection alone to enable stop', () => {
    const state = buildChatSurfaceControllerState({
      currentTurnProjection: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        phase: 'streaming',
        presentation: {
          isBusy: true,
        },
      },
      sessionConversationRef: 'conv-1',
      messages: [],
    });

    expect(state.isBusy).toBe(false);
    expect(state.canStop).toBe(false);
    expect(state.liveTurnSource).not.toBe('conversation-view');
  });
});
