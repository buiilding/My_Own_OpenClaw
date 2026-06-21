/**
 * Covers live turn surface state. behavior in the frontend test suite.
 */

import { DesktopResponseOverlayPhaseRuntime } from '../../frontend/src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime';
import {
  DesktopLiveTurnSurfaceRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopLiveTurnSurfaceRuntime';

const preflightGuardRef = DesktopResponseOverlayPhaseRuntime.getResponseOverlayPreflightGuardRef();
const {
  resolveLiveTurnPresentationInput,
} = DesktopLiveTurnSurfaceRuntime;

function pendingTurn(overrides = {}) {
  return {
    conversationRef: 'conv-1',
    turnRef: 'turn-pending',
    userMessageId: 'user-pending',
    text: 'start now',
    timestamp: '2026-06-16T00:00:00.000Z',
    attachmentFilenames: null,
    ...overrides,
  };
}

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

  test('keeps local pending when terminal projection belongs to a previous turn', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: {
        phase: 'complete',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
      },
      pendingTurn: pendingTurn({
        turnRef: 'turn-2',
        userMessageId: 'user-2',
        text: 'second',
      }),
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
      source: 'pending-turn',
      useLocalSendLatch: true,
      useSdkLiveTurnPresentation: false,
      turnRef: 'turn-2',
      guardRef: preflightGuardRef,
      overlayIntent: {
        visible: true,
        mode: 'awaiting',
        turnRef: 'turn-2',
        conversationRef: 'conv-1',
        staleGuardRef: preflightGuardRef,
      },
    });
  });

  test('uses pending turn when SDK current turn is not open yet', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: null,
      pendingTurn: pendingTurn(),
      isSending: true,
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isSending: true,
      isBusy: true,
      source: 'pending-turn',
      useLocalSendLatch: true,
      useSdkLiveTurnPresentation: false,
      guardRef: preflightGuardRef,
      overlayIntent: expect.objectContaining({
        mode: 'awaiting',
        staleGuardRef: preflightGuardRef,
      }),
    });
  });

  test('uses pending turn before SDK current turn arrives', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: null,
      pendingTurn: pendingTurn({
        turnRef: 'turn-pending',
        userMessageId: 'user-pending',
        text: 'start now',
      }),
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
      pendingTurn: pendingTurn({
        turnRef: 'turn-pending',
        userMessageId: 'user-pending',
        text: 'start now',
      }),
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

  test('uses SDK awaiting lifecycle when SDK presentation is hidden during handoff', () => {
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
      pendingTurn: pendingTurn({
        turnRef: 'turn-2',
        userMessageId: 'user-2',
        text: 'second',
      }),
      isSending: true,
      messages: [
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isSending: true,
      isBusy: true,
      source: 'sdk-current-turn',
      useLocalSendLatch: false,
      useSdkLiveTurnPresentation: true,
      showAwaiting: true,
    });
  });

  test('keeps pending turn through unanchored hidden idle SDK projection', () => {
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
      pendingTurn: pendingTurn(),
      isSending: true,
      messages: [],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isSending: true,
      source: 'pending-turn',
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

  test('keeps pending turn over previous terminal projection', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: {
        phase: 'complete',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        assistantText: 'previous complete response',
      },
      pendingTurn: pendingTurn({
        turnRef: 'turn-2',
        userMessageId: 'user-2',
        text: 'second',
      }),
      isSending: true,
      messages: [
        { id: 'user-1', sender: 'user', text: 'first', turnRef: 'turn-1' },
        { id: 'assistant-1', sender: 'assistant', text: 'done', turnRef: 'turn-1' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isSending: true,
      source: 'pending-turn',
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
      pendingTurn: pendingTurn({
        turnRef: 'turn-2',
        userMessageId: 'user-2',
        text: 'second',
      }),
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

  test('uses visible lifecycle instead of SDK presentation flags for awaiting state', () => {
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
      isSending: false,
      messages: [
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isSending: true,
      isBusy: true,
      showAwaiting: true,
      showResponse: false,
      source: 'sdk-current-turn',
      useLocalSendLatch: false,
      useSdkLiveTurnPresentation: true,
      overlayIntent: expect.objectContaining({
        mode: 'hidden',
      }),
    });
  });

  test('uses visible lifecycle instead of SDK overlay intent for response state', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: {
        phase: 'streaming',
        conversationRef: 'conv-1',
        turnRef: 'turn-2',
        assistantText: 'Visible response',
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
      isSending: false,
      messages: [
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'streaming',
      isSending: true,
      isBusy: true,
      showAwaiting: false,
      showResponse: true,
      source: 'sdk-current-turn',
      useLocalSendLatch: false,
      useSdkLiveTurnPresentation: true,
      overlayIntent: expect.objectContaining({
        mode: 'hidden',
      }),
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
