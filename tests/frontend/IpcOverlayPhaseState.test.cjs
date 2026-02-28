/** @jest-environment node */

const {
  RESPONSE_OVERLAY_PHASES,
  areResponseOverlayMetadataEqual,
  createResponseOverlayPhaseState,
  normalizeResponseOverlayMetadata,
} = require('../../frontend/src/main/ipc_overlay_phase_state.cjs');

describe('ipc_overlay_phase_state', () => {
  test('exports supported overlay phases', () => {
    expect(RESPONSE_OVERLAY_PHASES.has('idle')).toBe(true);
    expect(RESPONSE_OVERLAY_PHASES.has('tool-call')).toBe(true);
    expect(RESPONSE_OVERLAY_PHASES.has('error')).toBe(true);
    expect(RESPONSE_OVERLAY_PHASES.has('not-a-phase')).toBe(false);
  });

  test('normalizes metadata with typed filtering', () => {
    expect(normalizeResponseOverlayMetadata(null)).toBeNull();
    expect(normalizeResponseOverlayMetadata([])).toBeNull();
    expect(normalizeResponseOverlayMetadata({
      correlation_id: 'corr-1',
      attempt: 2,
      max_attempts: 5,
      recovery_stage: 'tool-call',
      failure_reason: 'focus_retrying',
      ignored_key: 'ignored',
      invalid_number: Infinity,
    })).toEqual({
      correlation_id: 'corr-1',
      attempt: 2,
      max_attempts: 5,
      recovery_stage: 'tool-call',
      failure_reason: 'focus_retrying',
    });
    expect(normalizeResponseOverlayMetadata({ attempt: '2', correlation_id: '' })).toBeNull();
  });

  test('drops whitespace-only string metadata values', () => {
    expect(normalizeResponseOverlayMetadata({
      correlation_id: '   ',
      recovery_stage: '\t',
      failure_reason: '  ',
      attempt: 1,
    })).toEqual({
      attempt: 1,
    });
  });

  test('compares metadata objects deterministically', () => {
    expect(areResponseOverlayMetadataEqual(null, null)).toBe(true);
    expect(areResponseOverlayMetadataEqual(null, { attempt: 1 })).toBe(false);
    expect(areResponseOverlayMetadataEqual(
      { correlation_id: 'corr-1', attempt: 1 },
      { correlation_id: 'corr-1', attempt: 1 },
    )).toBe(true);
    expect(areResponseOverlayMetadataEqual(
      { correlation_id: 'corr-1', attempt: 1 },
      { correlation_id: 'corr-1', attempt: 2 },
    )).toBe(false);
  });

  test('broadcasts and invokes callback on valid phase transition', () => {
    const onPhaseChange = jest.fn();
    const broadcastToRenderers = jest.fn();
    const state = createResponseOverlayPhaseState();

    state.setPhase('tool-call', 'backend', { correlation_id: 'req-1' }, {
      onPhaseChange,
      broadcastToRenderers,
      log: jest.fn(),
    });

    expect(state.getPhase()).toBe('tool-call');
    expect(onPhaseChange).toHaveBeenCalledWith({
      phase: 'tool-call',
      source: 'backend',
      correlation_id: 'req-1',
    });
    expect(broadcastToRenderers).toHaveBeenCalledWith('response-overlay-phase', {
      phase: 'tool-call',
      source: 'backend',
      correlation_id: 'req-1',
    });
  });

  test('does not re-emit unchanged phase and metadata', () => {
    const onPhaseChange = jest.fn();
    const broadcastToRenderers = jest.fn();
    const state = createResponseOverlayPhaseState();
    const deps = {
      onPhaseChange,
      broadcastToRenderers,
      log: jest.fn(),
    };

    state.setPhase('streaming', 'backend', { correlation_id: 'req-2' }, deps);
    state.setPhase('streaming', 'backend', { correlation_id: 'req-2' }, deps);

    expect(onPhaseChange).toHaveBeenCalledTimes(1);
    expect(broadcastToRenderers).toHaveBeenCalledTimes(1);
  });

  test('re-emits when phase is same but metadata differs', () => {
    const onPhaseChange = jest.fn();
    const broadcastToRenderers = jest.fn();
    const state = createResponseOverlayPhaseState();
    const deps = {
      onPhaseChange,
      broadcastToRenderers,
      log: jest.fn(),
    };

    state.setPhase('tool-call', 'backend', { correlation_id: 'req-3', attempt: 1 }, deps);
    state.setPhase('tool-call', 'backend', { correlation_id: 'req-3', attempt: 2 }, deps);

    expect(onPhaseChange).toHaveBeenCalledTimes(2);
    expect(broadcastToRenderers).toHaveBeenCalledTimes(2);
  });

  test('ignores unsupported phases', () => {
    const onPhaseChange = jest.fn();
    const broadcastToRenderers = jest.fn();
    const state = createResponseOverlayPhaseState();

    state.setPhase('invalid-phase', 'backend', null, {
      onPhaseChange,
      broadcastToRenderers,
      log: jest.fn(),
    });

    expect(state.getPhase()).toBe('idle');
    expect(onPhaseChange).not.toHaveBeenCalled();
    expect(broadcastToRenderers).not.toHaveBeenCalled();
  });

  test('logs callback error and still broadcasts payload', () => {
    const onPhaseChange = jest.fn(() => {
      throw new Error('callback-boom');
    });
    const broadcastToRenderers = jest.fn();
    const log = jest.fn();
    const state = createResponseOverlayPhaseState();

    state.setPhase('error', 'backend', { failure_reason: 'boom' }, {
      onPhaseChange,
      broadcastToRenderers,
      log,
    });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('callback-boom'));
    expect(broadcastToRenderers).toHaveBeenCalledWith('response-overlay-phase', {
      phase: 'error',
      source: 'backend',
      failure_reason: 'boom',
    });
  });
});
