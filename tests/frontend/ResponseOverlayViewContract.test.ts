/**
 * Covers response overlay view contract. behavior in the frontend test suite.
 */

import { DesktopResponseOverlayViewRuntime } from '../../frontend/src/renderer/app/runtime/desktopResponseOverlayViewRuntime';

describe('desktopResponseOverlayViewRuntime', () => {
  const {
    resolveResponseOverlayViewContract,
  } = DesktopResponseOverlayViewRuntime;

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
      showResponse: true,
      showAwaitingReply: false,
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
      showResponse: false,
      showAwaitingReply: true,
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
      showResponse: false,
      showAwaitingReply: true,
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
      showResponse: true,
      showAwaitingReply: false,
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
      showResponse: false,
      showAwaitingReply: false,
      overlayLayoutMode: 'hidden',
      isVisible: false,
    });
  });
});
