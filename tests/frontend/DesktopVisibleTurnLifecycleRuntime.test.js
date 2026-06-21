/**
 * Covers renderer-visible turn lifecycle projection for desktop surfaces.
 */

import {
  DesktopVisibleTurnLifecycleRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime';

const {
  hasAuthoritativeSameTurnSdkReplacement,
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
    const visibleLifecycleModule = require('../../frontend/src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime');

    expect(visibleLifecycleModule.DesktopVisibleTurnLifecycleRuntime).toBe(DesktopVisibleTurnLifecycleRuntime);
    expect(visibleLifecycleModule.hasAuthoritativeSameTurnSdkReplacement).toBeUndefined();
    expect(visibleLifecycleModule.resolveVisibleTurnLifecycle).toBeUndefined();
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
});
