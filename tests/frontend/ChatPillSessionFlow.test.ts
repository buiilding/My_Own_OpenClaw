/**
 * Covers chat pill session flow. behavior in the frontend test suite.
 */

import { DesktopChatPillSessionRuntime } from '../../frontend/src/renderer/app/runtime/desktopChatPillSessionRuntime';

describe('desktopChatPillSessionRuntime', () => {
  const {
    resolveChatPillSendLifecycle,
    resolveChatPillViewIntent,
  } = DesktopChatPillSessionRuntime;

  test('resolves overlay-chatbox send lifecycle with screenshot capture', () => {
    expect(resolveChatPillSendLifecycle({
      senderSurface: 'overlay-chatbox',
      includeQueryScreenshot: true,
    })).toMatchObject({
      shouldCaptureQueryScreenshot: true,
      shouldReturnToChatboxOnSend: false,
      surfaceReason: 'query_send_with_capture',
    });
  });

  test('resolves overlay-chatbox sends without capture or chatbox restore by default', () => {
    expect(resolveChatPillSendLifecycle({
      senderSurface: 'overlay-chatbox',
      includeQueryScreenshot: false,
    })).toMatchObject({
      senderSurface: 'overlay-chatbox',
      shouldCaptureQueryScreenshot: false,
      shouldReturnToChatboxOnSend: false,
      surfaceReason: 'query_send_without_capture',
      sendUiBehavior: {
        returnToChatboxPolicy: 'never',
        shouldReturnToChatboxOnSend: false,
      },
    });
  });

  test('honors return-to-chatbox policy after normalizing capture intent', () => {
    expect(resolveChatPillSendLifecycle({
      senderSurface: 'overlay-chatbox',
      returnToChatboxPolicy: 'auto',
      includeQueryScreenshot: true,
    })).toMatchObject({
      shouldCaptureQueryScreenshot: true,
      shouldReturnToChatboxOnSend: true,
      sendUiBehavior: {
        returnToChatboxPolicy: 'auto',
        shouldReturnToChatboxOnSend: true,
      },
    });

    expect(resolveChatPillSendLifecycle({
      senderSurface: 'overlay-chatbox',
      returnToChatboxPolicy: 'always',
      includeQueryScreenshot: false,
    })).toMatchObject({
      shouldCaptureQueryScreenshot: false,
      shouldReturnToChatboxOnSend: true,
      sendUiBehavior: {
        returnToChatboxPolicy: 'always',
        shouldReturnToChatboxOnSend: true,
      },
    });
  });

  test('resolves main-window send lifecycle without capture or chatbox restore', () => {
    expect(resolveChatPillSendLifecycle({
      senderSurface: 'main-window',
      includeQueryScreenshot: true,
    })).toMatchObject({
      shouldCaptureQueryScreenshot: false,
      shouldReturnToChatboxOnSend: false,
      surfaceReason: 'query_send_without_capture',
    });
  });

  test('keeps main-window sends from restoring the chatbox even with an always policy', () => {
    expect(resolveChatPillSendLifecycle({
      senderSurface: 'main-window',
      returnToChatboxPolicy: 'always',
      includeQueryScreenshot: true,
    })).toMatchObject({
      shouldCaptureQueryScreenshot: false,
      shouldReturnToChatboxOnSend: false,
      sendUiBehavior: {
        returnToChatboxPolicy: 'always',
        shouldReturnToChatboxOnSend: true,
      },
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

  test('prefers visible response turn id over a different active response turn id', () => {
    const viewIntent = resolveChatPillViewIntent({
      messages: [
        { id: 'user-1', sender: 'user', text: 'hello', turnRef: 'turn-user' },
        { id: 'assistant-active', sender: 'assistant', text: 'old reply', turnRef: 'turn-active', type: 'llm-text' },
        { id: 'assistant-visible', sender: 'assistant', text: 'visible reply', turnRef: 'turn-visible', type: 'llm-text' },
      ],
      currentTurnPresentationState: {
        visibleResponse: { id: 'assistant-visible', sender: 'assistant', text: 'visible reply', turnRef: 'turn-visible' },
        activeResponse: { id: 'assistant-active', sender: 'assistant', text: 'old reply', turnRef: 'turn-active' },
        showChatboxAwaitingReply: false,
      },
      responseOverlayEntries: [{ id: 'assistant-visible' }],
    });

    expect(viewIntent).toMatchObject({
      turnId: 'turn-visible',
      showResponse: true,
      latestResponseOverlayEntryId: 'assistant-visible',
    });
  });

  test('falls back to active response turn id before message history', () => {
    const viewIntent = resolveChatPillViewIntent({
      messages: [
        { id: 'user-1', sender: 'user', text: 'hello', turnRef: 'turn-user' },
        { id: 'assistant-1', sender: 'assistant', text: 'reply', turnRef: 'turn-history', type: 'llm-text' },
      ],
      currentTurnPresentationState: {
        visibleResponse: null,
        activeResponse: { id: 'assistant-active', sender: 'assistant', text: 'reply', turnRef: 'turn-active' },
        showChatboxAwaitingReply: false,
      },
      responseOverlayEntries: [{ id: 'assistant-active' }],
    });

    expect(viewIntent).toMatchObject({
      turnId: 'turn-active',
      showResponse: true,
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

  test('skips blank turn refs when falling back to the latest chat turn id', () => {
    const viewIntent = resolveChatPillViewIntent({
      messages: [
        { id: 'user-1', sender: 'user', text: 'first', turnRef: 'turn-user' },
        { id: 'assistant-blank', sender: 'assistant', text: 'blank', turnRef: '   ', type: 'llm-text' },
        { id: 'assistant-missing', sender: 'assistant', text: 'missing', type: 'llm-text' },
      ],
      currentTurnPresentationState: {
        activeResponse: null,
        visibleResponse: null,
        showChatboxAwaitingReply: false,
      },
      responseOverlayEntries: [],
    });

    expect(viewIntent).toMatchObject({
      turnId: 'turn-user',
      showResponse: false,
      overlayLayoutMode: 'hidden',
      isVisible: false,
    });
  });

  test('propagates dismissed response state through the view contract', () => {
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
      dismissedResponseId: 'assistant-1',
    });

    expect(viewIntent).toMatchObject({
      latestResponseOverlayEntryId: 'assistant-1',
      turnId: 'turn-assistant',
      showResponse: false,
      showAwaitingReply: false,
      overlayLayoutMode: 'hidden',
      isVisible: false,
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
        visibleTurnLifecycle: {
          status: 'local_pending',
        },
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
