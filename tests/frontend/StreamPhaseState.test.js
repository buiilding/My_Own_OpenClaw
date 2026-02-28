import {
  ACTIVE_LOOP_PHASES,
  isLoopActivePhase,
  isStopControlAvailablePhase,
} from '../../frontend/src/renderer/features/chat/utils/streamPhaseState';

describe('streamPhaseState', () => {
  test('exports canonical active loop phase set', () => {
    expect(ACTIVE_LOOP_PHASES).toEqual([
      'awaiting-first-chunk',
      'streaming',
      'tool-call',
      'tool-output',
    ]);
  });

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

  test('stop-control availability matches active stream phases', () => {
    expect(isStopControlAvailablePhase('awaiting-first-chunk')).toBe(true);
    expect(isStopControlAvailablePhase('streaming')).toBe(true);
    expect(isStopControlAvailablePhase('tool-call')).toBe(true);
    expect(isStopControlAvailablePhase('tool-output')).toBe(true);
    expect(isStopControlAvailablePhase('idle')).toBe(false);
    expect(isStopControlAvailablePhase('complete')).toBe(false);
  });
});
