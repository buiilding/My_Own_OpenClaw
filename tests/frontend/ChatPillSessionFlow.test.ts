import {
  CHAT_PILL_SURFACE_REASON,
  resolveChatPillSendLifecycle,
  resolveChatPillViewIntent,
} from '../../frontend/src/renderer/features/chat/utils/chatPill/chatPillSessionFlow';

describe('chatPillSessionFlow', () => {
  test('resolves overlay-chatbox send lifecycle with screenshot capture', () => {
    expect(resolveChatPillSendLifecycle({
      senderSurface: 'overlay-chatbox',
      includeQueryScreenshot: true,
    })).toMatchObject({
      shouldCaptureQueryScreenshot: true,
      shouldReturnToChatboxOnSend: false,
      surfaceReason: CHAT_PILL_SURFACE_REASON.QUERY_SEND_WITH_CAPTURE,
    });
  });

  test('resolves main-window send lifecycle without capture or chatbox restore', () => {
    expect(resolveChatPillSendLifecycle({
      senderSurface: 'main-window',
      includeQueryScreenshot: true,
    })).toMatchObject({
      shouldCaptureQueryScreenshot: false,
      shouldReturnToChatboxOnSend: false,
      surfaceReason: CHAT_PILL_SURFACE_REASON.QUERY_SEND_WITHOUT_CAPTURE,
    });
  });

  test('prefers visible response turn id and response layout when a reply exists', () => {
    const viewIntent = resolveChatPillViewIntent({
      messages: [
        { id: 'user-1', sender: 'user', text: 'hello', turnRef: 'turn-user' },
        { id: 'assistant-1', sender: 'assistant', text: 'reply', turnRef: 'turn-assistant', type: 'llm-text' },
      ],
      currentTurnPresentationState: {
        visibleResponse: { id: 'assistant-1', sender: 'assistant', text: 'reply', turnRef: 'turn-assistant' },
        activeResponse: { id: 'assistant-1', sender: 'assistant', text: 'reply', turnRef: 'turn-assistant' },
        showChatboxAwaitingReply: false,
      },
      responseOverlayEntries: [{ id: 'assistant-1' }],
    });

    expect(viewIntent).toMatchObject({
      turnId: 'turn-assistant',
      showResponse: true,
      showAwaitingReply: false,
      overlayLayoutMode: 'response',
      isVisible: true,
    });
  });

  test('falls back to the latest chat turn id while awaiting', () => {
    const viewIntent = resolveChatPillViewIntent({
      messages: [
        { id: 'user-1', sender: 'user', text: 'hello', turnRef: 'turn-user' },
      ],
      currentTurnPresentationState: {
        activeResponse: null,
        visibleResponse: null,
        showChatboxAwaitingReply: true,
      },
      responseOverlayEntries: [],
    });

    expect(viewIntent).toMatchObject({
      turnId: 'turn-user',
      showResponse: false,
      showAwaitingReply: true,
      overlayLayoutMode: 'awaiting-typing',
      isVisible: true,
    });
  });

  test('prefers awaiting layout over a stale prior response during new-turn handoff', () => {
    const viewIntent = resolveChatPillViewIntent({
      messages: [
        { id: 'user-1', sender: 'user', text: 'hello', turnRef: 'turn-user' },
        { id: 'assistant-1', sender: 'assistant', text: 'reply', turnRef: 'turn-assistant', type: 'llm-text' },
      ],
      currentTurnPresentationState: {
        activeResponse: { id: 'assistant-1', sender: 'assistant', text: 'reply', turnRef: 'turn-assistant' },
        visibleResponse: { id: 'assistant-1', sender: 'assistant', text: 'reply', turnRef: 'turn-assistant' },
        overlayTurnLifecycle: 'awaiting',
        showChatboxAwaitingReply: true,
      },
      responseOverlayEntries: [{ id: 'assistant-1' }],
    });

    expect(viewIntent).toMatchObject({
      turnId: 'turn-assistant',
      showResponse: false,
      showAwaitingReply: true,
      overlayLayoutMode: 'awaiting-typing',
      isVisible: true,
    });
  });
});
