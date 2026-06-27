import {
  DesktopLiveTurnSurfaceRuntime,
} from '../../src/renderer/app/runtime/desktopLiveTurnSurfaceRuntime';

const {
  resolveLiveTurnPresentationInput,
} = DesktopLiveTurnSurfaceRuntime;

function conversationView({
  conversationRef = 'conv-1',
  mode = 'response',
  turnRef = 'turn-view',
  entries = [{
    id: 'entry-view',
    type: 'llm-text',
    text: 'view response',
  }],
} = {}) {
  return {
    conversationRef,
    liveTurn: {
      turnRef,
      phase: mode === 'awaiting' ? 'awaiting' : 'streaming',
      isBusy: mode !== 'hidden',
      isTerminal: false,
      entries,
    },
    surfaces: {
      responseOverlay: {
        mode,
        visible: mode !== 'hidden',
        guardRef: turnRef,
        ownerConversationRef: conversationRef,
        turnRef,
      },
    },
  };
}

describe('DesktopLiveTurnSurfaceRuntime', () => {
  test('uses ConversationView response overlay before stale current-turn projection', () => {
    const result = resolveLiveTurnPresentationInput({
      conversationView: conversationView({
        mode: 'response',
        turnRef: 'turn-view',
      }),
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-stale',
        phase: 'awaiting',
        assistantText: '',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
      },
    });

    expect(result).toMatchObject({
      source: 'conversation-view',
      phase: 'streaming',
      turnRef: 'turn-view',
      conversationRef: 'conv-1',
      guardRef: 'turn-view',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: true,
      overlayIntent: expect.objectContaining({
        mode: 'response',
        visible: true,
        turnRef: 'turn-view',
        staleGuardRef: 'turn-view',
      }),
      entries: [
        expect.objectContaining({
          id: 'entry-view',
          text: 'view response',
        }),
      ],
    });
  });

  test('keeps local pending before an unrelated ConversationView live turn', () => {
    const result = resolveLiveTurnPresentationInput({
      conversationView: conversationView({
        conversationRef: 'conv-other',
        turnRef: 'turn-other',
      }),
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-local',
        userMessageId: 'user-local',
        text: 'hello',
        timestamp: '2026-06-25T12:00:00.000Z',
        attachmentFilenames: null,
      },
    });

    expect(result).toMatchObject({
      source: 'pending-turn',
      useLocalPendingTurn: true,
      turnRef: 'turn-local',
      conversationRef: 'conv-1',
      overlayIntent: expect.objectContaining({
        mode: 'awaiting',
      }),
    });
  });

  test('does not borrow stale current-turn conversation refs for pending surface identity', () => {
    const result = resolveLiveTurnPresentationInput({
      pendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-local',
        userMessageId: 'user-local',
        text: 'hello',
        timestamp: '2026-06-25T12:00:00.000Z',
        attachmentFilenames: null,
      },
      sdkLiveTurn: {
        conversationRef: 'conv-stale',
        turnRef: 'turn-stale',
        phase: 'complete',
      },
    });

    expect(result).toMatchObject({
      source: 'pending-turn',
      useLocalPendingTurn: true,
      turnRef: 'turn-local',
      conversationRef: 'conv-pending',
      overlayIntent: expect.objectContaining({
        conversationRef: 'conv-pending',
        turnRef: 'turn-local',
      }),
    });
  });

  test('does not fall through to raw current-turn surface state when ConversationView is idle', () => {
    const result = resolveLiveTurnPresentationInput({
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
        conversationRef: 'conv-stale',
        turnRef: 'turn-stale',
        phase: 'streaming',
        assistantText: 'stale raw answer',
        presentation: {
          entries: [{
            id: 'stale-entry',
            type: 'llm-text',
            text: 'stale raw answer',
          }],
        },
      },
    });

    expect(result).toMatchObject({
      source: 'conversation-view',
      phase: 'idle',
      isBusy: false,
      turnRef: null,
      conversationRef: 'conv-view',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: false,
      entries: [],
      overlayIntent: expect.objectContaining({
        mode: 'hidden',
        visible: false,
        conversationRef: 'conv-view',
      }),
    });
  });

  test('lets same-turn ConversationView replace local pending surface state', () => {
    const result = resolveLiveTurnPresentationInput({
      conversationView: conversationView({
        conversationRef: 'conv-1',
        turnRef: 'turn-local',
      }),
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-local',
        userMessageId: 'user-local',
        text: 'hello',
        timestamp: '2026-06-25T12:00:00.000Z',
        attachmentFilenames: null,
      },
    });

    expect(result).toMatchObject({
      source: 'conversation-view',
      useLocalPendingTurn: false,
      turnRef: 'turn-local',
      conversationRef: 'conv-1',
    });
  });
});
