/**
 * Covers live turn surface state. behavior in the frontend test suite.
 */

import { DesktopResponseOverlayPhaseRuntime } from '../../src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime';
import {
  DesktopLiveTurnSurfaceRuntime,
} from '../../src/renderer/app/runtime/desktopLiveTurnSurfaceRuntime';

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
      sdkLiveTurn: {
        phase: 'complete',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
      },
    });

    expect(state).toMatchObject({
      phase: 'complete',
      isBusy: false,
      source: 'current-turn',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: false,
    });
  });

  test('keeps local pending when terminal projection belongs to a previous turn', () => {
    const state = resolveLiveTurnPresentationInput({
      sdkLiveTurn: {
        phase: 'complete',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
      },
      pendingTurn: pendingTurn({
        turnRef: 'turn-2',
        userMessageId: 'user-2',
        text: 'second',
      }),
      messages: [
        { id: 'user-1', sender: 'user', text: 'first', turnRef: 'turn-1' },
        { id: 'assistant-1', sender: 'assistant', text: 'done', turnRef: 'turn-1' },
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isBusy: true,
      source: 'pending-turn',
      useLocalPendingTurn: true,
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
      sdkLiveTurn: null,
      pendingTurn: pendingTurn(),
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isBusy: true,
      source: 'pending-turn',
      useLocalPendingTurn: true,
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
      sdkLiveTurn: null,
      pendingTurn: pendingTurn({
        turnRef: 'turn-pending',
        userMessageId: 'user-pending',
        text: 'start now',
      }),
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isBusy: true,
      source: 'pending-turn',
      useLocalPendingTurn: true,
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
      sdkLiveTurn: {
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
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isBusy: true,
      source: 'current-turn',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: false,
      turnRef: 'turn-pending',
      conversationRef: 'conv-1',
      overlayIntent: expect.objectContaining({
        mode: 'awaiting',
        staleGuardRef: 'turn-pending',
      }),
    });
  });

  test('uses SDK presentation entries without legacy presentation visibility flags', () => {
    const state = resolveLiveTurnPresentationInput({
      sdkLiveTurn: {
        phase: 'streaming',
        conversationRef: 'conv-1',
        turnRef: 'turn-2',
        assistantText: 'Visible response',
        presentation: {
          hasVisibleContent: true,
          entries: [
            {
              id: 'assistant-entry',
              sender: 'assistant',
              text: 'Visible response',
              type: 'llm-text',
            },
          ],
        },
      },
      messages: [
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'streaming',
      isBusy: true,
      source: 'sdk-current-turn',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: true,
      entries: [
        expect.objectContaining({
          id: 'assistant-entry',
          sender: 'assistant',
          text: 'Visible response',
          type: 'llm-text',
        }),
      ],
      overlayIntent: {
        visible: true,
        mode: 'response',
        turnRef: 'turn-2',
        conversationRef: 'conv-1',
        staleGuardRef: 'turn-2',
      },
      turnRef: 'turn-2',
      conversationRef: 'conv-1',
      guardRef: 'turn-2',
    });
  });

  test('keeps visible SDK content in response mode while phase is still awaiting', () => {
    const state = resolveLiveTurnPresentationInput({
      sdkLiveTurn: {
        phase: 'awaiting',
        conversationRef: 'conv-1',
        turnRef: 'turn-2',
        assistantText: 'Visible response',
        presentation: {
          hasVisibleContent: true,
          entries: [
            {
              id: 'assistant-entry',
              sender: 'assistant',
              text: 'Visible response',
              type: 'llm-text',
            },
          ],
          overlayIntent: {
            visible: true,
            mode: 'awaiting',
            turnRef: 'turn-2',
            conversationRef: 'conv-1',
            staleGuardRef: 'turn-2',
          },
        },
      },
      messages: [
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'streaming',
      isBusy: true,
      source: 'sdk-current-turn',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: true,
      overlayIntent: {
        visible: true,
        mode: 'response',
        turnRef: 'turn-2',
        conversationRef: 'conv-1',
        staleGuardRef: 'turn-2',
      },
    });
  });

  test('uses SDK awaiting lifecycle when SDK presentation is hidden during handoff', () => {
    const state = resolveLiveTurnPresentationInput({
      sdkLiveTurn: {
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
      messages: [
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isBusy: true,
      source: 'current-turn',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: false,
      overlayIntent: expect.objectContaining({
        mode: 'awaiting',
        staleGuardRef: 'turn-2',
      }),
    });
  });

  test('keeps pending turn through unanchored hidden idle SDK projection', () => {
    const state = resolveLiveTurnPresentationInput({
      sdkLiveTurn: {
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
      messages: [],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      source: 'pending-turn',
      useLocalPendingTurn: true,
      useSdkLiveTurnPresentation: false,
    });
  });

  test('uses terminal SDK projection for the stopped current turn even when send latch is stale', () => {
    const state = resolveLiveTurnPresentationInput({
      sdkLiveTurn: {
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
      messages: [
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'complete',
      isBusy: false,
      source: 'current-turn',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: false,
      overlayIntent: expect.objectContaining({
        mode: 'hidden',
        staleGuardRef: 'turn-2',
      }),
    });
  });

  test('keeps pending turn over previous terminal projection', () => {
    const state = resolveLiveTurnPresentationInput({
      sdkLiveTurn: {
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
      messages: [
        { id: 'user-1', sender: 'user', text: 'first', turnRef: 'turn-1' },
        { id: 'assistant-1', sender: 'assistant', text: 'done', turnRef: 'turn-1' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      source: 'pending-turn',
      useLocalPendingTurn: true,
      useSdkLiveTurnPresentation: false,
    });
  });

  test('lets SDK awaiting presentation supersede local pending turn', () => {
    const state = resolveLiveTurnPresentationInput({
      sdkLiveTurn: {
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
      messages: [
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      source: 'current-turn',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: false,
      guardRef: 'turn-2',
      overlayIntent: expect.objectContaining({
        mode: 'awaiting',
      }),
    });
  });

  test('uses visible lifecycle instead of SDK presentation flags for awaiting state', () => {
    const state = resolveLiveTurnPresentationInput({
      sdkLiveTurn: {
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
      messages: [
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'awaiting-first-chunk',
      isBusy: true,
      source: 'current-turn',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: false,
      overlayIntent: expect.objectContaining({
        mode: 'awaiting',
      }),
    });
  });

  test('requires SDK presentation rows before showing raw response text', () => {
    const state = resolveLiveTurnPresentationInput({
      sdkLiveTurn: {
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
      messages: [
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'idle',
      isBusy: false,
      source: 'current-turn',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: false,
      overlayIntent: expect.objectContaining({
        mode: 'hidden',
      }),
    });
  });

  test('does not use SDK hasVisibleContent flag as response lifecycle evidence', () => {
    const state = resolveLiveTurnPresentationInput({
      sdkLiveTurn: {
        phase: 'streaming',
        conversationRef: 'conv-1',
        turnRef: 'turn-2',
        assistantText: '',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
        presentation: {
          hasVisibleContent: true,
          entries: [],
          overlayIntent: {
            visible: true,
            mode: 'response',
            turnRef: 'turn-2',
            conversationRef: 'conv-1',
            staleGuardRef: 'turn-2',
          },
        },
      },
      messages: [
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toMatchObject({
      phase: 'idle',
      isBusy: false,
      source: 'current-turn',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: false,
      overlayIntent: expect.objectContaining({
        mode: 'hidden',
      }),
    });
  });

  test('ignores legacy stream phase inputs when SDK current turn is absent', () => {
    const state = resolveLiveTurnPresentationInput({
      sdkLiveTurn: null,
      streamTracking: { phase: 'streaming' },
      phase: 'tool-call',
    });

    expect(state).toMatchObject({
      phase: 'idle',
      isBusy: false,
      source: 'idle',
    });
  });
});
