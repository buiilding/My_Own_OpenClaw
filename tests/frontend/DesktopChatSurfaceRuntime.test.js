import {
  DesktopChatSurfaceRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopChatSurfaceRuntime';

const {
  buildChatSurfaceControllerState,
  buildChatSurfaceControllerStateFromSurfaceState,
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
      sdkLiveTurn: {
        conversationRef: 'conv-stale',
        turnRef: 'turn-stale',
        phase: 'complete',
      },
      messages: [
        {
          id: 'stale-assistant',
          sender: 'assistant',
          type: 'llm-text',
          text: 'stale renderer answer',
        },
      ],
    });

    expect(state).toMatchObject({
      isBusy: true,
      canStop: true,
      liveTurnPhase: 'streaming',
      liveTurnSource: 'conversation-view',
    });
    expect(state.visibleTurnLifecycle.conversationRef).toBe('conv-1');
    expect(state.visibleTurnLifecycle.turnRef).toBe('turn-1');
    expect(state.currentTurnPresentationState.activeResponse).toBeNull();
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

  test('does not allow SDK live-turn fallback alone to enable stop', () => {
    const state = buildChatSurfaceControllerState({
      sdkLiveTurn: {
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

  test('projects controller state from a selected chat surface object', () => {
    const state = buildChatSurfaceControllerStateFromSurfaceState({
      conversationViewSurface: 'dashboard',
      sessionConversationRef: 'conv-session',
      chatSurfaceState: {
        conversationView: {
          conversationRef: 'conv-view',
          liveTurn: {
            turnRef: 'turn-view',
            phase: 'streaming',
            canStop: true,
          },
          surfaces: {
            dashboard: {
              mode: 'busy',
            },
          },
        },
        sdkLiveTurn: {
          conversationRef: 'conv-raw',
          turnRef: 'turn-raw',
          phase: 'complete',
        },
        pendingTurn: null,
        messages: [{
          id: 'raw-message',
          sender: 'assistant',
          text: 'raw fallback',
        }],
      },
    });

    expect(state).toMatchObject({
      isBusy: true,
      canStop: true,
      liveTurnSource: 'conversation-view',
    });
    expect(state.visibleTurnLifecycle).toMatchObject({
      conversationRef: 'conv-view',
      turnRef: 'turn-view',
    });
    expect(state.currentTurnPresentationState.activeResponse).toBeNull();
  });

  test('surface-state adapter strips raw rows before controller projection under ConversationView', () => {
    const state = buildChatSurfaceControllerStateFromSurfaceState({
      conversationViewSurface: 'dashboard',
      sessionConversationRef: 'conv-session',
      chatSurfaceState: {
        conversationView: {
          conversationRef: 'conv-view',
          liveTurn: {
            turnRef: 'turn-view',
            phase: 'complete',
            canStop: false,
            entries: [],
          },
          surfaces: {
            dashboard: {
              mode: 'idle',
            },
          },
        },
        sdkLiveTurn: {
          conversationRef: 'conv-raw',
          turnRef: 'turn-raw',
          phase: 'streaming',
          assistantText: 'stale raw answer',
        },
        messages: [{
          id: 'raw-assistant',
          sender: 'assistant',
          type: 'llm-text',
          text: 'stale raw answer',
        }],
      },
    });

    expect(state).toMatchObject({
      isBusy: false,
      canStop: false,
      liveTurnSource: 'conversation-view',
    });
    expect(state.visibleTurnLifecycle).toMatchObject({
      conversationRef: 'conv-view',
      turnRef: 'turn-view',
      status: 'terminal',
    });
    expect(state.currentTurnPresentationState.activeResponse).toBeNull();
    expect(state.currentTurnPresentationState.visibleResponse).toBeNull();
  });
});
