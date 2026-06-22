/**
 * Covers renderer-visible turn lifecycle projection for desktop surfaces.
 */

import {
  DesktopVisibleTurnLifecycleRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime';

const {
  applyVisibleTurnLifecycleToPresentationState,
  resolvePendingTurnForCurrentProjection,
  resolveVisibleTurnLifecycle,
  shouldUseLocalSendPreflight,
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
    const visibleLifecycleModule = require('../../frontend/src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime');

    expect(visibleLifecycleModule.DesktopVisibleTurnLifecycleRuntime).toBe(DesktopVisibleTurnLifecycleRuntime);
    expect(visibleLifecycleModule.hasAuthoritativeSdkProjection).toBeUndefined();
    expect(visibleLifecycleModule.hasAuthoritativeSameTurnSdkReplacement).toBeUndefined();
    expect(visibleLifecycleModule.resolveVisibleTurnLifecycle).toBeUndefined();
    expect(visibleLifecycleModule.resolvePendingTurnForCurrentProjection).toBeUndefined();
    expect(visibleLifecycleModule.buildCurrentTurnPresentationSnapshotSignature).toBeUndefined();
    expect(visibleLifecycleModule.isCurrentTurnPresentationOverlayLifecycleBusy).toBeUndefined();
    expect(visibleLifecycleModule.resolveCurrentTurnPresentationOverlayLifecycle).toBeUndefined();
    expect(visibleLifecycleModule.shouldUseLocalSendPreflight).toBeUndefined();
    expect(DesktopVisibleTurnLifecycleRuntime.hasAuthoritativeSdkProjection).toBeUndefined();
    expect(DesktopVisibleTurnLifecycleRuntime.hasAuthoritativeSameTurnSdkReplacement).toBeUndefined();
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
      currentTurnProjection: null,
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

    expect(resolvePendingTurnForCurrentProjection({
      pendingTurn: pending,
      currentTurnProjection: projection({ phase: 'idle' }),
    })).toBe(pending);
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      currentTurnProjection: projection({ phase: 'idle' }),
      messages,
    })).toMatchObject({
      status: 'local_pending',
      showTyping: true,
    });

    expect(resolvePendingTurnForCurrentProjection({
      pendingTurn: pending,
      currentTurnProjection: projection({ phase: 'streaming' }),
    })).toBe(pending);
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      currentTurnProjection: projection({ phase: 'streaming' }),
      messages,
    })).toMatchObject({
      status: 'local_pending',
      showTyping: true,
    });

    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      currentTurnProjection: projection({
        phase: 'streaming',
        assistantText: 'visible response',
      }),
      messages,
    })).toMatchObject({
      status: 'active',
      showTyping: false,
    });

    expect(resolvePendingTurnForCurrentProjection({
      pendingTurn: pending,
      currentTurnProjection: projection({
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
      currentTurnProjection: projection({
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

    expect(resolvePendingTurnForCurrentProjection({
      pendingTurn: pending,
      currentTurnProjection: awaitingProjection,
    })).toBeNull();
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      currentTurnProjection: awaitingProjection,
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
    });
    expect(resolvePendingTurnForCurrentProjection({
      pendingTurn: pending,
      currentTurnProjection: progressProjection,
    })).toBeNull();
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      currentTurnProjection: progressProjection,
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
    expect(resolvePendingTurnForCurrentProjection({
      pendingTurn: pending,
      currentTurnProjection: textProjection,
    })).toBeNull();
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      currentTurnProjection: textProjection,
    })).toMatchObject({
      status: 'active',
      entries: [{
        id: 'entry-1',
        type: 'llm-text',
        text: 'Hello there',
      }],
      showTyping: false,
    });

    const terminalProjection = projection({
      phase: 'complete',
      presentation: {
        isTerminal: true,
        entries: [],
      },
    });
    expect(resolvePendingTurnForCurrentProjection({
      pendingTurn: pending,
      currentTurnProjection: terminalProjection,
    })).toBeNull();
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      currentTurnProjection: terminalProjection,
    })).toMatchObject({
      status: 'terminal',
      terminalReason: 'complete',
      isBusy: false,
      showTyping: false,
    });
  });

  test('adapts visible lifecycle into legacy presentation fields for surface consumers', () => {
    const visibleLifecycle = resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pendingTurn({
        turnRef: 'turn-local',
        userMessageId: 'user-local',
        text: 'local send',
      }),
      currentTurnProjection: projection({
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
      loopUiState: 'idle',
      awaitingDotTargetMessageId: null,
      chatboxSurfaceState: 'compact',
      showChatboxAwaitingReply: false,
      showChatboxResponse: true,
      overlayIntent: {
        mode: 'awaiting',
      },
    }, visibleLifecycle);
    expect(localPendingPresentation).toMatchObject({
      visibleTurnLifecycle: visibleLifecycle,
      isBusy: true,
      loopUiState: 'awaiting-reply',
      awaitingDotTargetMessageId: 'user-local',
      chatboxSurfaceState: 'awaiting-reply',
      showChatboxAwaitingReply: true,
      showChatboxResponse: false,
      overlayIntent: {
        mode: 'awaiting',
      },
    });
    expect(localPendingPresentation.overlayTurnLifecycle).toBeUndefined();

    const activePresentation = applyVisibleTurnLifecycleToPresentationState({
      isBusy: true,
      awaitingDotTargetMessageId: 'user-local',
      showChatboxAwaitingReply: true,
      showChatboxResponse: true,
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
      showChatboxAwaitingReply: false,
      showChatboxResponse: true,
    });
    expect(activePresentation.overlayTurnLifecycle).toBeUndefined();

    const terminalPresentation = applyVisibleTurnLifecycleToPresentationState({
      overlayTurnLifecycle: 'active',
      isBusy: true,
      awaitingDotTargetMessageId: 'user-local',
      showChatboxAwaitingReply: true,
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
      showChatboxAwaitingReply: false,
    });
    expect(terminalPresentation.overlayTurnLifecycle).toBeUndefined();
  });

  test('centralizes local send preflight handoff for live surface consumers', () => {
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

    expect(shouldUseLocalSendPreflight({
      currentTurnProjection: hiddenIdleProjection,
      isSending: true,
      pendingTurn: pending,
      messages: [],
    })).toBe(true);

    expect(shouldUseLocalSendPreflight({
      currentTurnProjection: hiddenIdleProjection,
      isSending: true,
      messages: [],
    })).toBe(false);

    expect(shouldUseLocalSendPreflight({
      currentTurnProjection: projection({
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
      isSending: true,
      pendingTurn: pending,
      messages: [{
        id: 'user-1',
        sender: 'user',
        text: 'hello',
        turnRef: 'turn-1',
      }],
    })).toBe(false);

    expect(shouldUseLocalSendPreflight({
      currentTurnProjection: projection({
        phase: 'complete',
        turnRef: 'turn-1',
        assistantText: 'previous complete response',
        presentation: undefined,
      }),
      isSending: true,
      pendingTurn: pendingTurn({
        turnRef: 'turn-2',
        userMessageId: 'user-2',
        text: 'second',
      }),
      messages: [
        { id: 'user-1', sender: 'user', text: 'first', turnRef: 'turn-1' },
        { id: 'assistant-1', sender: 'assistant', text: 'done', turnRef: 'turn-1' },
      ],
    })).toBe(true);

    expect(shouldUseLocalSendPreflight({
      currentTurnProjection: projection({
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
      isSending: true,
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
    })).toBe(false);
  });

});
