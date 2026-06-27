/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createOverlayPhaseEventRuntime,
} = require('../../src/main/ipc/ipc_overlay_phase_events.cjs');

describe('ipc_overlay_phase_events', () => {
  const overlayPhaseEventRuntime = createOverlayPhaseEventRuntime();
  const {
    resolveBackendOverlayPhaseTransition,
  } = overlayPhaseEventRuntime;

  test('keeps lower-level overlay transition helper private', () => {
    const overlayPhaseEventsModule = require('../../src/main/ipc/ipc_overlay_phase_events.cjs');

    expect(overlayPhaseEventsModule.resolveBackendOverlayPhaseTransition).toBeUndefined();
    expect(typeof overlayPhaseEventsModule.createOverlayPhaseEventRuntime).toBe('function');
  });

  test('runtime helpers consume overlay transitions through the facade', async () => {
    const runtimeHelpersSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_runtime_helpers.cjs'),
      'utf8',
    );

    expect(runtimeHelpersSource).toContain('createOverlayPhaseEventRuntime');
    expect(runtimeHelpersSource).toContain('overlayPhaseEventRuntime.resolveBackendOverlayPhaseTransition');
    expect(runtimeHelpersSource).not.toContain('const {\r\n  resolveBackendOverlayPhaseTransition,');
    expect(runtimeHelpersSource).not.toContain('const {\n  resolveBackendOverlayPhaseTransition,');
  });

  test('maps backend tool events using payload id precedence then event id fallback', () => {
    expect(resolveBackendOverlayPhaseTransition({
      type: 'tool-call',
      payload: { request_id: 'req-1', correlation_id: 'corr-1', bundle_id: 'bundle-1' },
      id: 'event-1',
    }, 'streaming')).toEqual({
      phase: 'tool-call',
      metadata: {
        recovery_stage: 'tool-call',
        correlation_id: 'req-1',
      },
    });

    expect(resolveBackendOverlayPhaseTransition({
      type: 'tool-call',
      payload: { correlation_id: 'corr-2', bundle_id: 'bundle-2' },
      id: 'event-2',
    }, 'streaming')).toEqual({
      phase: 'tool-call',
      metadata: {
        recovery_stage: 'tool-call',
        correlation_id: 'corr-2',
      },
    });

    expect(resolveBackendOverlayPhaseTransition({
      type: 'tool-bundle',
      payload: { bundle_id: 'bundle-3' },
      id: 'event-3',
    }, 'streaming')).toEqual({
      phase: 'tool-call',
      metadata: {
        recovery_stage: 'tool-call',
        correlation_id: 'bundle-3',
      },
    });

    expect(resolveBackendOverlayPhaseTransition({
      type: 'tool-output',
      payload: {},
      id: 'event-4',
    }, 'tool-call')).toEqual({
      phase: 'tool-output',
      metadata: {
        recovery_stage: 'tool-output',
        correlation_id: 'event-4',
      },
    });

    expect(resolveBackendOverlayPhaseTransition({
      type: 'tool-call',
      payload: { request_id: '   ', correlation_id: '  ', bundle_id: '\t' },
      id: 'event-fallback',
    }, 'streaming')).toEqual({
      phase: 'tool-call',
      metadata: {
        recovery_stage: 'tool-call',
        correlation_id: 'event-fallback',
      },
    });

    expect(resolveBackendOverlayPhaseTransition({
      type: 'tool-call',
      payload: { request_id: '   ', correlation_id: 'corr-1' },
      id: 'event-fallback',
    }, 'streaming')).toEqual({
      phase: 'tool-call',
      metadata: {
        recovery_stage: 'tool-call',
        correlation_id: 'corr-1',
      },
    });
  });

  test('normalizes recovery metadata and prioritizes payload message as terminal failure reason', () => {
    expect(resolveBackendOverlayPhaseTransition({
      type: 'tool-call',
      id: 'event-5',
      payload: {
        request_id: 'req-5',
        metadata: {
          attempt: 2,
          max_attempts: 5,
          failure_reason: 'focus_retrying',
        },
      },
    }, 'streaming')).toEqual({
      phase: 'tool-call',
      metadata: {
        recovery_stage: 'tool-call',
        correlation_id: 'req-5',
        attempt: 2,
        max_attempts: 5,
        failure_reason: 'focus_retrying',
      },
    });

    expect(resolveBackendOverlayPhaseTransition({
      type: 'error',
      id: 'event-6',
      payload: {
        metadata: {
          attempt: Infinity,
          max_attempts: NaN,
          failure_reason: 'retrying',
        },
        message: 'focus_verification_failed',
      },
    }, 'streaming')).toEqual({
      phase: 'error',
      metadata: {
        recovery_stage: 'error',
        correlation_id: 'event-6',
        failure_reason: 'focus_verification_failed',
      },
    });
  });

  test('maps backend events to overlay transitions', () => {
    expect(resolveBackendOverlayPhaseTransition(
      { type: 'query-accepted' },
      'awaiting-first-chunk',
    )).toEqual({
      phase: 'awaiting-first-chunk',
      metadata: null,
    });

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
      type: 'web-search-progress',
      payload: { request_id: 'req-search-8' },
    }, 'streaming')).toEqual({
      phase: 'tool-call',
      metadata: {
        recovery_stage: 'tool-call',
        correlation_id: 'req-search-8',
      },
    });

    expect(resolveBackendOverlayPhaseTransition({
      type: 'tool-output',
      payload: { request_id: 'req-9' },
    }, 'tool-call')).toEqual({
      phase: 'tool-output',
      metadata: {
        recovery_stage: 'tool-output',
        correlation_id: 'req-9',
      },
    });

    expect(resolveBackendOverlayPhaseTransition(
      {
        type: 'streaming-complete',
        payload: { request_id: 'req-complete-10' },
      },
      'streaming',
    )).toEqual({
      phase: 'complete',
      metadata: {
        correlation_id: 'req-complete-10',
      },
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

  test('treats terminal fallback events as complete when stream is active', () => {
    expect(resolveBackendOverlayPhaseTransition({
      type: 'token-count',
      payload: { correlation_id: 'corr-token-1' },
    }, 'streaming')).toEqual({
      phase: 'complete',
      metadata: {
        correlation_id: 'corr-token-1',
      },
    });
    expect(resolveBackendOverlayPhaseTransition({ type: 'assistant-message-full' }, 'awaiting-first-chunk')).toEqual({
      phase: 'complete',
      metadata: null,
    });
    expect(resolveBackendOverlayPhaseTransition({ type: 'token-count' }, 'idle')).toBeNull();
  });

  test('returns null for unsupported backend event types', () => {
    expect(resolveBackendOverlayPhaseTransition({}, 'streaming')).toBeNull();
    expect(resolveBackendOverlayPhaseTransition(null, 'streaming')).toBeNull();
  });
});
