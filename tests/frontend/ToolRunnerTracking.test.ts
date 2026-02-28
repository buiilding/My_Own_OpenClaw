import {
  isTrackedExecution,
  pruneTrackedExecutionTurns,
  trackExecutionTurn,
  type TrackedExecution,
  untrackExecutionTurn,
} from '../../frontend/src/renderer/features/chat/utils/toolRunnerTracking';

describe('toolRunnerTracking', () => {
  test('tracks and untracks execution turns only when correlation id exists', () => {
    const tracked = new Map<string, TrackedExecution>();

    trackExecutionTurn(tracked, null, 'turn-1', 'conv-1');
    expect(tracked.size).toBe(0);

    trackExecutionTurn(tracked, 'corr-1', 'turn-1', 'conv-1');
    expect(tracked.get('corr-1')).toEqual({
      turnRef: 'turn-1',
      conversationRef: 'conv-1',
    });

    untrackExecutionTurn(tracked, undefined);
    expect(tracked.has('corr-1')).toBe(true);

    untrackExecutionTurn(tracked, 'corr-1');
    expect(tracked.size).toBe(0);
  });

  test('treats missing correlation ids as accepted execution results', () => {
    const tracked = new Map<string, TrackedExecution>([
      ['corr-1', { turnRef: 'turn-1', conversationRef: 'conv-1' }],
    ]);
    expect(isTrackedExecution(tracked, undefined)).toBe(true);
    expect(isTrackedExecution(tracked, 'corr-1')).toBe(true);
    expect(isTrackedExecution(tracked, 'corr-missing')).toBe(false);
  });

  test('prunes tracked entries by active turn and stream phase invariants (including null-safe legacy entries)', () => {
    const tracked = new Map<string, TrackedExecution | null>([
      ['corr-active', { turnRef: 'turn-active', conversationRef: 'conv-active' }],
      ['corr-stale', { turnRef: 'turn-stale', conversationRef: 'conv-stale' }],
      ['corr-idless', { turnRef: null, conversationRef: null }],
      ['corr-legacy-null', null],
    ]) as unknown as Map<string, TrackedExecution>;

    pruneTrackedExecutionTurns(tracked, 'turn-active', 'streaming');
    expect([...tracked.keys()]).toEqual(['corr-active', 'corr-idless', 'corr-legacy-null']);

    pruneTrackedExecutionTurns(tracked, 'turn-active', 'complete');
    expect([...tracked.keys()]).toEqual([]);
  });

  test('clears all tracked entries when no active turn remains and phase is terminal', () => {
    const tracked = new Map<string, TrackedExecution>([
      ['corr-1', { turnRef: 'turn-1', conversationRef: 'conv-1' }],
      ['corr-2', { turnRef: null, conversationRef: null }],
    ]);

    pruneTrackedExecutionTurns(tracked, null, 'streaming');
    expect(tracked.size).toBe(2);

    pruneTrackedExecutionTurns(tracked, null, 'idle');
    expect(tracked.size).toBe(0);
  });
});
