/**
 * Covers renderer-visible turn lifecycle projection for desktop surfaces.
 */

import {
  DesktopVisibleTurnLifecycleRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime';

const {
  applyVisibleTurnLifecycleToPresentationState,
  hasAuthoritativeSdkProjection,
  hasAuthoritativeSameTurnSdkReplacement,
  resolveVisibleTurnLifecycle,
  resolveVisibleTurnLifecycleForPresentation,
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
    expect(visibleLifecycleModule.shouldUseLocalSendPreflight).toBeUndefined();
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

    expect(hasAuthoritativeSameTurnSdkReplacement(pending, projection({
      phase: 'idle',
    }))).toBe(false);
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      currentTurnProjection: projection({ phase: 'idle' }),
      messages,
    })).toMatchObject({
      status: 'local_pending',
      showTyping: true,
    });

    expect(hasAuthoritativeSameTurnSdkReplacement(pending, projection({
      phase: 'streaming',
    }))).toBe(false);
    expect(hasAuthoritativeSdkProjection(projection({
      phase: 'streaming',
    }))).toBe(false);
    expect(resolveVisibleTurnLifecycle({
      activeConversationRef: 'conv-1',
      pendingTurn: pending,
      currentTurnProjection: projection({ phase: 'streaming' }),
      messages,
    })).toMatchObject({
      status: 'local_pending',
      showTyping: true,
    });

    expect(hasAuthoritativeSdkProjection(projection({
      phase: 'streaming',
      assistantText: 'visible response',
    }))).toBe(true);

    expect(hasAuthoritativeSameTurnSdkReplacement(pending, projection({
      turnRef: 'turn-previous',
      phase: 'complete',
      presentation: {
        isTerminal: true,
        entries: [],
      },
    }))).toBe(false);
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

    expect(hasAuthoritativeSameTurnSdkReplacement(pending, awaitingProjection)).toBe(true);
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
    expect(hasAuthoritativeSameTurnSdkReplacement(pending, progressProjection)).toBe(true);
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
    expect(hasAuthoritativeSameTurnSdkReplacement(pending, textProjection)).toBe(true);
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
    expect(hasAuthoritativeSameTurnSdkReplacement(pending, terminalProjection)).toBe(true);
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
    const visibleLifecycle = resolveVisibleTurnLifecycleForPresentation({
      visibleTurnLifecycle: {
        status: 'idle',
        source: 'sdk',
        conversationRef: 'conv-1',
        turnRef: null,
        awaitingAnchor: null,
        entries: [],
        terminalReason: null,
        isBusy: false,
        showTyping: false,
      },
      liveTurnPresentationInput: {
        useLocalSendLatch: true,
        conversationRef: 'conv-1',
        turnRef: 'turn-local',
      },
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

    expect(applyVisibleTurnLifecycleToPresentationState({
      loopUiState: 'idle',
      isAwaitingReply: false,
      showAssistantAwaitingDot: false,
      awaitingDotTargetMessageId: null,
      chatboxSurfaceState: 'compact',
      showChatboxAwaitingReply: false,
      showChatboxResponse: true,
      overlayIntent: {
        mode: 'awaiting',
      },
    }, visibleLifecycle)).toMatchObject({
      visibleTurnLifecycle: visibleLifecycle,
      overlayTurnLifecycle: 'preflight',
      isBusy: true,
      loopUiState: 'awaiting-reply',
      isAwaitingReply: true,
      showAssistantAwaitingDot: true,
      awaitingDotTargetMessageId: 'user-local',
      chatboxSurfaceState: 'awaiting-reply',
      showChatboxAwaitingReply: true,
      showChatboxResponse: false,
      overlayIntent: {
        mode: 'awaiting',
      },
    });

    expect(applyVisibleTurnLifecycleToPresentationState({
      isBusy: true,
      isAwaitingReply: true,
      showAssistantAwaitingDot: true,
      awaitingDotTargetMessageId: 'user-local',
      showChatboxAwaitingReply: true,
      showChatboxResponse: true,
    }, {
      ...visibleLifecycle,
      status: 'active',
      source: 'sdk',
      isBusy: true,
      showTyping: false,
    })).toMatchObject({
      overlayTurnLifecycle: 'active',
      isBusy: true,
      isAwaitingReply: false,
      showAssistantAwaitingDot: false,
      awaitingDotTargetMessageId: null,
      showChatboxAwaitingReply: false,
      showChatboxResponse: true,
    });

    expect(applyVisibleTurnLifecycleToPresentationState({
      overlayTurnLifecycle: 'active',
      isBusy: true,
      isAwaitingReply: true,
      showAssistantAwaitingDot: true,
      awaitingDotTargetMessageId: 'user-local',
      showChatboxAwaitingReply: true,
    }, {
      ...visibleLifecycle,
      status: 'terminal',
      source: 'sdk',
      isBusy: false,
      showTyping: false,
    })).toMatchObject({
      overlayTurnLifecycle: 'terminal',
      isBusy: false,
      isAwaitingReply: false,
      showAssistantAwaitingDot: false,
      awaitingDotTargetMessageId: null,
      showChatboxAwaitingReply: false,
    });
  });

  test('centralizes local send preflight handoff for live surface consumers', () => {
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
      messages: [],
    })).toBe(true);

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
      messages: [{
        id: 'user-2',
        sender: 'user',
        text: 'second',
        turnRef: 'turn-2',
      }],
    })).toBe(false);
  });
});
