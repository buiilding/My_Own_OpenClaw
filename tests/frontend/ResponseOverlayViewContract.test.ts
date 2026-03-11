import { resolveResponseOverlayViewContract } from '../../frontend/src/renderer/features/chat/utils/overlay/responseOverlayViewContract';

describe('responseOverlayViewContract', () => {
  test('shows response when entries exist and are not dismissed', () => {
    expect(resolveResponseOverlayViewContract({
      currentTurnPresentationState: {
        showChatboxAwaitingReply: true,
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
        showChatboxAwaitingReply: true,
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

  test('hides overlay when no response or awaiting state is active', () => {
    expect(resolveResponseOverlayViewContract({
      currentTurnPresentationState: {
        showChatboxAwaitingReply: false,
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
