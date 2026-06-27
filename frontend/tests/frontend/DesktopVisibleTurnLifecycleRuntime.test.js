/**
 * Covers renderer-visible turn lifecycle projection for desktop surfaces.
 */

import {
  DesktopVisibleTurnLifecycleRuntime,
} from '../../src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime';

const {
  applyVisibleTurnLifecycleToPresentationState,
  resolvePendingTurnForSdkLiveTurn,
  resolveVisibleTurnLifecycle,
} = DesktopVisibleTurnLifecycleRuntime;

function pendingTurn(overrides = {}) {
  return {
    conversationRef: 'conv-1',
    turnRef: 'turn-1',
    userMessageId: 'user-1',
    text: 'hello',
    timestamp: '2026-06-21T00:00:00.000Z',
    attachmentFilenames: null,
    ...overrides,
  };
}

function projection(overrides = {}) {
  return {
    conversationRef: 'conv-1',
    turnRef: 'turn-1',
    phase: 'idle',
    assistantText: '',
    reasoningText: null,
    toolEvents: [],
    lastError: null,
    presentation: {
      typingVisible: false,
      overlayVisible: false,
      isBusy: false,
      hasVisibleContent: false,
      entries: [],
      overlayIntent: {
        visible: false,
        mode: 'hidden',
        turnRef: 'turn-1',
        conversationRef: 'conv-1',
        staleGuardRef: 'turn-1',
      },
    },
    ...overrides,
  };
}

describe('DesktopVisibleTurnLifecycleRuntime', () => {
  test('exposes only the visible lifecycle runtime facade', () => {
    const visibleLifecycleModule = require('../../src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime');

    expect(visibleLifecycleModule.DesktopVisibleTurnLifecycleRuntime).toBe(DesktopVisibleTurnLifecycleRuntime);
    expect(visibleLifecycleModule.hasAuthoritativeSdkProjection).toBeUndefined();
    expect(visibleLifecycleModule.hasAuthoritativeSameTurnSdkReplacement).toBeUndefined();
    expect(visibleLifecycleModule.resolveVisibleTurnLifecycle).toBeUndefined();
    expect(visibleLifecycleModule.resolvePendingTurnForCurrentProjection).toBeUndefined();
    expect(visibleLifecycleModule.resolvePendingTurnForSdkLiveTurn).toBeUndefined();
    expect(visibleLifecycleModule.buildCurrentTurnPresentationSnapshotSignature).toBeUndefined();
    expect(visibleLifecycleModule.isCurrentTurnPresentationOverlayLifecycleBusy).toBeUndefined();
    expect(visibleLifecycleModule.resolveCurrentTurnPresentationOverlayLifecycle).toBeUndefined();
    expect(visibleLifecycleModule.shouldUseLocalSendPreflight).toBeUndefined();
    expect(visibleLifecycleModule.shouldUseLocalPendingTurn).toBeUndefined();
    expect(DesktopVisibleTurnLifecycleRuntime.hasAuthoritativeSdkProjection).toBeUndefined();
    expect(DesktopVisibleTurnLifecycleRuntime.hasAuthoritativeSameTurnSdkReplacement).toBeUndefined();
    expect(DesktopVisibleTurnLifecycleRuntime.shouldUseLocalSendPreflight).toBeUndefined();
    expect(DesktopVisibleTurnLifecycleRuntime.shouldUseLocalPendingTurn).toBeUndefined();
  });

  test('keeps local pending through idle, empty, and wrong-turn SDK projections until same-turn authority arrives', () => {
    const pending = pendingTurn();
    const messages = [{
      id: 'user-1',
      sender: 'user',
      text: 'hello',
      turnRef: 'turn-1',
    }];

    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      sdkLiveTurn: null,
      messages,
    })).toMatchObject({
      status: 'local_pending',
      source: 'local',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      awaitingAnchor: {
        kind: 'user-message',
        rowId: 'user-1',
      },
      isBusy: true,
      showTyping: true,
    });

    expect(resolvePendingTurnForSdkLiveTurn({
      pendingTurn: pending,
      sdkLiveTurn: projection({ phase: 'idle' }),
    })).toBe(pending);
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      sdkLiveTurn: projection({ phase: 'idle' }),
      messages,
    })).toMatchObject({
      status: 'local_pending',
      showTyping: true,
    });

    expect(resolvePendingTurnForSdkLiveTurn({
      pendingTurn: pending,
      sdkLiveTurn: projection({ phase: 'streaming' }),
    })).toBe(pending);
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      sdkLiveTurn: projection({ phase: 'streaming' }),
      messages,
    })).toMatchObject({
      status: 'local_pending',
      showTyping: true,
    });

    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      sdkLiveTurn: projection({
        phase: 'streaming',
        assistantText: 'visible response',
        presentation: {
          entries: [{
            id: 'entry-raw-ignored',
            type: 'llm-text',
            text: 'visible response',
          }],
        },
      }),
      messages,
    })).toMatchObject({
      status: 'active',
      showTyping: false,
    });

    expect(resolvePendingTurnForSdkLiveTurn({
      pendingTurn: pending,
      sdkLiveTurn: projection({
        turnRef: 'turn-previous',
        phase: 'complete',
        presentation: {
          isTerminal: true,
          entries: [],
        },
      }),
    })).toBe(pending);
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      sdkLiveTurn: projection({
        turnRef: 'turn-previous',
        phase: 'complete',
        presentation: {
          isTerminal: true,
          entries: [],
        },
      }),
      messages,
    })).toMatchObject({
      status: 'local_pending',
      turnRef: 'turn-1',
      showTyping: true,
    });

    const awaitingProjection = projection({
      phase: 'awaiting',
      presentation: {
        typingVisible: true,
        overlayVisible: true,
        isBusy: true,
        hasVisibleContent: false,
        entries: [],
        awaitingAnchor: {
          kind: 'user-message',
          rowId: 'user-1',
        },
      },
    });

    expect(resolvePendingTurnForSdkLiveTurn({
      pendingTurn: pending,
      sdkLiveTurn: awaitingProjection,
    })).toBe(pending);
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      sdkLiveTurn: awaitingProjection,
      messages,
    })).toMatchObject({
      status: 'awaiting',
      source: 'sdk',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      awaitingAnchor: {
        kind: 'user-message',
        rowId: 'user-1',
      },
      isBusy: true,
      showTyping: true,
    });
  });

  test('classifies visible progress, text, and terminal projections as authoritative same-turn lifecycle', () => {
    const pending = pendingTurn();

    const progressProjection = projection({
      phase: 'idle',
      toolEvents: [{
        kind: 'tool_progress',
        toolName: 'web_search',
        message: 'Searching',
      }],
      presentation: {
        entries: [{
          id: 'entry-progress',
          type: 'tool-progress',
          text: 'Searching',
          toolName: 'web_search',
        }],
      },
    });
    expect(resolvePendingTurnForSdkLiveTurn({
      pendingTurn: pending,
      sdkLiveTurn: progressProjection,
    })).toBeNull();
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      sdkLiveTurn: progressProjection,
    })).toMatchObject({
      status: 'active',
      source: 'sdk',
      isBusy: false,
      showTyping: false,
    });

    const textProjection = projection({
      phase: 'streaming',
      assistantText: 'Hello there',
      presentation: {
        hasVisibleContent: true,
        entries: [{
          id: 'entry-1',
          type: 'llm-text',
          text: 'Hello there',
        }],
      },
    });
    expect(resolvePendingTurnForSdkLiveTurn({
      pendingTurn: pending,
      sdkLiveTurn: textProjection,
    })).toBeNull();
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      sdkLiveTurn: textProjection,
    })).toMatchObject({
      status: 'active',
      entries: [{
        id: 'entry-1',
        type: 'llm-text',
        text: 'Hello there',
      }],
      showTyping: false,
    });

    const flagOnlyProjection = projection({
      phase: 'streaming',
      presentation: {
        hasVisibleContent: true,
        entries: [],
      },
    });
    expect(resolvePendingTurnForSdkLiveTurn({
      pendingTurn: pending,
      sdkLiveTurn: flagOnlyProjection,
    })).toBe(pending);
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      sdkLiveTurn: flagOnlyProjection,
    })).toMatchObject({
      status: 'local_pending',
      source: 'local',
      isBusy: true,
      showTyping: true,
    });
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      sdkLiveTurn: flagOnlyProjection,
    })).toMatchObject({
      status: 'idle',
      source: 'sdk',
      isBusy: false,
      showTyping: false,
    });

    const terminalProjection = projection({
      phase: 'complete',
      presentation: {
        isTerminal: true,
        entries: [],
      },
    });
    expect(resolvePendingTurnForSdkLiveTurn({
      pendingTurn: pending,
      sdkLiveTurn: terminalProjection,
    })).toBeNull();
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      sdkLiveTurn: terminalProjection,
    })).toMatchObject({
      status: 'terminal',
      terminalReason: 'complete',
      isBusy: false,
      showTyping: false,
    });
  });

  test('lets same-turn ConversationView replace local pending lifecycle', () => {
    const pending = pendingTurn({
      conversationRef: 'conv-1',
      turnRef: 'turn-view',
    });

    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      conversationView: {
        conversationRef: 'conv-1',
        liveTurn: {
          turnRef: 'turn-view',
          phase: 'streaming',
          isBusy: true,
          entries: [{
            id: 'entry-view',
            type: 'llm-text',
            text: 'view response',
          }],
        },
        surfaces: {
          responseOverlay: {
            mode: 'response',
            visible: true,
            turnRef: 'turn-view',
            guardRef: 'turn-view',
            ownerConversationRef: 'conv-1',
          },
        },
      },
    })).toMatchObject({
      status: 'active',
      source: 'conversation-view',
      conversationRef: 'conv-1',
      turnRef: 'turn-view',
      entries: [
        expect.objectContaining({
          id: 'entry-view',
          text: 'view response',
        }),
      ],
      showTyping: false,
    });
  });

  test('keeps local pending through awaiting ConversationView before visible view rows arrive', () => {
    const pending = pendingTurn({
      conversationRef: 'conv-1',
      turnRef: 'turn-view',
      userMessageId: 'pending-user',
    });

    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      conversationView: {
        conversationRef: 'conv-1',
        displayRows: [],
        liveTurn: {
          turnRef: 'turn-view',
          phase: 'awaiting',
          isBusy: true,
          entries: [],
        },
        surfaces: {
          responseOverlay: {
            mode: 'awaiting',
            visible: true,
            turnRef: 'turn-view',
            guardRef: 'turn-view',
            ownerConversationRef: 'conv-1',
          },
        },
      },
    })).toMatchObject({
      status: 'local_pending',
      source: 'local',
      conversationRef: 'conv-1',
      turnRef: 'turn-view',
      awaitingAnchor: {
        kind: 'user-message',
        rowId: 'pending-user',
      },
      showTyping: true,
    });
  });

  test('anchors ConversationView awaiting lifecycle to SDK user display row', () => {
    const pending = pendingTurn({
      conversationRef: 'conv-1',
      turnRef: 'turn-view',
      userMessageId: 'pending-user',
    });

    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      conversationView: {
        conversationRef: 'conv-1',
        displayRows: [{
          id: 'sdk-user-row',
          conversationRef: 'conv-1',
          turnRef: 'turn-view',
          role: 'user',
          type: 'user_message',
          content: 'hello',
        }],
        liveTurn: {
          turnRef: 'turn-view',
          phase: 'awaiting',
          isBusy: true,
          entries: [],
        },
        surfaces: {
          responseOverlay: {
            mode: 'awaiting',
            visible: true,
            turnRef: 'turn-view',
            guardRef: 'turn-view',
            ownerConversationRef: 'conv-1',
          },
        },
      },
    })).toMatchObject({
      status: 'awaiting',
      source: 'conversation-view',
      conversationRef: 'conv-1',
      turnRef: 'turn-view',
      awaitingAnchor: {
        kind: 'user-message',
        rowId: 'sdk-user-row',
      },
      showTyping: true,
    });
  });

  test('does not fall through to raw current-turn lifecycle when ConversationView is idle', () => {
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-view',
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
      sdkLiveTurn: projection({
        conversationRef: 'conv-stale',
        turnRef: 'turn-stale',
        phase: 'streaming',
        assistantText: 'stale raw answer',
      }),
      messages: [{
        id: 'stale-user',
        sender: 'user',
        text: 'stale',
      }],
    })).toEqual({
      status: 'idle',
      source: 'conversation-view',
      conversationRef: 'conv-view',
      turnRef: null,
      awaitingAnchor: null,
      entries: [],
      terminalReason: null,
      isBusy: false,
      showTyping: false,
    });
  });

  test('adapts visible lifecycle into overlay-compatible presentation fields for surface consumers', () => {
    const visibleLifecycle = resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pendingTurn({
        turnRef: 'turn-local',
        userMessageId: 'user-local',
        text: 'local send',
      }),
      sdkLiveTurn: projection({
        phase: 'idle',
        turnRef: 'startup-hidden',
      }),
      messages: [{
        id: 'user-local',
        sender: 'user',
        text: 'local send',
      }],
    });

    expect(visibleLifecycle).toMatchObject({
      status: 'local_pending',
      source: 'local',
      turnRef: 'turn-local',
      awaitingAnchor: {
        kind: 'user-message',
        rowId: 'user-local',
      },
      isBusy: true,
      showTyping: true,
    });

    const localPendingPresentation = applyVisibleTurnLifecycleToPresentationState({
      awaitingDotTargetMessageId: null,
      chatboxSurfaceState: 'compact',
      overlayIntent: {
        mode: 'awaiting',
      },
    }, visibleLifecycle);
    expect(localPendingPresentation).toMatchObject({
      visibleTurnLifecycle: visibleLifecycle,
      isBusy: true,
      awaitingDotTargetMessageId: 'user-local',
      chatboxSurfaceState: 'awaiting-reply',
      overlayIntent: {
        mode: 'awaiting',
      },
    });

    const activePresentation = applyVisibleTurnLifecycleToPresentationState({
      isBusy: true,
      awaitingDotTargetMessageId: 'user-local',
      chatboxSurfaceState: 'response',
    }, {
      ...visibleLifecycle,
      status: 'active',
      source: 'sdk',
      isBusy: true,
      showTyping: false,
    });
    expect(activePresentation).toMatchObject({
      visibleTurnLifecycle: expect.objectContaining({
        status: 'active',
      }),
      isBusy: true,
      awaitingDotTargetMessageId: null,
      chatboxSurfaceState: 'response',
    });

    const terminalPresentation = applyVisibleTurnLifecycleToPresentationState({
      isBusy: true,
      awaitingDotTargetMessageId: 'user-local',
    }, {
      ...visibleLifecycle,
      status: 'terminal',
      source: 'sdk',
      isBusy: false,
      showTyping: false,
    });
    expect(terminalPresentation).toMatchObject({
      visibleTurnLifecycle: expect.objectContaining({
        status: 'terminal',
      }),
      isBusy: false,
      awaitingDotTargetMessageId: null,
    });
  });

  test('centralizes local pending-turn handoff on visible lifecycle status', () => {
    const pending = pendingTurn();
    const hiddenIdleProjection = projection({
      phase: 'idle',
      turnRef: 'startup-hidden',
      presentation: {
        typingVisible: false,
        overlayVisible: false,
        isBusy: false,
        hasVisibleContent: false,
        entries: [],
        overlayIntent: {
          visible: false,
          mode: 'hidden',
          turnRef: 'startup-hidden',
          conversationRef: 'conv-1',
          staleGuardRef: 'startup-hidden',
        },
      },
    });

    expect(resolveVisibleTurnLifecycle({
      sdkLiveTurn: hiddenIdleProjection,
      pendingTurn: pending,
      messages: [],
    })).toMatchObject({
      status: 'local_pending',
      source: 'local',
      isBusy: true,
      showTyping: true,
    });

    expect(resolveVisibleTurnLifecycle({
      sdkLiveTurn: hiddenIdleProjection,
      messages: [],
    })).toMatchObject({
      status: 'idle',
      source: 'sdk',
      isBusy: false,
      showTyping: false,
    });

    expect(resolveVisibleTurnLifecycle({
      sdkLiveTurn: projection({
        phase: 'awaiting',
        presentation: {
          typingVisible: true,
          overlayVisible: true,
          isBusy: true,
          hasVisibleContent: false,
          entries: [],
          overlayIntent: {
            visible: true,
            mode: 'awaiting',
            turnRef: 'turn-1',
            conversationRef: 'conv-1',
            staleGuardRef: 'turn-1',
          },
        },
      }),
      pendingTurn: pending,
      messages: [{
        id: 'user-1',
        sender: 'user',
        text: 'hello',
        turnRef: 'turn-1',
      }],
    })).toMatchObject({
      status: 'awaiting',
      source: 'sdk',
      isBusy: true,
      showTyping: true,
    });

    expect(resolveVisibleTurnLifecycle({
      sdkLiveTurn: projection({
        phase: 'complete',
        turnRef: 'turn-1',
        assistantText: 'previous complete response',
        presentation: undefined,
      }),
      pendingTurn: pendingTurn({
        turnRef: 'turn-2',
        userMessageId: 'user-2',
        text: 'second',
      }),
      messages: [
        { id: 'user-1', sender: 'user', text: 'first', turnRef: 'turn-1' },
        { id: 'assistant-1', sender: 'assistant', text: 'done', turnRef: 'turn-1' },
      ],
    })).toMatchObject({
      status: 'local_pending',
      source: 'local',
      turnRef: 'turn-2',
      isBusy: true,
      showTyping: true,
    });

    expect(resolveVisibleTurnLifecycle({
      sdkLiveTurn: projection({
        phase: 'complete',
        turnRef: 'turn-2',
        presentation: {
          typingVisible: false,
          overlayVisible: false,
          isBusy: false,
          isTerminal: true,
          hasVisibleContent: false,
          entries: [],
          overlayIntent: {
            visible: false,
            mode: 'hidden',
            turnRef: 'turn-2',
            conversationRef: 'conv-1',
            staleGuardRef: 'turn-2',
          },
        },
      }),
      pendingTurn: pendingTurn({
        turnRef: 'turn-2',
        userMessageId: 'user-2',
        text: 'second',
      }),
      messages: [{
        id: 'user-2',
        sender: 'user',
        text: 'second',
        turnRef: 'turn-2',
      }],
    })).toMatchObject({
      status: 'terminal',
      source: 'sdk',
      turnRef: 'turn-2',
      isBusy: false,
      showTyping: false,
    });
  });

});
