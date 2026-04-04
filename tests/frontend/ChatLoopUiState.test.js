import {
  isChatLoopAwaitingReply,
  isChatLoopBusy,
  resolveChatLoopUiState,
} from '../../frontend/src/renderer/features/chat/utils/state/chatLoopUiState';
import { OVERLAY_TURN_LIFECYCLE } from '../../frontend/src/renderer/features/chat/utils/overlay/overlayTurnLifecycleContract';

describe('chatLoopUiState', () => {
  test('treats preflight lifecycle as awaiting reply', () => {
    const loopUiState = resolveChatLoopUiState({
      lifecycle: OVERLAY_TURN_LIFECYCLE.PREFLIGHT,
      hasVisibleReply: false,
    });

    expect(loopUiState).toBe('awaiting-reply');
    expect(isChatLoopBusy(loopUiState)).toBe(true);
    expect(isChatLoopAwaitingReply(loopUiState)).toBe(true);
  });

  test('keeps streaming without a visible assistant reply in awaiting state', () => {
    const loopUiState = resolveChatLoopUiState({
      lifecycle: OVERLAY_TURN_LIFECYCLE.ACTIVE,
      hasVisibleReply: false,
    });

    expect(loopUiState).toBe('awaiting-reply');
  });

  test('switches streaming with a visible assistant reply into active response state', () => {
    const loopUiState = resolveChatLoopUiState({
      lifecycle: OVERLAY_TURN_LIFECYCLE.ACTIVE,
      hasVisibleReply: true,
    });

    expect(loopUiState).toBe('active-response');
    expect(isChatLoopBusy(loopUiState)).toBe(true);
    expect(isChatLoopAwaitingReply(loopUiState)).toBe(false);
  });

  test('returns to idle on terminal phases', () => {
    const loopUiState = resolveChatLoopUiState({
      lifecycle: OVERLAY_TURN_LIFECYCLE.TERMINAL,
      hasVisibleReply: true,
    });

    expect(loopUiState).toBe('idle');
    expect(isChatLoopBusy(loopUiState)).toBe(false);
  });

  test('treats awaiting lifecycle as awaiting reply', () => {
    const loopUiState = resolveChatLoopUiState({
      lifecycle: OVERLAY_TURN_LIFECYCLE.AWAITING,
      hasVisibleReply: false,
    });

    expect(loopUiState).toBe('awaiting-reply');
    expect(isChatLoopBusy(loopUiState)).toBe(true);
  });

  test('keeps idle lifecycle idle even when a stale visible reply exists', () => {
    const loopUiState = resolveChatLoopUiState({
      lifecycle: OVERLAY_TURN_LIFECYCLE.IDLE,
      hasVisibleReply: true,
    });

    expect(loopUiState).toBe('idle');
    expect(isChatLoopBusy(loopUiState)).toBe(false);
  });

  test('falls back to idle for unknown lifecycle values', () => {
    const loopUiState = resolveChatLoopUiState({
      lifecycle: 'unknown',
      hasVisibleReply: false,
    });

    expect(loopUiState).toBe('idle');
    expect(isChatLoopBusy(loopUiState)).toBe(false);
  });
});
