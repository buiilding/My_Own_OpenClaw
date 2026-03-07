import {
  hasVisibleChatboxResponse,
  resolveChatboxSurfaceState,
  resolveCurrentTurnPresentationState,
  shouldShowChatboxAwaitingReply,
  shouldShowChatboxResponse,
} from '../../frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState';
import { resolveChatLoopUiState } from '../../frontend/src/renderer/features/chat/utils/state/chatLoopUiState';

describe('chatTurnPresentationState chatbox projection', () => {
  function deriveSurfaceState({
    overlayPhase,
    isSending,
    activeResponse = null,
  }) {
    const loopUiState = resolveChatLoopUiState({
      phase: overlayPhase,
      isSending,
      hasVisibleReply: Boolean(activeResponse),
    });
    return resolveChatboxSurfaceState({
      loopUiState,
      activeResponse,
    });
  }

  test('shows awaiting state while user message is still sending', () => {
    const surfaceState = deriveSurfaceState({
      overlayPhase: 'idle',
      isSending: true,
      activeResponse: null,
    });

    expect(surfaceState).toBe('awaiting-reply');
    expect(shouldShowChatboxAwaitingReply(surfaceState)).toBe(true);
    expect(shouldShowChatboxResponse(surfaceState)).toBe(false);
  });

  test('shows response state after first visible chunk arrives', () => {
    const surfaceState = deriveSurfaceState({
      overlayPhase: 'streaming',
      isSending: false,
      activeResponse: { id: 'assistant-1', type: 'llm-text' },
    });

    expect(surfaceState).toBe('response');
    expect(shouldShowChatboxResponse(surfaceState)).toBe(true);
    expect(shouldShowChatboxAwaitingReply(surfaceState)).toBe(false);
  });

  test('returns to awaiting state when tool output resumes the loop', () => {
    const surfaceState = deriveSurfaceState({
      overlayPhase: 'tool-output',
      isSending: false,
      activeResponse: { id: 'assistant-1', type: 'llm-text' },
    });

    expect(surfaceState).toBe('awaiting-reply');
    expect(shouldShowChatboxAwaitingReply(surfaceState)).toBe(true);
  });

  test('keeps compact state when no response is visible and loop is terminal', () => {
    const surfaceState = deriveSurfaceState({
      overlayPhase: 'complete',
      isSending: false,
      activeResponse: null,
    });

    expect(surfaceState).toBe('compact');
    expect(shouldShowChatboxAwaitingReply(surfaceState)).toBe(false);
    expect(shouldShowChatboxResponse(surfaceState)).toBe(false);
  });

  test('treats dismissed responses as not visible', () => {
    expect(hasVisibleChatboxResponse({ id: 'assistant-1' }, 'assistant-1')).toBe(false);
    expect(hasVisibleChatboxResponse({ id: 'assistant-1' }, 'assistant-2')).toBe(true);
  });

  test('keeps tool rows from suppressing awaiting state after the latest user turn', () => {
    const state = resolveCurrentTurnPresentationState({
      phase: 'tool-output',
      isSending: false,
      messages: [
        { id: 'user-1', sender: 'user', text: 'first task', type: 'user' },
        { id: 'assistant-1', sender: 'assistant', text: 'done', type: 'llm-text' },
        { id: 'user-2', sender: 'user', text: 'second task', type: 'user' },
        { id: 'tool-call-2', sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call' },
        { id: 'tool-output-2', sender: 'assistant', text: '{"ok":true}', type: 'tool-output' },
      ],
    });

    expect(state.hasVisibleReply).toBe(false);
    expect(state.showAssistantAwaitingDot).toBe(true);
    expect(state.showChatboxAwaitingReply).toBe(true);
    expect(state.showChatboxResponse).toBe(false);
  });
});
