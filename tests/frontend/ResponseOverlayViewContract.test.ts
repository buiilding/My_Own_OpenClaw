/**
 * Covers response overlay view contract. behavior in the frontend test suite.
 */

import { DesktopResponseOverlayViewRuntime } from '../../frontend/src/renderer/app/runtime/desktopResponseOverlayViewRuntime';

describe('desktopResponseOverlayViewRuntime', () => {
  const {
    resolveResponseOverlayEntries,
    resolveResponseOverlayViewContract,
  } = DesktopResponseOverlayViewRuntime;

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
