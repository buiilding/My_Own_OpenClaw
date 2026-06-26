/**
 * Covers response overlay view contract. behavior in the frontend test suite.
 */

import { DesktopResponseOverlayViewRuntime } from '../../frontend/src/renderer/app/runtime/desktopResponseOverlayViewRuntime';

describe('desktopResponseOverlayViewRuntime', () => {
  const {
    buildResponseOverlayDismissalKey,
    resolveResponseOverlayEntries,
    resolveResponseOverlayPresentationState,
    resolveResponseOverlaySurfaceState,
    resolveResponseOverlayViewContract,
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
      currentTurnProjection: {
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
      currentTurnProjection: {
        conversationRef: 'conv-raw',
        turnRef: 'turn-raw',
        assistantText: 'stale raw projection',
      },
      liveTurnPresentationInput: {},
    })).toEqual([]);
  });

  test('falls back to raw current-turn projection only when sdk presentation has no visible rows', () => {
    expect(resolveResponseOverlayEntries({
      currentTurnProjection: {
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
        currentTurnProjection: {
          conversationRef: 'conv-raw',
          turnRef: 'turn-raw',
          phase: 'streaming',
          assistantText: 'from raw projection',
          reasoningText: 'raw thinking',
        },
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
    expect(state.currentTurnProjection).toBeNull();
    expect(state.thinkingText).toBe('');
    expect(state.useLocalPendingTurn).toBe(false);
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
      currentTurnProjection: {
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
      currentTurnProjection: {
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
