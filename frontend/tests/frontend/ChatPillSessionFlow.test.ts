/**
 * Covers chat pill session flow. behavior in the frontend test suite.
 */

import { DesktopChatPillSessionRuntime } from '../../src/renderer/app/runtime/desktopChatPillSessionRuntime';

describe('desktopChatPillSessionRuntime', () => {
  const {
    buildChatPillLifecycleTraceValues,
    buildChatPillLifecycleTraceSnapshot,
    buildChatPillResetTraceValues,
    buildChatPillStateTraceSnapshot,
    resolveChatPillSendLifecycle,
    resolveChatPillViewIntent,
  } = DesktopChatPillSessionRuntime;

  test('resolves overlay-chatbox send lifecycle with screenshot capture', () => {
    expect(resolveChatPillSendLifecycle({
      senderSurface: 'overlay-chatbox',
      includeQueryScreenshot: true,
    })).toMatchObject({
      shouldCaptureQueryScreenshot: true,
      shouldReturnToChatboxOnSend: false,
      surfaceReason: 'query_send_with_capture',
    });
  });

  test('resolves overlay-chatbox sends without capture or chatbox restore by default', () => {
    expect(resolveChatPillSendLifecycle({
      senderSurface: 'overlay-chatbox',
      includeQueryScreenshot: false,
    })).toMatchObject({
      senderSurface: 'overlay-chatbox',
      shouldCaptureQueryScreenshot: false,
      shouldReturnToChatboxOnSend: false,
      surfaceReason: 'query_send_without_capture',
      sendUiBehavior: {
        returnToChatboxPolicy: 'never',
        shouldReturnToChatboxOnSend: false,
      },
    });
  });

  test('honors return-to-chatbox policy after normalizing capture intent', () => {
    expect(resolveChatPillSendLifecycle({
      senderSurface: 'overlay-chatbox',
      returnToChatboxPolicy: 'auto',
      includeQueryScreenshot: true,
    })).toMatchObject({
      shouldCaptureQueryScreenshot: true,
      shouldReturnToChatboxOnSend: true,
      sendUiBehavior: {
        returnToChatboxPolicy: 'auto',
        shouldReturnToChatboxOnSend: true,
      },
    });

    expect(resolveChatPillSendLifecycle({
      senderSurface: 'overlay-chatbox',
      returnToChatboxPolicy: 'always',
      includeQueryScreenshot: false,
    })).toMatchObject({
      shouldCaptureQueryScreenshot: false,
      shouldReturnToChatboxOnSend: true,
      sendUiBehavior: {
        returnToChatboxPolicy: 'always',
        shouldReturnToChatboxOnSend: true,
      },
    });
  });

  test('resolves main-window send lifecycle without capture or chatbox restore', () => {
    expect(resolveChatPillSendLifecycle({
      senderSurface: 'main-window',
      includeQueryScreenshot: true,
    })).toMatchObject({
      shouldCaptureQueryScreenshot: false,
      shouldReturnToChatboxOnSend: false,
      surfaceReason: 'query_send_without_capture',
    });
  });

  test('keeps main-window sends from restoring the chatbox even with an always policy', () => {
    expect(resolveChatPillSendLifecycle({
      senderSurface: 'main-window',
      returnToChatboxPolicy: 'always',
      includeQueryScreenshot: true,
    })).toMatchObject({
      shouldCaptureQueryScreenshot: false,
      shouldReturnToChatboxOnSend: false,
      sendUiBehavior: {
        returnToChatboxPolicy: 'always',
        shouldReturnToChatboxOnSend: true,
      },
    });
  });

  test('prefers visible response turn id and response layout when a reply exists', () => {
    const viewIntent = resolveChatPillViewIntent({
      currentTurnPresentationState: {
        visibleResponse: { id: 'assistant-1', sender: 'assistant', text: 'reply', turnRef: 'turn-assistant' },
        activeResponse: { id: 'assistant-1', sender: 'assistant', text: 'reply', turnRef: 'turn-assistant' },
      },
      responseOverlayEntries: [{ id: 'assistant-1' }],
    });

    expect(viewIntent).toMatchObject({
      turnId: 'turn-assistant',
      responseVisible: true,
      awaitingVisible: false,
      overlayLayoutMode: 'response',
      isVisible: true,
    });
  });

  test('prefers visible response turn id over a different active response turn id', () => {
    const viewIntent = resolveChatPillViewIntent({
      currentTurnPresentationState: {
        visibleResponse: { id: 'assistant-visible', sender: 'assistant', text: 'visible reply', turnRef: 'turn-visible' },
        activeResponse: { id: 'assistant-active', sender: 'assistant', text: 'old reply', turnRef: 'turn-active' },
      },
      responseOverlayEntries: [{ id: 'assistant-visible' }],
    });

    expect(viewIntent).toMatchObject({
      turnId: 'turn-visible',
      responseVisible: true,
      latestResponseOverlayEntryId: 'assistant-visible',
    });
  });

  test('falls back to active response turn id before message history', () => {
    const viewIntent = resolveChatPillViewIntent({
      currentTurnPresentationState: {
        visibleResponse: null,
        activeResponse: { id: 'assistant-active', sender: 'assistant', text: 'reply', turnRef: 'turn-active' },
      },
      responseOverlayEntries: [{ id: 'assistant-active' }],
    });

    expect(viewIntent).toMatchObject({
      turnId: 'turn-active',
      responseVisible: true,
    });
  });

  test('falls back to visible lifecycle turn id while awaiting', () => {
    const viewIntent = resolveChatPillViewIntent({
      currentTurnPresentationState: {
        activeResponse: null,
        visibleResponse: null,
        visibleTurnLifecycle: {
          status: 'awaiting',
          turnRef: 'turn-awaiting',
        },
      },
      responseOverlayEntries: [],
    });

    expect(viewIntent).toMatchObject({
      turnId: 'turn-awaiting',
      responseVisible: false,
      awaitingVisible: true,
      overlayLayoutMode: 'awaiting-typing',
      isVisible: true,
    });
  });

  test('falls back through runtime-owned surface turn identities', () => {
    expect(resolveChatPillViewIntent({
      currentTurnPresentationState: {
        activeResponse: null,
        visibleResponse: null,
        visibleTurnLifecycle: {
          status: 'idle',
          turnRef: null,
        },
      },
      overlayIntent: {
        turnRef: 'turn-overlay',
      },
      pendingTurn: {
        turnRef: 'turn-pending',
      },
      responseOverlayEntries: [],
      visibleTurnLifecycle: {
        turnRef: 'turn-lifecycle',
      },
    })).toMatchObject({
      turnId: 'turn-overlay',
    });

    expect(resolveChatPillViewIntent({
      currentTurnPresentationState: {
        activeResponse: null,
        visibleResponse: null,
      },
      overlayIntent: {
        turnRef: '   ',
      },
      pendingTurn: {
        turnRef: 'turn-pending',
      },
      responseOverlayEntries: [],
      visibleTurnLifecycle: {
        turnRef: 'turn-lifecycle',
      },
    })).toMatchObject({
      turnId: 'turn-lifecycle',
    });

    expect(resolveChatPillViewIntent({
      currentTurnPresentationState: {
        activeResponse: null,
        visibleResponse: null,
      },
      overlayIntent: {
        turnRef: null,
      },
      pendingTurn: {
        turnRef: 'turn-pending',
      },
      responseOverlayEntries: [],
      visibleTurnLifecycle: {
        turnRef: '',
      },
    })).toMatchObject({
      turnId: 'turn-pending',
    });
  });

  test('returns null turn id without response or lifecycle turn identity', () => {
    const viewIntent = resolveChatPillViewIntent({
      currentTurnPresentationState: {
        activeResponse: null,
        visibleResponse: null,
        visibleTurnLifecycle: {
          status: 'idle',
          turnRef: '   ',
        },
      },
      responseOverlayEntries: [],
    });

    expect(viewIntent).toMatchObject({
      turnId: null,
      responseVisible: false,
      overlayLayoutMode: 'hidden',
      isVisible: false,
    });
  });

  test('projects chat pill lifecycle trace identity from surface state', () => {
    expect(buildChatPillLifecycleTraceSnapshot({
      sessionConversationRef: ' conv-1 ',
      chatSurfaceState: {
        sdkLiveTurn: {
          turnRef: ' turn-1 ',
          phase: ' streaming ',
        },
      },
    })).toEqual({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
    });
  });

  test('builds chat pill lifecycle and reset trace values from runtime snapshots', () => {
    const snapshot = buildChatPillLifecycleTraceSnapshot({
      sessionConversationRef: ' conv-1 ',
      chatSurfaceState: {
        sdkLiveTurn: {
          turnRef: ' turn-1 ',
          phase: ' streaming ',
        },
      },
    });

    expect(buildChatPillLifecycleTraceValues({
      action: 'mount',
      snapshot,
    })).toEqual({
      action: 'mount',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
    });

    expect(buildChatPillResetTraceValues({
      snapshot,
      attachmentCount: 2,
      includeQueryScreenshot: true,
    })).toEqual({
      conversationRef: 'conv-1',
      previousTurnRef: 'turn-1',
      previousPhase: 'streaming',
      attachmentCount: 2,
      includeQueryScreenshot: true,
    });
  });

  test('uses ConversationView live turn as chat pill trace identity', () => {
    expect(buildChatPillLifecycleTraceSnapshot({
      sessionConversationRef: ' conv-1 ',
      chatSurfaceState: {
        sdkLiveTurn: {
          turnRef: ' stale-current ',
          phase: ' awaiting ',
        },
        conversationView: {
          liveTurn: {
            phase: ' streaming ',
            turnRef: ' view-turn ',
          },
        },
      },
    })).toEqual({
      conversationRef: 'conv-1',
      turnRef: 'view-turn',
      phase: 'streaming',
    });
  });

  test('does not mix raw current-turn identity into chat pill traces when ConversationView exists', () => {
    expect(buildChatPillLifecycleTraceSnapshot({
      sessionConversationRef: ' conv-1 ',
      chatSurfaceState: {
        sdkLiveTurn: {
          turnRef: ' stale-current ',
          phase: ' stale-awaiting ',
        },
        conversationView: {
          liveTurn: {},
        },
      },
    })).toEqual({
      conversationRef: 'conv-1',
      turnRef: null,
      phase: null,
    });

    const snapshot = buildChatPillStateTraceSnapshot({
      busy: true,
      chatSurfaceState: {
        sdkLiveTurn: {
          turnRef: ' stale-current ',
          phase: ' stale-awaiting ',
        },
        conversationView: {
          liveTurn: {
            canStop: true,
          },
        },
      },
      surfacePhase: 'streaming',
      surfaceSource: 'conversation-view',
      sessionConversationRef: 'conv-1',
      stopAvailable: true,
    });

    expect(JSON.parse(snapshot.signature)).toEqual(expect.objectContaining({
      currentTurnPhase: null,
      currentTurnRef: null,
      viewTurnRef: null,
    }));
    expect(snapshot.trace.turnRef).toBeNull();
    expect(snapshot.trace.currentTurnPhase).toBeNull();
  });

  test('projects chat pill state trace payload from surface state', () => {
    const snapshot = buildChatPillStateTraceSnapshot({
      busy: true,
      chatSurfaceState: {
        messages: [{ id: 'pending-row' }],
        sdkLiveTurn: {
          turnRef: ' turn-current ',
          phase: ' awaiting ',
        },
        conversationView: {
          liveTurn: {
            canStop: true,
            phase: ' streaming ',
            turnRef: ' view-turn ',
          },
          surfaces: {
            pill: {
              mode: ' busy ',
            },
          },
        },
      },
      surfacePhase: 'streaming',
      surfaceSource: 'conversation-view',
      sessionConversationRef: 'conv-1',
      stopAvailable: true,
    });

    expect(JSON.parse(snapshot.signature)).toEqual(expect.objectContaining({
      busy: true,
      currentTurnPhase: 'streaming',
      currentTurnRef: 'view-turn',
      liveTurnPhase: 'streaming',
      liveTurnSource: 'conversation-view',
      viewCanStop: true,
      viewPillMode: 'busy',
      viewTurnRef: 'view-turn',
    }));
    expect(snapshot.trace).toEqual({
      conversationRef: 'conv-1',
      turnRef: 'view-turn',
      currentTurnPhase: 'streaming',
      liveTurnPhase: 'streaming',
      liveTurnSource: 'conversation-view',
      busy: true,
      stopAvailable: true,
      messageCount: 1,
    });
  });

  test('propagates dismissed response state through the view contract', () => {
    const viewIntent = resolveChatPillViewIntent({
      currentTurnPresentationState: {
        visibleResponse: { id: 'assistant-1', sender: 'assistant', text: 'reply', turnRef: 'turn-assistant' },
        activeResponse: { id: 'assistant-1', sender: 'assistant', text: 'reply', turnRef: 'turn-assistant' },
      },
      responseOverlayEntries: [{ id: 'assistant-1' }],
      dismissedResponseId: 'assistant-1',
    });

    expect(viewIntent).toMatchObject({
      latestResponseOverlayEntryId: 'assistant-1',
      turnId: 'turn-assistant',
      responseVisible: false,
      awaitingVisible: false,
      overlayLayoutMode: 'hidden',
      isVisible: false,
    });
  });

  test('prefers awaiting layout over a stale prior response during new-turn handoff', () => {
    const viewIntent = resolveChatPillViewIntent({
      currentTurnPresentationState: {
        activeResponse: { id: 'assistant-1', sender: 'assistant', text: 'reply', turnRef: 'turn-assistant' },
        visibleResponse: { id: 'assistant-1', sender: 'assistant', text: 'reply', turnRef: 'turn-assistant' },
        visibleTurnLifecycle: {
          status: 'local_pending',
        },
      },
      responseOverlayEntries: [{ id: 'assistant-1' }],
    });

    expect(viewIntent).toMatchObject({
      turnId: 'turn-assistant',
      responseVisible: false,
      awaitingVisible: true,
      overlayLayoutMode: 'awaiting-typing',
      isVisible: true,
    });
  });
});
