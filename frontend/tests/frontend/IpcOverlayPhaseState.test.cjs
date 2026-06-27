/** @jest-environment node */

const {
  createResponseOverlayPhaseState,
} = require('../../src/main/ipc/ipc_overlay_phase_state.cjs');
const {
  RESPONSE_OVERLAY_PHASES,
} = require('../../src/main/ipc/ipc_overlay_phase_contract.cjs');

describe('ipc_overlay_phase_state', () => {
  test('exports supported overlay phases', () => {
    expect(RESPONSE_OVERLAY_PHASES.has('idle')).toBe(true);
    expect(RESPONSE_OVERLAY_PHASES.has('tool-call')).toBe(true);
    expect(RESPONSE_OVERLAY_PHASES.has('error')).toBe(true);
    expect(RESPONSE_OVERLAY_PHASES.has('not-a-phase')).toBe(false);
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
