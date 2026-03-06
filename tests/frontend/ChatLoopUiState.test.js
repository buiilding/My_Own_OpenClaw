import {
  isChatLoopAwaitingReply,
  isChatLoopBusy,
  resolveChatLoopUiState,
} from '../../frontend/src/renderer/features/chat/utils/state/chatLoopUiState';

describe('chatLoopUiState', () => {
  test('treats local send latch as awaiting reply', () => {
    const loopUiState = resolveChatLoopUiState({
      phase: 'idle',
      isSending: true,
      hasVisibleReply: false,
    });

    expect(loopUiState).toBe('awaiting-reply');
    expect(isChatLoopBusy(loopUiState)).toBe(true);
    expect(isChatLoopAwaitingReply(loopUiState)).toBe(true);
  });

  test('keeps streaming without a visible assistant reply in awaiting state', () => {
    const loopUiState = resolveChatLoopUiState({
      phase: 'streaming',
      isSending: false,
      hasVisibleReply: false,
    });

    expect(loopUiState).toBe('awaiting-reply');
  });

  test('switches streaming with a visible assistant reply into active response state', () => {
    const loopUiState = resolveChatLoopUiState({
      phase: 'streaming',
      isSending: false,
      hasVisibleReply: true,
    });

    expect(loopUiState).toBe('active-response');
    expect(isChatLoopBusy(loopUiState)).toBe(true);
    expect(isChatLoopAwaitingReply(loopUiState)).toBe(false);
  });

  test('returns to idle on terminal phases', () => {
    const loopUiState = resolveChatLoopUiState({
      phase: 'complete',
      isSending: false,
      hasVisibleReply: true,
    });

    expect(loopUiState).toBe('idle');
    expect(isChatLoopBusy(loopUiState)).toBe(false);
  });

  test('treats complete phase as terminal even when send latch is stale', () => {
    const loopUiState = resolveChatLoopUiState({
      phase: 'complete',
      isSending: true,
      hasVisibleReply: false,
    });

    expect(loopUiState).toBe('idle');
    expect(isChatLoopBusy(loopUiState)).toBe(false);
  });

  test('forces idle when transport is disconnected', () => {
    const loopUiState = resolveChatLoopUiState({
      phase: 'tool-call',
      isSending: true,
      hasVisibleReply: false,
      transportConnected: false,
    });

    expect(loopUiState).toBe('idle');
    expect(isChatLoopBusy(loopUiState)).toBe(false);
  });
});
