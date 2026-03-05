import {
  isTrackedExecution,
  trackExecutionTurn,
  type TrackedExecution,
  untrackExecutionTurn,
} from '../../frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerTracking';

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

});
