/**
 * Covers response overlay view contract. behavior in the frontend test suite.
 */

import { DesktopResponseOverlayViewRuntime } from '../../frontend/src/renderer/app/runtime/desktopResponseOverlayViewRuntime';

describe('desktopResponseOverlayViewRuntime', () => {
  const {
    buildResponseOverlayDismissalKey,
    createResponseOverlayWindowGuardSnapshot,
    resolveResponseOverlayEntries,
    resolveResponseOverlayPresentationState,
    resolveResponseOverlayPresentationStateForSurfaceState,
    resolveResponseOverlaySurfaceState,
    resolveResponseOverlayViewContract,
    resolveResponseOverlayWindowGuardSnapshot,
    resolveResponseOverlayWindowSizeIdentity,
  } = DesktopResponseOverlayViewRuntime;

  test('builds normalized response overlay dismissal keys', () => {
    expect(buildResponseOverlayDismissalKey({
      conversationRef: ' conv-overlay ',
      turnRef: ' turn-overlay ',
      responseEntryId: ' assistant-entry ',
    })).toBe('conv-overlay\u0001turn-overlay\u0001assistant-entry');

    expect(buildResponseOverlayDismissalKey({
      responseEntryId: ' assistant-entry ',
    })).toBe('\u0001\u0001assistant-entry');

    expect(buildResponseOverlayDismissalKey({
      conversationRef: 'conv-overlay',
      turnRef: 'turn-overlay',
      responseEntryId: '   ',
    })).toBeNull();
  });

  test('keeps response overlay window guard identity in app runtime', () => {
    const initialSnapshot = createResponseOverlayWindowGuardSnapshot();
    expect(initialSnapshot).toEqual({
      conversationRef: null,
      turnRef: null,
      staleGuardRef: null,
    });

    const activeSnapshot = resolveResponseOverlayWindowGuardSnapshot({
      overlayIntent: {
        conversationRef: ' conv-active ',
        turnRef: ' turn-active ',
      },
      previousSnapshot: initialSnapshot,
    });
    expect(activeSnapshot).toEqual({
      conversationRef: 'conv-active',
      turnRef: 'turn-active',
      staleGuardRef: 'turn-active',
    });

    expect(resolveResponseOverlayWindowGuardSnapshot({
      overlayIntent: null,
      previousSnapshot: activeSnapshot,
    })).toEqual({
      conversationRef: null,
      turnRef: 'turn-active',
      staleGuardRef: 'turn-active',
    });

    expect(resolveResponseOverlayWindowGuardSnapshot({
      overlayIntent: {
        conversationRef: ' conv-guard ',
        staleGuardRef: ' guard-only ',
      },
      previousSnapshot: activeSnapshot,
    })).toEqual({
      conversationRef: 'conv-guard',
      turnRef: null,
      staleGuardRef: 'guard-only',
    });
  });

  test('resolves response overlay native size identity from SDK intent before guard fallback', () => {
    expect(resolveResponseOverlayWindowSizeIdentity({
      overlayIntent: {
        conversationRef: ' conv-current ',
        turnRef: ' turn-current ',
        staleGuardRef: ' guard-current ',
      },
      guardSnapshot: {
        turnRef: 'turn-previous',
        staleGuardRef: 'guard-previous',
      },
    })).toEqual({
      conversationRef: 'conv-current',
      turnRef: 'turn-current',
      staleGuardRef: 'guard-current',
    });

    expect(resolveResponseOverlayWindowSizeIdentity({
      overlayIntent: null,
      guardSnapshot: {
        conversationRef: 'conv-previous',
        turnRef: 'turn-previous',
        staleGuardRef: 'guard-previous',
      },
    })).toEqual({
      conversationRef: null,
      turnRef: 'turn-previous',
      staleGuardRef: 'guard-previous',
    });

    expect(resolveResponseOverlayWindowSizeIdentity({
      overlayIntent: {
        conversationRef: ' conv-current ',
        turnRef: ' turn-current ',
      },
      guardSnapshot: {
        turnRef: 'turn-previous',
        staleGuardRef: 'guard-previous',
      },
    })).toEqual({
      conversationRef: 'conv-current',
      turnRef: 'turn-current',
      staleGuardRef: 'turn-current',
    });
  });

  test('selects conversation view live-turn entries before raw projection rows', () => {
    expect(resolveResponseOverlayEntries({
      conversationView: {
        conversationRef: 'conv-view',
        liveTurn: {
          turnRef: 'turn-view',
          entries: [{
            id: 'entry-view',
            kind: 'assistant_text',
            text: 'from view',
          }],
        },
      },
      sdkLiveTurn: {
        conversationRef: 'conv-raw',
        turnRef: 'turn-raw',
        assistantText: 'from raw projection',
      },
      liveTurnPresentationInput: {
        source: 'conversation-view',
      },
    })).toEqual([
      expect.objectContaining({
        id: 'entry-view',
        text: 'from view',
      }),
    ]);
  });

  test('does not require a source flag before ConversationView blocks raw overlay rows', () => {
    expect(resolveResponseOverlayEntries({
      conversationView: {
        conversationRef: 'conv-view',
        liveTurn: {
          turnRef: 'turn-view',
          entries: [],
        },
      },
      sdkLiveTurn: {
        conversationRef: 'conv-raw',
        turnRef: 'turn-raw',
        assistantText: 'stale raw projection',
      },
      liveTurnPresentationInput: {},
    })).toEqual([]);
  });

  test('does not treat action-only metadata as ConversationView overlay authority', () => {
    expect(resolveResponseOverlayEntries({
      conversationView: {
        actions: {
          canEdit: true,
          canRetry: true,
        },
      },
      sdkLiveTurn: {
        conversationRef: 'conv-raw',
        turnRef: 'turn-raw',
        phase: 'streaming',
        assistantText: 'raw fallback remains visible',
      },
      liveTurnPresentationInput: {},
    })).toEqual([
      expect.objectContaining({
        text: 'raw fallback remains visible',
      }),
    ]);
  });

  test('falls back to raw current-turn projection only when sdk presentation has no visible rows', () => {
    expect(resolveResponseOverlayEntries({
      sdkLiveTurn: {
        conversationRef: 'conv-sdk',
        turnRef: 'turn-sdk',
        phase: 'streaming',
        assistantText: 'visible raw fallback',
        presentation: {
          entries: [],
        },
      },
      liveTurnPresentationInput: {
        useSdkLiveTurnPresentation: true,
      },
    })).toEqual([
      expect.objectContaining({
        text: 'visible raw fallback',
      }),
    ]);
  });

  test('suppresses response entries during local pending bridge display', () => {
    expect(resolveResponseOverlayEntries({
      conversationView: {
        conversationRef: 'conv-view',
        liveTurn: {
          turnRef: 'turn-view',
          entries: [{
            id: 'entry-view',
            kind: 'assistant_text',
            text: 'from view',
          }],
        },
      },
      liveTurnPresentationInput: {
        source: 'conversation-view',
        useLocalPendingTurn: true,
      },
    })).toEqual([]);
  });

  test('projects response overlay surface state from ConversationView without raw fallback', () => {
    const state = resolveResponseOverlaySurfaceState({
      chatSurfaceState: {
        messages: [{
          id: 'stale-raw-message',
          sender: 'assistant',
          text: 'stale renderer answer',
        }],
        conversationView: {
          conversationRef: 'conv-view',
          liveTurn: {
            turnRef: 'turn-view',
            phase: 'streaming',
            isBusy: true,
            entries: [{
              id: 'entry-view',
              kind: 'assistant_text',
              text: 'from view',
            }],
          },
          surfaces: {
            responseOverlay: {
              mode: 'response',
              visible: true,
              turnRef: 'turn-view',
              conversationRef: 'conv-view',
            },
          },
        },
        sdkLiveTurn: null,
      },
    });

    expect(state.responseOverlayEntries).toEqual([
      expect.objectContaining({
        id: 'entry-view',
        text: 'from view',
      }),
    ]);
    expect(state).not.toHaveProperty('traceState');
    expect(state).not.toHaveProperty('projectionInput');
    expect(state.pendingTurn).toBeNull();
    expect(state.sdkLiveTurn).toBeNull();
    expect(state).not.toHaveProperty('currentTurnProjection');
    expect(state.responseOverlayDismissalTarget).toEqual(expect.objectContaining({
      conversationRef: 'conv-view',
      turnRef: 'turn-view',
      guardRef: 'turn-view',
      responseEntryId: 'entry-view',
    }));
    expect(state.thinkingText).toBe('');
    expect(state.useLocalPendingTurn).toBe(false);
  });

  test('response overlay surface state blanks raw fallback under direct ConversationView input', () => {
    const state = resolveResponseOverlaySurfaceState({
      chatSurfaceState: {
        messages: [{
          id: 'stale-user',
          sender: 'user',
          text: 'stale raw user',
        }],
        pendingTurn: {
          conversationRef: 'conv-view',
          turnRef: 'turn-pending',
        },
        conversationView: {
          conversationRef: 'conv-view',
          liveTurn: null,
          surfaces: {
            responseOverlay: {
              mode: 'hidden',
              visible: false,
            },
          },
        },
        sdkLiveTurn: {
          conversationRef: 'conv-view',
          turnRef: 'turn-sdk',
          phase: 'streaming',
          assistantText: 'stale SDK fallback',
        },
      },
    });

    expect(state.messages).toEqual([]);
    expect(state.sdkLiveTurn).toBeNull();
    expect(state.useLocalPendingTurn).toBe(true);
    expect(state.responseOverlayEntries).toEqual([]);
    expect(state.responseOverlayMessages).toEqual([]);
    expect(state.visibleTurnLifecycle).toEqual(expect.objectContaining({
      source: 'local',
      status: 'local_pending',
      awaitingAnchor: null,
    }));
  });

  test('projects local pending bridge surface state before SDK view exists', () => {
    const state = resolveResponseOverlaySurfaceState({
      chatSurfaceState: {
        messages: [{
          id: 'pending-user',
          sender: 'user',
          text: 'pending prompt',
          sourceEventType: 'renderer-compose',
        }],
        pendingTurn: {
          conversationRef: 'conv-pending',
          turnRef: 'turn-pending',
          text: 'pending prompt',
          timestamp: '2026-06-25T12:00:00.000Z',
        },
      },
    });

    expect(state.useLocalPendingTurn).toBe(true);
    expect(state.responseOverlayEntries).toEqual([]);
    expect(state.responseOverlayMessages).toEqual([
      expect.objectContaining({
        id: 'pending-user',
      }),
    ]);
    expect(state.liveTurnPresentationInput).toMatchObject({
      source: 'pending-turn',
      turnRef: 'turn-pending',
    });
    expect(state.pendingTurn).toEqual(expect.objectContaining({
      turnRef: 'turn-pending',
    }));
  });

  test('resolves SDK projection presentation state before visible lifecycle stamping', () => {
    expect(resolveResponseOverlayPresentationState({
      currentTurnPresentationState: {
        activeResponse: null,
        hasVisibleReply: false,
        visibleResponse: null,
        chatboxSurfaceState: 'compact',
      },
      sdkLiveTurn: {
        conversationRef: 'conv-sdk',
        turnRef: 'turn-sdk',
        presentation: {
          hasVisibleContent: true,
          entries: [{
            id: 'assistant-sdk',
            sender: 'assistant',
            type: 'llm-text',
            text: 'from sdk',
          }],
          overlayIntent: {
            visible: true,
            mode: 'response',
            conversationRef: 'conv-sdk',
            turnRef: 'turn-sdk',
            staleGuardRef: 'turn-sdk',
          },
        },
      },
      responseOverlayEntries: [{
        id: 'assistant-sdk',
        sender: 'assistant',
        type: 'llm-text',
        text: 'from sdk',
      }],
      liveTurnPresentationInput: {
        source: 'sdk',
        useSdkLiveTurnPresentation: true,
        useLocalPendingTurn: false,
      },
      visibleTurnLifecycle: {
        status: 'active',
        isBusy: true,
      },
    })).toMatchObject({
      activeResponse: {
        id: 'assistant-sdk',
        text: 'from sdk',
      },
      visibleResponse: {
        id: 'assistant-sdk',
      },
      overlayIntent: expect.objectContaining({
        mode: 'response',
        turnRef: 'turn-sdk',
      }),
      visibleTurnLifecycle: {
        status: 'active',
      },
      isBusy: true,
      awaitingDotTargetMessageId: null,
    });
  });

  test('resolves presentation state from sanitized surface state', () => {
    const responseOverlaySurfaceState = resolveResponseOverlaySurfaceState({
      chatSurfaceState: {
        sdkLiveTurn: {
          conversationRef: 'conv-sdk',
          turnRef: 'turn-sdk',
          phase: 'streaming',
          presentation: {
            hasVisibleContent: true,
            entries: [{
              id: 'assistant-sdk',
              sender: 'assistant',
              type: 'llm-text',
              text: 'from sdk',
            }],
            overlayIntent: {
              visible: true,
              mode: 'response',
              turnRef: 'turn-sdk',
              staleGuardRef: 'guard-sdk',
              conversationRef: 'conv-sdk',
            },
          },
        },
      },
    });

    expect(resolveResponseOverlayPresentationStateForSurfaceState({
      currentTurnPresentationState: {
        activeResponse: null,
        hasVisibleReply: false,
        visibleResponse: null,
        chatboxSurfaceState: 'compact',
      },
      responseOverlaySurfaceState,
    })).toEqual(expect.objectContaining({
      activeResponse: expect.objectContaining({
        id: 'assistant-sdk',
        text: 'from sdk',
      }),
      overlayIntent: expect.objectContaining({
        turnRef: 'turn-sdk',
        staleGuardRef: 'guard-sdk',
      }),
    }));
  });

  test('keeps ConversationView presentation state instead of replaying stale projection state', () => {
    expect(resolveResponseOverlayPresentationState({
      currentTurnPresentationState: {
        activeResponse: {
          id: 'assistant-view',
          sender: 'assistant',
          type: 'llm-text',
          text: 'from view',
        },
        hasVisibleReply: true,
        visibleResponse: {
          id: 'assistant-view',
          sender: 'assistant',
          type: 'llm-text',
          text: 'from view',
        },
        chatboxSurfaceState: 'response',
      },
      sdkLiveTurn: {
        presentation: {
          overlayIntent: {
            visible: true,
            mode: 'response',
            turnRef: 'turn-stale',
          },
        },
      },
      responseOverlayEntries: [{
        id: 'assistant-view',
        sender: 'assistant',
        type: 'llm-text',
        text: 'from view',
      }],
      liveTurnPresentationInput: {
        source: 'conversation-view',
        useSdkLiveTurnPresentation: true,
        overlayIntent: {
          visible: true,
          mode: 'response',
          turnRef: 'turn-view',
        },
      },
      visibleTurnLifecycle: {
        status: 'active',
        isBusy: false,
      },
    })).toMatchObject({
      activeResponse: {
        id: 'assistant-view',
        text: 'from view',
      },
      visibleResponse: {
        id: 'assistant-view',
      },
      overlayIntent: {
        visible: true,
        mode: 'response',
        turnRef: 'turn-view',
      },
      visibleTurnLifecycle: {
        status: 'active',
      },
    });
  });

  test('shows response when entries exist and are not dismissed', () => {
    expect(resolveResponseOverlayViewContract({
      currentTurnPresentationState: {
        visibleTurnLifecycle: {
          status: 'awaiting',
        },
      },
      responseOverlayEntries: [{ id: 'assistant-1' }],
      dismissedResponseId: null,
    })).toMatchObject({
      latestResponseOverlayEntryId: 'assistant-1',
      responseVisible: true,
      awaitingVisible: false,
      overlayLayoutMode: 'response',
      isVisible: true,
    });
  });

  test('falls back to awaiting typing when no response entry is visible', () => {
    expect(resolveResponseOverlayViewContract({
      currentTurnPresentationState: {
        visibleTurnLifecycle: {
          status: 'awaiting',
        },
        visibleResponse: null,
      },
      responseOverlayEntries: [],
      dismissedResponseId: null,
    })).toMatchObject({
      latestResponseOverlayEntryId: null,
      responseVisible: false,
      awaitingVisible: true,
      overlayLayoutMode: 'awaiting-typing',
      isVisible: true,
    });
  });

  test('prefers awaiting typing over a stale visible response during new-turn preflight', () => {
    expect(resolveResponseOverlayViewContract({
      currentTurnPresentationState: {
        visibleTurnLifecycle: {
          status: 'local_pending',
        },
        visibleResponse: {
          id: 'assistant-1',
        },
      },
      responseOverlayEntries: [{ id: 'assistant-1' }],
      dismissedResponseId: null,
    })).toMatchObject({
      latestResponseOverlayEntryId: 'assistant-1',
      responseVisible: false,
      awaitingVisible: true,
      overlayLayoutMode: 'awaiting-typing',
      isVisible: true,
    });
  });

  test('keeps the current-turn response visible during active tool phases', () => {
    expect(resolveResponseOverlayViewContract({
      currentTurnPresentationState: {
        visibleTurnLifecycle: {
          status: 'active',
        },
        visibleResponse: {
          id: 'assistant-1',
        },
      },
      responseOverlayEntries: [{ id: 'assistant-1' }],
      dismissedResponseId: null,
    })).toMatchObject({
      latestResponseOverlayEntryId: 'assistant-1',
      responseVisible: true,
      awaitingVisible: false,
      overlayLayoutMode: 'response',
      isVisible: true,
    });
  });

  test('hides overlay when no response or awaiting state is active', () => {
    expect(resolveResponseOverlayViewContract({
      currentTurnPresentationState: {
        visibleTurnLifecycle: {
          status: 'idle',
        },
      },
      responseOverlayEntries: [],
      dismissedResponseId: null,
    })).toMatchObject({
      responseVisible: false,
      awaitingVisible: false,
      overlayLayoutMode: 'hidden',
      isVisible: false,
    });
  });
});
