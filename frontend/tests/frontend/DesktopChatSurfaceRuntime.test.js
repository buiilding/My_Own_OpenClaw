import {
  DesktopChatSurfaceRuntime,
} from '../../src/renderer/app/runtime/desktopChatSurfaceRuntime';

const {
  buildChatSurfaceControllerState,
  buildChatSurfaceControllerStateFromSurfaceState,
} = DesktopChatSurfaceRuntime;

function buildConversationView(overrides = {}) {
  const conversationRef = overrides.conversationRef ?? 'conv-1';
  const liveTurn = overrides.liveTurn ?? {
    turnRef: null,
    phase: 'idle',
    canStop: false,
    isBusy: false,
    entries: [],
  };
  return {
    conversationRef,
    revisionId: overrides.revisionId ?? null,
    displayRows: overrides.displayRows ?? [],
    liveTurn,
    surfaces: {
      dashboard: { mode: 'idle' },
      pill: { mode: 'idle' },
      responseOverlay: {
        mode: 'hidden',
        visible: false,
        guardRef: null,
        ownerConversationRef: conversationRef,
        turnRef: null,
      },
      ...(overrides.surfaces ?? {}),
    },
    actions: {
      canEdit: false,
      canRetry: false,
      canFork: false,
      ...(overrides.actions ?? {}),
    },
  };
}

describe('DesktopChatSurfaceRuntime', () => {
  test('reads busy and stop affordance from ConversationView surface state', () => {
    const state = buildChatSurfaceControllerState({
      conversationViewSurface: 'dashboard',
      conversationView: buildConversationView({
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
      }),
      sdkLiveTurn: null,
      messages: [],
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

  test('does not repair malformed ConversationView dashboard surface modes into busy state', () => {
    for (const mode of [' busy ', 'working']) {
      const state = buildChatSurfaceControllerState({
        conversationViewSurface: 'dashboard',
        conversationView: buildConversationView({
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
              mode,
            },
          },
        }),
        messages: [{
          id: 'stale-raw-row',
          sender: 'assistant',
          text: 'stale',
        }],
        sdkLiveTurn: {
          conversationRef: 'conv-1',
          turnRef: 'turn-raw',
          phase: 'streaming',
        },
      });

      expect(state).toMatchObject({
        isBusy: false,
        canStop: true,
        liveTurnSource: 'conversation-view',
      });
      expect(state.visibleTurnLifecycle).toMatchObject({
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
      });
    }
  });

  test('requires exact SDK view stop target identity before enabling stop', () => {
    const state = buildChatSurfaceControllerState({
      conversationViewSurface: 'dashboard',
      conversationView: buildConversationView({
        conversationRef: 'conv-1',
        liveTurn: {
          turnRef: ' turn-1 ',
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
      }),
      messages: [],
      sdkLiveTurn: null,
    });

    expect(state).toMatchObject({
      isBusy: true,
      canStop: false,
      liveTurnSource: 'conversation-view',
    });
    expect(state.visibleTurnLifecycle).toMatchObject({
      conversationRef: 'conv-1',
      turnRef: null,
    });
  });

  test('keeps renderer pending bridge busy and stoppable before SDK view exists', () => {
    const state = buildChatSurfaceControllerState({
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-pending',
        userMessageId: 'user-pending',
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

    expect(state.isBusy).toBe(true);
    expect(state.canStop).toBe(false);
    expect(state.liveTurnSource).not.toBe('conversation-view');
  });

  test('does not repair malformed SDK live-turn conversation refs into no-view surface state', () => {
    const state = buildChatSurfaceControllerState({
      sessionConversationRef: 'conv-1',
      sdkLiveTurn: {
        conversationRef: ' conv-1 ',
        turnRef: 'turn-live',
        phase: 'streaming',
        presentation: {
          entries: [{
            id: 'live-entry',
            type: 'llm-text',
            text: 'live fallback answer',
          }],
        },
      },
      messages: [],
    });

    expect(state).toMatchObject({
      isBusy: false,
      canStop: false,
      liveTurnSource: 'idle',
    });
    expect(state.visibleTurnLifecycle).toMatchObject({
      status: 'idle',
      source: 'sdk',
      conversationRef: 'conv-1',
      turnRef: null,
    });
  });

  test('projects controller state from a selected chat surface object', () => {
    const state = buildChatSurfaceControllerStateFromSurfaceState({
      conversationViewSurface: 'dashboard',
      sessionConversationRef: 'conv-session',
      chatSurfaceState: {
        conversationView: buildConversationView({
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
        }),
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

  test('direct controller input blanks raw messages and SDK fallback under ConversationView', () => {
    const state = buildChatSurfaceControllerState({
      conversationViewSurface: 'dashboard',
      sessionConversationRef: 'conv-session',
      conversationView: buildConversationView({
        conversationRef: 'conv-view',
        liveTurn: null,
        surfaces: {
          dashboard: {
            mode: 'idle',
          },
        },
      }),
      pendingTurn: {
        conversationRef: 'conv-view',
        turnRef: 'turn-pending',
        userMessageId: 'user-pending',
        text: 'hello',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
      sdkLiveTurn: {
        conversationRef: 'conv-view',
        turnRef: 'turn-sdk',
        phase: 'streaming',
        assistantText: 'stale SDK fallback',
      },
      messages: [{
        id: 'stale-user',
        sender: 'user',
        text: 'stale raw user',
      }],
    });

    expect(state).toMatchObject({
      isBusy: true,
      canStop: true,
      liveTurnSource: 'pending-turn',
    });
    expect(state.visibleTurnLifecycle).toMatchObject({
      source: 'local',
      status: 'local_pending',
      awaitingAnchor: {
        kind: 'user-message',
        rowId: 'user-pending',
      },
      conversationRef: 'conv-view',
      turnRef: 'turn-pending',
    });
    expect(state.currentTurnPresentationState.activeResponse).toBeNull();
  });

  test('ignores unrelated pending bridge under ConversationView surface authority', () => {
    const state = buildChatSurfaceControllerState({
      conversationViewSurface: 'dashboard',
      sessionConversationRef: 'conv-session',
      conversationView: buildConversationView({
        conversationRef: 'conv-view',
        liveTurn: {
          turnRef: 'turn-view',
          phase: 'idle',
          canStop: false,
          isBusy: false,
          entries: [],
        },
        surfaces: {
          dashboard: {
            mode: 'idle',
          },
        },
      }),
      pendingTurn: {
        conversationRef: 'conv-other',
        turnRef: 'turn-pending',
        userMessageId: 'user-pending',
        text: 'hello',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
      sdkLiveTurn: null,
      messages: [],
    });

    expect(state).toMatchObject({
      isBusy: false,
      canStop: false,
      liveTurnSource: 'conversation-view',
    });
    expect(state.visibleTurnLifecycle).toMatchObject({
      source: 'conversation-view',
      status: 'idle',
      conversationRef: 'conv-view',
      turnRef: null,
    });
  });

  test('surface-state adapter consumes sanitized read-model rows under ConversationView', () => {
    const state = buildChatSurfaceControllerStateFromSurfaceState({
      conversationViewSurface: 'dashboard',
      sessionConversationRef: 'conv-session',
      chatSurfaceState: {
        conversationView: buildConversationView({
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
        }),
        sdkLiveTurn: null,
        messages: [],
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

  test('surface-state adapter leaves malformed ConversationView input on no-view fallback', () => {
    const state = buildChatSurfaceControllerStateFromSurfaceState({
      conversationViewSurface: 'dashboard',
      sessionConversationRef: 'conv-1',
      chatSurfaceState: {
        conversationView: {
          conversationRef: 'conv-1',
          displayRows: [],
          liveTurn: [],
          surfaces: {
            dashboard: {
              mode: 'busy',
            },
          },
          actions: {},
        },
        sdkLiveTurn: {
          conversationRef: 'conv-1',
          turnRef: 'turn-live',
          phase: 'streaming',
          presentation: {
            isBusy: true,
            entries: [{
              id: 'live-entry',
              type: 'llm-text',
              text: 'live fallback answer',
            }],
          },
        },
        messages: [{
          id: 'raw-message',
          sender: 'user',
          text: 'raw fallback',
        }],
      },
    });

    expect(state).toMatchObject({
      isBusy: true,
      canStop: false,
      liveTurnSource: 'sdk-current-turn',
    });
    expect(state.visibleTurnLifecycle).toMatchObject({
      status: 'active',
      source: 'sdk',
      conversationRef: 'conv-1',
      turnRef: 'turn-live',
    });
  });

  test('keeps malformed ConversationView envelopes on the no-view surface path', () => {
    const state = buildChatSurfaceControllerState({
      conversationViewSurface: 'dashboard',
      sessionConversationRef: 'conv-1',
      conversationView: buildConversationView({
        conversationRef: ' conv-1 ',
        liveTurn: [],
        displayRows: [{
          id: 'view-row-ignored',
        }],
      }),
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-live',
        phase: 'streaming',
        presentation: {
          entries: [{
            id: 'live-entry',
            type: 'llm-text',
            text: 'live fallback answer',
          }],
        },
      },
      messages: [{
        id: 'raw-message',
        sender: 'user',
        text: 'raw fallback',
      }],
    });

    expect(state).toMatchObject({
      isBusy: true,
      canStop: false,
      liveTurnSource: 'sdk-current-turn',
    });
    expect(state.visibleTurnLifecycle).toMatchObject({
      status: 'active',
      source: 'sdk',
      conversationRef: 'conv-1',
      turnRef: 'turn-live',
    });
  });
});
