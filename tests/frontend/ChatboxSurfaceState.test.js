import {
  hasVisibleChatboxResponse,
  resolveChatboxSurfaceStateFromLoopUiState,
  shouldShowChatboxAwaitingReply,
  shouldShowChatboxResponse,
} from '../../frontend/src/renderer/features/chat/utils/state/chatboxSurfaceState';
import { resolveChatLoopUiState } from '../../frontend/src/renderer/features/chat/utils/state/chatLoopUiState';

describe('chatboxSurfaceState', () => {
  function deriveSurfaceState({
    overlayPhase,
    isSending,
    hasVisibleResponse,
  }) {
    const loopUiState = resolveChatLoopUiState({
      phase: overlayPhase,
      isSending,
      hasVisibleReply: hasVisibleResponse,
    });
    return resolveChatboxSurfaceStateFromLoopUiState({
      loopUiState,
      hasVisibleResponse,
    });
  }

  test('shows awaiting state while user message is still sending', () => {
    const surfaceState = deriveSurfaceState({
      overlayPhase: 'idle',
      isSending: true,
      hasVisibleResponse: false,
    });

    expect(surfaceState).toBe('awaiting-reply');
    expect(shouldShowChatboxAwaitingReply(surfaceState)).toBe(true);
    expect(shouldShowChatboxResponse(surfaceState)).toBe(false);
  });

  test('shows response state after first visible chunk arrives', () => {
    const surfaceState = deriveSurfaceState({
      overlayPhase: 'streaming',
      isSending: false,
      hasVisibleResponse: true,
    });

    expect(surfaceState).toBe('response');
    expect(shouldShowChatboxResponse(surfaceState)).toBe(true);
    expect(shouldShowChatboxAwaitingReply(surfaceState)).toBe(false);
  });

  test('returns to awaiting state when tool output resumes the loop', () => {
    const surfaceState = deriveSurfaceState({
      overlayPhase: 'tool-output',
      isSending: false,
      hasVisibleResponse: true,
    });

    expect(surfaceState).toBe('awaiting-reply');
    expect(shouldShowChatboxAwaitingReply(surfaceState)).toBe(true);
  });

  test('keeps compact state when no response is visible and loop is terminal', () => {
    const surfaceState = deriveSurfaceState({
      overlayPhase: 'complete',
      isSending: false,
      hasVisibleResponse: false,
    });

    expect(surfaceState).toBe('compact');
    expect(shouldShowChatboxAwaitingReply(surfaceState)).toBe(false);
    expect(shouldShowChatboxResponse(surfaceState)).toBe(false);
  });

  test('treats dismissed responses as not visible', () => {
    expect(hasVisibleChatboxResponse({ id: 'assistant-1' }, 'assistant-1')).toBe(false);
    expect(hasVisibleChatboxResponse({ id: 'assistant-1' }, 'assistant-2')).toBe(true);
  });
});
