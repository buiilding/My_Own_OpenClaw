import {
  isAwaitingFirstChunkPhase,
  isLoopActivePhase,
  isOverlayAwaitingReplyPhase,
  isTerminalStreamPhase,
  isStopControlAvailablePhase,
} from '../../frontend/src/renderer/features/chat/utils/state/streamPhaseState';

describe('streamPhaseState', () => {
  test('detects active loop phases only', () => {
    expect(isLoopActivePhase('awaiting-first-chunk')).toBe(true);
    expect(isLoopActivePhase('streaming')).toBe(true);
    expect(isLoopActivePhase('tool-call')).toBe(true);
    expect(isLoopActivePhase('tool-output')).toBe(true);
    expect(isLoopActivePhase('idle')).toBe(false);
    expect(isLoopActivePhase('complete')).toBe(false);
    expect(isLoopActivePhase('error')).toBe(false);
    expect(isLoopActivePhase(undefined)).toBe(false);
  });

  test('detects terminal stream phases only', () => {
    expect(isTerminalStreamPhase('idle')).toBe(true);
    expect(isTerminalStreamPhase('complete')).toBe(true);
    expect(isTerminalStreamPhase('error')).toBe(true);
    expect(isTerminalStreamPhase('awaiting-first-chunk')).toBe(false);
    expect(isTerminalStreamPhase('streaming')).toBe(false);
    expect(isTerminalStreamPhase('tool-call')).toBe(false);
    expect(isTerminalStreamPhase('tool-output')).toBe(false);
    expect(isTerminalStreamPhase(undefined)).toBe(false);
  });

  test('detects awaiting-first-chunk phase only', () => {
    expect(isAwaitingFirstChunkPhase('awaiting-first-chunk')).toBe(true);
    expect(isAwaitingFirstChunkPhase('tool-call')).toBe(false);
    expect(isAwaitingFirstChunkPhase('idle')).toBe(false);
    expect(isAwaitingFirstChunkPhase(undefined)).toBe(false);
  });

  test('detects response-overlay awaiting phases only', () => {
    expect(isOverlayAwaitingReplyPhase('awaiting-first-chunk')).toBe(true);
    expect(isOverlayAwaitingReplyPhase('tool-call')).toBe(true);
    expect(isOverlayAwaitingReplyPhase('tool-output')).toBe(true);
    expect(isOverlayAwaitingReplyPhase('streaming')).toBe(false);
    expect(isOverlayAwaitingReplyPhase('idle')).toBe(false);
    expect(isOverlayAwaitingReplyPhase(undefined)).toBe(false);
  });

  test('stop-control availability matches active stream phases', () => {
    expect(isStopControlAvailablePhase('awaiting-first-chunk')).toBe(true);
    expect(isStopControlAvailablePhase('streaming')).toBe(true);
    expect(isStopControlAvailablePhase('tool-call')).toBe(true);
    expect(isStopControlAvailablePhase('tool-output')).toBe(true);
    expect(isStopControlAvailablePhase('idle')).toBe(false);
    expect(isStopControlAvailablePhase('complete')).toBe(false);
  });
});
