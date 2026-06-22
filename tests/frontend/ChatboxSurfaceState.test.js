/**
 * Covers chatbox surface state. behavior in the frontend test suite.
 */

import { DesktopCurrentTurnPresentationRuntime } from '../../frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime';

describe('desktopCurrentTurnPresentationRuntime chatbox projection', () => {
  const {
    resolveCurrentTurnPresentationState,
    resolveResponseOverlayDismissalTarget,
    resolveSdkResponseOverlayPresentationState,
  } = DesktopCurrentTurnPresentationRuntime;

  test('keeps message-only state compact until visible lifecycle stamps awaiting state', () => {
    const state = resolveCurrentTurnPresentationState({
      messages: [{ id: 'user-1', sender: 'user', text: 'hello', type: 'user' }],
    });

    expect(state.loopUiState).toBe('idle');
    expect(state.isBusy).toBe(false);
    expect(state.chatboxSurfaceState).toBe('compact');
    expect(state.showChatboxAwaitingReply).toBe(false);
    expect(state.showChatboxResponse).toBe(false);
  });

  test('shows response state after first visible chunk arrives', () => {
    const state = resolveCurrentTurnPresentationState({
      messages: [
        { id: 'user-1', sender: 'user', text: 'task', type: 'user' },
      ],
      activeResponse: { id: 'assistant-1', type: 'llm-text', sender: 'assistant', text: 'done' },
    });

    expect(state.chatboxSurfaceState).toBe('response');
    expect(state.showChatboxResponse).toBe(true);
    expect(state.showChatboxAwaitingReply).toBe(false);
  });

  test('keeps visible response data independent from lifecycle state', () => {
    const state = resolveCurrentTurnPresentationState({
      messages: [
        { id: 'user-1', sender: 'user', text: 'task', type: 'user' },
      ],
      activeResponse: { id: 'assistant-1', type: 'llm-text', sender: 'assistant', text: 'done' },
    });

    expect(state.chatboxSurfaceState).toBe('response');
    expect(state.showChatboxResponse).toBe(true);
    expect(state.showChatboxAwaitingReply).toBe(false);
  });

  test('keeps compact state when no response is visible and loop is terminal', () => {
    const state = resolveCurrentTurnPresentationState({
      messages: [{ id: 'user-1', sender: 'user', text: 'task', type: 'user' }],
    });

    expect(state.chatboxSurfaceState).toBe('compact');
    expect(state.showChatboxAwaitingReply).toBe(false);
    expect(state.showChatboxResponse).toBe(false);
  });

  test('treats dismissed responses as hidden in presentation state', () => {
    const state = resolveCurrentTurnPresentationState({
      messages: [{ id: 'user-1', sender: 'user', text: 'task', type: 'user' }],
      activeResponse: { id: 'assistant-1', type: 'llm-text', sender: 'assistant', text: 'done' },
      dismissedResponseId: 'assistant-1',
    });

    expect(state.visibleResponse).toBeNull();
    expect(state.showChatboxResponse).toBe(false);
  });

  test('keeps tool rows from suppressing awaiting state after the latest user turn', () => {
    const state = resolveCurrentTurnPresentationState({
      messages: [
        { id: 'user-1', sender: 'user', text: 'first task', type: 'user' },
        { id: 'assistant-1', sender: 'assistant', text: 'done', type: 'llm-text' },
        { id: 'user-2', sender: 'user', text: 'second task', type: 'user' },
        { id: 'tool-call-2', sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call' },
        { id: 'tool-output-2', sender: 'assistant', text: '{"ok":true}', type: 'tool-output' },
      ],
    });

    expect(state.hasVisibleReply).toBe(false);
    expect(state.awaitingDotTargetMessageId).toBeNull();
    expect(state.showChatboxAwaitingReply).toBe(false);
    expect(state.showChatboxResponse).toBe(false);
  });

  test('projects SDK response entries onto fallback lifecycle state', () => {
    const state = resolveSdkResponseOverlayPresentationState({
      currentTurnProjection: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        presentation: {
          hasVisibleContent: true,
          typingVisible: false,
          overlayVisible: true,
          isBusy: false,
          isTerminal: true,
          overlayIntent: {
            visible: true,
            mode: 'response',
            turnRef: 'turn-1',
            conversationRef: 'conv-1',
            staleGuardRef: 'turn-1',
          },
        },
      },
      responseOverlayEntries: [
        { id: 'assistant-1', sender: 'assistant', type: 'llm-text', text: 'done' },
      ],
      fallbackState: {
        isBusy: false,
        showChatboxAwaitingReply: false,
      },
      includeOverlayIntent: true,
    });

    expect(state).toMatchObject({
      activeResponse: { id: 'assistant-1', sender: 'assistant', type: 'llm-text', text: 'done' },
      visibleResponse: { id: 'assistant-1', sender: 'assistant', type: 'llm-text', text: 'done' },
      hasVisibleReply: true,
      showChatboxResponse: true,
      chatboxSurfaceState: 'response',
      showChatboxAwaitingReply: false,
      overlayIntent: expect.objectContaining({
        mode: 'response',
        turnRef: 'turn-1',
      }),
    });
  });

  test('does not let SDK overlay intent alone force response state', () => {
    const state = resolveSdkResponseOverlayPresentationState({
      currentTurnProjection: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        presentation: {
          hasVisibleContent: true,
          overlayVisible: true,
          overlayIntent: {
            visible: true,
            mode: 'response',
            turnRef: 'turn-1',
          },
        },
      },
      responseOverlayEntries: [],
      fallbackState: {
        chatboxSurfaceState: 'compact',
        showChatboxResponse: false,
      },
      includeOverlayIntent: true,
    });

    expect(state).toMatchObject({
      activeResponse: null,
      visibleResponse: null,
      showChatboxResponse: false,
      chatboxSurfaceState: 'compact',
      overlayIntent: expect.objectContaining({
        mode: 'response',
      }),
    });
  });

  test('treats dismissed SDK response entries as hidden response data', () => {
    const state = resolveSdkResponseOverlayPresentationState({
      currentTurnProjection: {
        presentation: {
          hasVisibleContent: true,
          overlayVisible: true,
          overlayIntent: {
            visible: true,
            mode: 'response',
          },
        },
      },
      responseOverlayEntries: [
        { id: 'assistant-1', sender: 'assistant', type: 'llm-text', text: 'done' },
      ],
      dismissedResponseId: 'assistant-1',
      fallbackState: {
        chatboxSurfaceState: 'compact',
        showChatboxResponse: false,
      },
    });

    expect(state).toMatchObject({
      activeResponse: null,
      visibleResponse: null,
      showChatboxResponse: false,
      chatboxSurfaceState: 'compact',
    });
  });

  test('resolves SDK response overlay dismissal target from overlay intent', () => {
    expect(resolveResponseOverlayDismissalTarget({
      currentTurnProjection: {
        conversationRef: 'conv-projection',
        turnRef: 'turn-projection',
        presentation: {
          overlayIntent: {
            visible: true,
            mode: 'response',
            conversationRef: 'conv-intent',
            turnRef: 'turn-intent',
            staleGuardRef: 'guard-intent',
          },
        },
      },
      responseOverlayEntries: [
        { id: 'entry-1', turnRef: 'turn-entry' },
      ],
      useSdkLiveTurnPresentation: true,
    })).toEqual({
      conversationRef: 'conv-intent',
      turnRef: 'turn-intent',
      guardRef: 'guard-intent',
      responseEntryId: 'entry-1',
    });
  });

  test('resolves legacy response overlay dismissal target from entry and projection refs', () => {
    expect(resolveResponseOverlayDismissalTarget({
      currentTurnProjection: {
        conversationRef: 'conv-projection',
        turnRef: 'turn-projection',
      },
      responseOverlayEntries: [
        { id: 'entry-1' },
        { id: 'entry-2', turnRef: 'turn-entry' },
      ],
    })).toEqual({
      conversationRef: 'conv-projection',
      turnRef: 'turn-entry',
      guardRef: 'turn-entry',
      responseEntryId: 'entry-2',
    });

    expect(resolveResponseOverlayDismissalTarget({
      responseOverlayEntries: [{ turnRef: 'turn-entry' }],
    })).toBeNull();
  });
});
