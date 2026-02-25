/** @jest-environment node */

const {
  handleResponseOverlayPhaseEvent,
  isStreamingResponseOverlayPhase,
} = require('../../frontend/src/main/response_overlay_phase_handler.cjs');

const PHASE = Object.freeze({
  IDLE: 'idle',
  AWAITING_FIRST_CHUNK: 'awaiting-first-chunk',
  STREAMING: 'streaming',
  TOOL_CALL: 'tool-call',
  TOOL_OUTPUT: 'tool-output',
  COMPLETE: 'complete',
  ERROR: 'error',
});

describe('response_overlay_phase_handler', () => {
  function createDeps(overrides = {}) {
    return {
      ENABLE_OS_TOOL_GHOST_DEBUG: false,
      RESPONSE_OVERLAY_PHASE: PHASE,
      setResponseOverlayPhase: jest.fn(),
      getResponseOverlayVisible: jest.fn().mockReturnValue(false),
      setResponseOverlayVisibilityState: jest.fn(),
      responseWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(true),
        hide: jest.fn(),
      },
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(true),
      },
      ensureResponseOverlayFallbackBounds: jest.fn(),
      showResponseWindowWhenChatVisible: jest.fn(),
      showResponseWindowInactive: jest.fn(),
      syncContextLabelWindowVisibility: jest.fn(),
      ...overrides,
    };
  }

  test('recognizes streaming phases only', () => {
    expect(isStreamingResponseOverlayPhase(PHASE.AWAITING_FIRST_CHUNK, PHASE)).toBe(true);
    expect(isStreamingResponseOverlayPhase(PHASE.STREAMING, PHASE)).toBe(true);
    expect(isStreamingResponseOverlayPhase(PHASE.TOOL_CALL, PHASE)).toBe(true);
    expect(isStreamingResponseOverlayPhase(PHASE.TOOL_OUTPUT, PHASE)).toBe(true);
    expect(isStreamingResponseOverlayPhase(PHASE.COMPLETE, PHASE)).toBe(false);
  });

  test('returns early when debug overlay mode is enabled', () => {
    const deps = createDeps({ ENABLE_OS_TOOL_GHOST_DEBUG: true });

    handleResponseOverlayPhaseEvent({ phase: PHASE.STREAMING }, deps);

    expect(deps.setResponseOverlayPhase).not.toHaveBeenCalled();
    expect(deps.setResponseOverlayVisibilityState).not.toHaveBeenCalled();
  });

  test('ignores unknown phase values', () => {
    const deps = createDeps();

    handleResponseOverlayPhaseEvent({ phase: 'unknown-phase' }, deps);

    expect(deps.setResponseOverlayPhase).not.toHaveBeenCalled();
  });

  test('handles idle phase by hiding overlay and window', () => {
    const deps = createDeps();

    handleResponseOverlayPhaseEvent({ phase: PHASE.IDLE }, deps);

    expect(deps.setResponseOverlayPhase).toHaveBeenCalledWith(PHASE.IDLE);
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(false);
    expect(deps.responseWindow.hide).toHaveBeenCalledTimes(1);
  });

  test('handles streaming phase by making overlay visible and restoring bounds', () => {
    const deps = createDeps();

    handleResponseOverlayPhaseEvent({ phase: PHASE.STREAMING }, deps);

    expect(deps.setResponseOverlayPhase).toHaveBeenCalledWith(PHASE.STREAMING);
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(true);
    expect(deps.ensureResponseOverlayFallbackBounds).toHaveBeenCalledTimes(1);
    expect(deps.showResponseWindowWhenChatVisible).toHaveBeenCalledTimes(1);
  });

  test('skips fallback/show when response window is unavailable in streaming phase', () => {
    const deps = createDeps({
      responseWindow: {
        isDestroyed: jest.fn().mockReturnValue(true),
      },
    });

    handleResponseOverlayPhaseEvent({ phase: PHASE.TOOL_CALL }, deps);

    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(true);
    expect(deps.ensureResponseOverlayFallbackBounds).not.toHaveBeenCalled();
    expect(deps.showResponseWindowWhenChatVisible).not.toHaveBeenCalled();
  });

  test('handles terminal phase by reshowing overlay when visible and chat is shown', () => {
    const deps = createDeps({
      getResponseOverlayVisible: jest.fn().mockReturnValue(true),
    });

    handleResponseOverlayPhaseEvent({ phase: PHASE.COMPLETE }, deps);

    expect(deps.showResponseWindowInactive).toHaveBeenCalledTimes(1);
    expect(deps.syncContextLabelWindowVisibility).toHaveBeenCalledTimes(1);
  });

  test('terminal phase still syncs context label when overlay is not visible', () => {
    const deps = createDeps({
      getResponseOverlayVisible: jest.fn().mockReturnValue(false),
    });

    handleResponseOverlayPhaseEvent({ phase: PHASE.ERROR }, deps);

    expect(deps.showResponseWindowInactive).not.toHaveBeenCalled();
    expect(deps.syncContextLabelWindowVisibility).toHaveBeenCalledTimes(1);
  });
});
