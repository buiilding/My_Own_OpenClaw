/**
 * Covers live turn surface state. behavior in the frontend test suite.
 */

import {
  RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF,
} from '../../frontend/src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime';
import {
  resolveLiveTurnPresentationInput,
} from '../../frontend/src/renderer/app/runtime/desktopLiveTurnSurfaceRuntime';

describe('desktopLiveTurnSurfaceRuntime', () => {
  test('uses SDK current turn as live surface authority', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: {
        phase: 'complete',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
      },
      isSending: false,
    });

    expect(state).toMatchObject({
      phase: 'complete',
      isSending: false,
      source: 'current-turn',
      useLocalSendLatch: false,
      useSdkLiveTurnPresentation: false,
    });
  });

  test('keeps a new send latch when terminal projection belongs to a previous turn', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: {
        phase: 'complete',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
      },
      isSending: true,
      messages: [
        { id: 'user-1', sender: 'user', text: 'first', turnRef: 'turn-1' },
        { id: 'assistant-1', sender: 'assistant', text: 'done', turnRef: 'turn-1' },
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isSending: true,
      isBusy: true,
      showAwaiting: true,
      source: 'send-preflight',
      useLocalSendLatch: true,
      useSdkLiveTurnPresentation: false,
      turnRef: 'turn-2',
      guardRef: RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF,
      overlayIntent: {
        visible: true,
        mode: 'awaiting',
        turnRef: 'turn-2',
        conversationRef: 'conv-1',
        staleGuardRef: RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF,
      },
    });
  });

  test('uses only the local send latch when SDK current turn is not open yet', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: null,
      isSending: true,
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isSending: true,
      isBusy: true,
      source: 'send-preflight',
      useLocalSendLatch: true,
      useSdkLiveTurnPresentation: false,
      guardRef: RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF,
      overlayIntent: expect.objectContaining({
        mode: 'awaiting',
        staleGuardRef: RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF,
      }),
    });
  });

  test('uses pending turn before SDK current turn arrives', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: null,
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-pending',
        userMessageId: 'user-pending',
        text: 'start now',
        timestamp: '2026-06-16T00:00:00.000Z',
        attachmentFilenames: null,
      },
      isSending: true,
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isSending: true,
      isBusy: true,
      source: 'pending-turn',
      useLocalSendLatch: true,
      turnRef: 'turn-pending',
      conversationRef: 'conv-1',
      overlayIntent: {
        visible: true,
        mode: 'awaiting',
        turnRef: 'turn-pending',
        conversationRef: 'conv-1',
      },
    });
  });

  test('uses SDK current turn over pending turn once SDK owns that turn', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: {
        phase: 'awaiting',
        conversationRef: 'conv-1',
        turnRef: 'turn-pending',
        assistantText: '',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
        presentation: {
          typingVisible: true,
          overlayVisible: true,
          isBusy: true,
          hasVisibleContent: false,
          entries: [],
          overlayIntent: {
            visible: true,
            mode: 'awaiting',
            turnRef: 'turn-pending',
            conversationRef: 'conv-1',
            staleGuardRef: 'turn-pending',
          },
        },
      },
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-pending',
        userMessageId: 'user-pending',
        text: 'start now',
        timestamp: '2026-06-16T00:00:00.000Z',
        attachmentFilenames: null,
      },
      isSending: true,
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isSending: true,
      isBusy: true,
      source: 'sdk-current-turn',
      useLocalSendLatch: false,
      useSdkLiveTurnPresentation: true,
      turnRef: 'turn-pending',
      conversationRef: 'conv-1',
    });
  });

  test('keeps send preflight when SDK presentation is hidden during handoff', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: {
        phase: 'awaiting',
        conversationRef: 'conv-1',
        turnRef: 'turn-2',
        presentation: {
          typingVisible: false,
          overlayVisible: false,
          isBusy: false,
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
      },
      isSending: true,
      messages: [
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isSending: true,
      isBusy: true,
      source: 'send-preflight',
      useLocalSendLatch: true,
      useSdkLiveTurnPresentation: true,
      showAwaiting: true,
    });
  });

  test('keeps send preflight through unanchored hidden idle SDK projection', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: {
        phase: 'idle',
        conversationRef: 'conv-1',
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
      },
      isSending: true,
      messages: [],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isSending: true,
      source: 'send-preflight',
      useLocalSendLatch: true,
      useSdkLiveTurnPresentation: true,
    });
  });

  test('uses terminal SDK projection for the stopped current turn even when send latch is stale', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: {
        phase: 'complete',
        conversationRef: 'conv-1',
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
      },
      isSending: true,
      messages: [
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'complete',
      isSending: false,
      isBusy: false,
      source: 'sdk-current-turn',
      useLocalSendLatch: false,
      useSdkLiveTurnPresentation: true,
    });
  });

  test('keeps send preflight over previous terminal projection before optimistic row lands', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: {
        phase: 'complete',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        assistantText: 'previous complete response',
      },
      isSending: true,
      messages: [
        { id: 'user-1', sender: 'user', text: 'first', turnRef: 'turn-1' },
        { id: 'assistant-1', sender: 'assistant', text: 'done', turnRef: 'turn-1' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isSending: true,
      source: 'send-preflight',
      useLocalSendLatch: true,
      useSdkLiveTurnPresentation: false,
    });
  });

  test('lets SDK awaiting presentation supersede send preflight', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: {
        phase: 'awaiting',
        conversationRef: 'conv-1',
        turnRef: 'turn-2',
        presentation: {
          typingVisible: true,
          overlayVisible: true,
          isBusy: true,
          hasVisibleContent: false,
          entries: [],
          overlayIntent: {
            visible: true,
            mode: 'awaiting',
            turnRef: 'turn-2',
            conversationRef: 'conv-1',
            staleGuardRef: 'turn-2',
          },
        },
      },
      isSending: true,
      messages: [
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isSending: true,
      source: 'sdk-current-turn',
      useLocalSendLatch: false,
      useSdkLiveTurnPresentation: true,
      showAwaiting: true,
      guardRef: 'turn-2',
    });
  });

  test('ignores legacy stream phase inputs when SDK current turn is absent', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: null,
      streamTracking: { phase: 'streaming' },
      phase: 'tool-call',
      isSending: false,
    });

    expect(state).toMatchObject({
      phase: 'idle',
      isSending: false,
      source: 'idle',
    });
  });
});
