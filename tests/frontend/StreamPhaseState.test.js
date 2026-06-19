/**
 * Covers stream phase state. behavior in the frontend test suite.
 */

import {
  isOverlayAwaitingReplyPhase,
} from '../../frontend/src/renderer/app/runtime/desktopStreamPhaseRuntime';

describe('desktopStreamPhaseRuntime', () => {
  test('detects response-overlay awaiting phases only', () => {
    expect(isOverlayAwaitingReplyPhase('awaiting-first-chunk')).toBe(true);
    expect(isOverlayAwaitingReplyPhase('tool-call')).toBe(true);
    expect(isOverlayAwaitingReplyPhase('tool-output')).toBe(true);
    expect(isOverlayAwaitingReplyPhase('streaming')).toBe(false);
    expect(isOverlayAwaitingReplyPhase('idle')).toBe(false);
    expect(isOverlayAwaitingReplyPhase(undefined)).toBe(false);
  });
});
