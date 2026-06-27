/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createResponseOverlayPhaseState,
} = require('../../src/main/ipc/ipc_overlay_phase_state.cjs');
const {
  createResponseOverlayPhaseRuntime,
} = require('../../src/main/ipc/ipc_response_overlay_phase_runtime.cjs');

function createRuntime(overrides = {}) {
  const responseOverlayPhaseState = createResponseOverlayPhaseState();
  const applyResponseOverlayPhase = jest.fn();
  const setAgentLoopStopShortcutEnabled = jest.fn();
  const deps = {
    responseOverlayPhaseState,
    logChatPillMainTrace: jest.fn(),
    getApplyResponseOverlayPhase: jest.fn(() => applyResponseOverlayPhase),
    getSetAgentLoopStopShortcutEnabled: jest.fn(() => setAgentLoopStopShortcutEnabled),
    isAgentLoopStopShortcutPhase: jest.fn(phase => phase === 'streaming'),
    syncBackendIdleDisconnectTimer: jest.fn(),
    broadcastToRenderers: jest.fn(),
    log: jest.fn(),
    ...overrides,
  };
  return {
    runtime: createResponseOverlayPhaseRuntime(deps),
    deps,
    applyResponseOverlayPhase,
    setAgentLoopStopShortcutEnabled,
  };
}

describe('ipc_response_overlay_phase_runtime', () => {
  test('applies phase changes through trace, state broadcast, stop shortcut, and idle sync', () => {
    const {
      runtime,
      deps,
      applyResponseOverlayPhase,
      setAgentLoopStopShortcutEnabled,
    } = createRuntime();

    runtime.setResponseOverlayPhase('streaming', 'backend-event', {
      correlation_id: 'corr-1',
    });

    expect(deps.logChatPillMainTrace).toHaveBeenCalledWith(
      {
        source: 'ipc',
        action: 'set-phase',
        phase: 'streaming',
        correlationId: 'corr-1',
        reason: 'backend-event',
      },
      {
        getResponseOverlayPhase: expect.any(Function),
      },
    );
    expect(applyResponseOverlayPhase).toHaveBeenCalledWith({
      phase: 'streaming',
      source: 'backend-event',
      correlation_id: 'corr-1',
    });
    expect(deps.broadcastToRenderers).toHaveBeenCalledWith(
      'response-overlay-phase',
      {
        phase: 'streaming',
        source: 'backend-event',
        correlation_id: 'corr-1',
      },
    );
    expect(setAgentLoopStopShortcutEnabled).toHaveBeenCalledWith(true);
    expect(deps.syncBackendIdleDisconnectTimer).toHaveBeenCalledWith('phase:streaming');
    expect(runtime.getPhase()).toBe('streaming');
  });

  test('disables the stop shortcut after terminal phases', () => {
    const {
      runtime,
      setAgentLoopStopShortcutEnabled,
    } = createRuntime();

    runtime.setResponseOverlayPhase('streaming', 'query');
    runtime.setResponseOverlayPhase('complete', 'streaming-complete');

    expect(setAgentLoopStopShortcutEnabled).toHaveBeenLastCalledWith(false);
    expect(runtime.getPhase()).toBe('complete');
  });

  test('keeps live callbacks lazy so test shutdown and reinitialize can swap adapters', () => {
    const firstApply = jest.fn();
    const secondApply = jest.fn();
    let applyResponseOverlayPhase = firstApply;
    const {
      runtime,
      deps,
    } = createRuntime({
      getApplyResponseOverlayPhase: jest.fn(() => applyResponseOverlayPhase),
    });

    runtime.setResponseOverlayPhase('streaming', 'first');
    applyResponseOverlayPhase = secondApply;
    runtime.setResponseOverlayPhase('complete', 'second');

    expect(firstApply).toHaveBeenCalledWith(expect.objectContaining({ source: 'first' }));
    expect(secondApply).toHaveBeenCalledWith(expect.objectContaining({ source: 'second' }));
    expect(deps.getApplyResponseOverlayPhase).toHaveBeenCalledTimes(2);
  });

  test('ipc.cjs delegates response-overlay phase side effects to the runtime helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_response_overlay_phase_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createResponseOverlayPhaseRuntime({');
    expect(mainSource).toContain('responseOverlayPhaseRuntime.setResponseOverlayPhase(phase, source, metadata)');
    expect(mainSource).not.toContain("action: 'set-phase'");
    expect(mainSource).not.toContain("syncBackendIdleDisconnectTimer(`phase:${phase}`)");
    expect(helperSource).toContain("action: 'set-phase'");
    expect(helperSource).toContain("syncBackendIdleDisconnectTimer(`phase:${phase}`)");
  });
});
