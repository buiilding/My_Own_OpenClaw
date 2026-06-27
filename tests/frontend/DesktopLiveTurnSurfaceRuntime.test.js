import {
  DesktopLiveTurnSurfaceRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopLiveTurnSurfaceRuntime';

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
  displayRows = [],
  actions = {
    canEdit: false,
    canRetry: false,
    canFork: false,
  },
} = {}) {
  return {
    conversationRef,
    revisionId: null,
    displayRows,
    liveTurn: {
      turnRef,
      phase: mode === 'hidden' ? 'idle' : mode === 'awaiting' ? 'awaiting' : 'streaming',
      isBusy: mode !== 'hidden',
      isTerminal: false,
      entries,
    },
    surfaces: {
      dashboard: {
        mode: 'normal',
        visible: true,
      },
      pill: {
        mode: 'normal',
        visible: true,
      },
      responseOverlay: {
        mode,
        visible: mode !== 'hidden',
        guardRef: turnRef,
        ownerConversationRef: conversationRef,
        turnRef,
      },
    },
    actions,
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
      conversationView: conversationView({
        conversationRef: 'conv-view',
        mode: 'hidden',
        turnRef: null,
        entries: [],
      }),
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

  test('falls back to SDK current-turn presentation for malformed ConversationView envelopes', () => {
    const result = resolveLiveTurnPresentationInput({
      conversationView: {
        conversationRef: ' conv-1 ',
        revisionId: null,
        displayRows: [],
        liveTurn: [],
        surfaces: {
          responseOverlay: {
            mode: 'response',
            visible: true,
            ownerConversationRef: 'conv-1',
            turnRef: 'turn-view',
          },
        },
        actions: {
          canEdit: false,
          canRetry: false,
          canFork: false,
        },
      },
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-live',
        phase: 'streaming',
        presentation: {
          entries: [{
            id: 'entry-live',
            type: 'llm-text',
            text: 'current-turn response',
          }],
        },
      },
    });

    expect(result).toMatchObject({
      source: 'sdk-current-turn',
      phase: 'streaming',
      turnRef: 'turn-live',
      conversationRef: 'conv-1',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: true,
      entries: [
        expect.objectContaining({
          id: 'entry-live',
          text: 'current-turn response',
        }),
      ],
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
