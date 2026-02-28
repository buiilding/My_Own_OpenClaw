/** @jest-environment node */

const {
  resolveBackendOverlayPhaseTransition,
  resolveOverlayCorrelationId,
  resolveOverlayPhaseMetadata,
} = require('../../frontend/src/main/ipc_overlay_phase_events.cjs');

describe('ipc_overlay_phase_events', () => {
  test('resolves correlation id from payload keys then event id', () => {
    expect(resolveOverlayCorrelationId({
      payload: { request_id: 'req-1', correlation_id: 'corr-1', bundle_id: 'bundle-1' },
      id: 'event-1',
    })).toBe('req-1');

    expect(resolveOverlayCorrelationId({
      payload: { correlation_id: 'corr-2', bundle_id: 'bundle-2' },
      id: 'event-2',
    })).toBe('corr-2');

    expect(resolveOverlayCorrelationId({
      payload: { bundle_id: 'bundle-3' },
      id: 'event-3',
    })).toBe('bundle-3');

    expect(resolveOverlayCorrelationId({
      payload: {},
      id: 'event-4',
    })).toBe('event-4');

    expect(resolveOverlayCorrelationId({ payload: {} })).toBeNull();
  });

  test('ignores whitespace-only correlation id candidates before fallback', () => {
    expect(resolveOverlayCorrelationId({
      payload: { request_id: '   ', correlation_id: '  ', bundle_id: '\t' },
      id: 'event-fallback',
    })).toBe('event-fallback');

    expect(resolveOverlayCorrelationId({
      payload: { request_id: '   ', correlation_id: 'corr-1' },
      id: 'event-fallback',
    })).toBe('corr-1');
  });

  test('resolves overlay metadata and prioritizes payload message as terminal failure reason', () => {
    expect(resolveOverlayPhaseMetadata({
      id: 'event-5',
      payload: {
        request_id: 'req-5',
        metadata: {
          attempt: 2,
          max_attempts: 5,
          failure_reason: 'focus_retrying',
        },
      },
    }, 'tool-call')).toEqual({
      recovery_stage: 'tool-call',
      correlation_id: 'req-5',
      attempt: 2,
      max_attempts: 5,
      failure_reason: 'focus_retrying',
    });

    expect(resolveOverlayPhaseMetadata({
      id: 'event-6',
      payload: {
        metadata: {
          attempt: Infinity,
          max_attempts: NaN,
          failure_reason: 'retrying',
        },
        message: 'focus_verification_failed',
      },
    }, 'error')).toEqual({
      recovery_stage: 'error',
      correlation_id: 'event-6',
      failure_reason: 'focus_verification_failed',
    });
  });

  test('maps backend events to overlay transitions', () => {
    expect(resolveBackendOverlayPhaseTransition(
      { type: 'streaming-response' },
      'awaiting-first-chunk',
    )).toEqual({
      phase: 'streaming',
      metadata: null,
    });

    expect(resolveBackendOverlayPhaseTransition({
      type: 'tool-call',
      payload: { request_id: 'req-7' },
    }, 'streaming')).toEqual({
      phase: 'tool-call',
      metadata: {
        recovery_stage: 'tool-call',
        correlation_id: 'req-7',
      },
    });

    expect(resolveBackendOverlayPhaseTransition({
      type: 'tool-bundle',
      payload: { bundle_id: 'bundle-8' },
    }, 'streaming')).toEqual({
      phase: 'tool-call',
      metadata: {
        recovery_stage: 'tool-call',
        correlation_id: 'bundle-8',
      },
    });

    expect(resolveBackendOverlayPhaseTransition({
      type: 'tool-output',
      payload: { request_id: 'req-9' },
    }, 'tool-call')).toEqual({
      phase: 'awaiting-first-chunk',
      metadata: {
        recovery_stage: 'tool-output',
        correlation_id: 'req-9',
      },
    });

    expect(resolveBackendOverlayPhaseTransition(
      { type: 'streaming-complete' },
      'streaming',
    )).toEqual({
      phase: 'complete',
      metadata: null,
    });
  });

  test('emits error transition only when phase is active', () => {
    const terminalErrorEvent = {
      id: 'event-10',
      type: 'error',
      payload: { message: 'query_failed' },
    };

    expect(resolveBackendOverlayPhaseTransition(terminalErrorEvent, 'idle')).toBeNull();
    expect(resolveBackendOverlayPhaseTransition(terminalErrorEvent, 'streaming')).toEqual({
      phase: 'error',
      metadata: {
        recovery_stage: 'error',
        correlation_id: 'event-10',
        failure_reason: 'query_failed',
      },
    });
  });

  test('returns null for unsupported backend event types', () => {
    expect(resolveBackendOverlayPhaseTransition({ type: 'token-count' }, 'streaming')).toBeNull();
    expect(resolveBackendOverlayPhaseTransition({}, 'streaming')).toBeNull();
    expect(resolveBackendOverlayPhaseTransition(null, 'streaming')).toBeNull();
  });
});
