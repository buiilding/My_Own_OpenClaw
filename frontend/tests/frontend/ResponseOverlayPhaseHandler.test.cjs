/** @jest-environment node */

const {
  handleResponseOverlayPhaseEvent,
  isStreamingResponseOverlayPhase,
} = require('../../src/main/surfaces/response_overlay_phase_handler.cjs');
const {
  RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF,
  RESPONSE_OVERLAY_PREFLIGHT_SOURCE,
} = require('../../src/main/ipc/ipc_overlay_phase_contract.cjs');

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
        setIgnoreMouseEvents: jest.fn(),
        setFocusable: jest.fn(),
      },
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(true),
        setIgnoreMouseEvents: jest.fn(),
        setFocusable: jest.fn(),
      },
      getChatboxHitTestActive: jest.fn(() => false),
      getActiveResponseOverlayGuardRef: jest.fn(() => null),
      setActiveResponseOverlayGuardRef: jest.fn(),
      ensureResponseOverlayFallbackBounds: jest.fn(),
      showResponseWindowWhenChatVisible: jest.fn(),
      showResponseWindowInactive: jest.fn(),
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
    expect(deps.chatWindow.setIgnoreMouseEvents).not.toHaveBeenCalled();
    expect(deps.responseWindow.setFocusable).not.toHaveBeenCalled();
  });

  test('idle phase does not hide an active guarded SDK overlay', () => {
    const deps = createDeps({
      getActiveResponseOverlayGuardRef: jest.fn(() => 'turn-active'),
    });

    handleResponseOverlayPhaseEvent({ phase: PHASE.IDLE }, deps);

    expect(deps.setResponseOverlayPhase).toHaveBeenCalledWith(PHASE.IDLE);
    expect(deps.setResponseOverlayVisibilityState).not.toHaveBeenCalledWith(false);
    expect(deps.responseWindow.hide).not.toHaveBeenCalled();
  });

  test('idle phase does not own chat pill hit-testing', () => {
    const deps = createDeps({
      getChatboxHitTestActive: jest.fn(() => true),
    });

    handleResponseOverlayPhaseEvent({ phase: PHASE.IDLE }, deps);

    expect(deps.chatWindow.setIgnoreMouseEvents).not.toHaveBeenCalled();
  });

  test('active streaming phase records phase but defers native window show to SDK overlay intent', () => {
    const deps = createDeps();

    handleResponseOverlayPhaseEvent({ phase: PHASE.STREAMING }, deps);

    expect(deps.setResponseOverlayPhase).toHaveBeenCalledWith(PHASE.STREAMING);
    expect(deps.setResponseOverlayVisibilityState).not.toHaveBeenCalledWith(true);
    expect(deps.ensureResponseOverlayFallbackBounds).not.toHaveBeenCalled();
    expect(deps.showResponseWindowWhenChatVisible).not.toHaveBeenCalled();
    expect(deps.chatWindow.setIgnoreMouseEvents).not.toHaveBeenCalled();
    expect(deps.responseWindow.setFocusable).not.toHaveBeenCalled();
  });

  test('renderer send preflight arms guard and waits for renderer size intent', () => {
    let activeGuardRef = null;
    const deps = createDeps({
      getActiveResponseOverlayGuardRef: jest.fn(() => activeGuardRef),
      setActiveResponseOverlayGuardRef: jest.fn((nextGuardRef) => {
        activeGuardRef = nextGuardRef;
      }),
    });

    handleResponseOverlayPhaseEvent({
      phase: PHASE.AWAITING_FIRST_CHUNK,
      source: RESPONSE_OVERLAY_PREFLIGHT_SOURCE,
    }, deps);

    expect(deps.setResponseOverlayPhase).toHaveBeenCalledWith(PHASE.AWAITING_FIRST_CHUNK);
    expect(deps.setActiveResponseOverlayGuardRef)
      .toHaveBeenCalledWith(RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF);
    expect(activeGuardRef).toBe(RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF);
    expect(deps.setResponseOverlayVisibilityState).not.toHaveBeenCalledWith(true);
    expect(deps.ensureResponseOverlayFallbackBounds).not.toHaveBeenCalled();
    expect(deps.showResponseWindowWhenChatVisible).not.toHaveBeenCalled();
  });

  test('idle phase clears preflight guard and hides overlay', () => {
    let activeGuardRef = RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF;
    const deps = createDeps({
      getActiveResponseOverlayGuardRef: jest.fn(() => activeGuardRef),
      setActiveResponseOverlayGuardRef: jest.fn((nextGuardRef) => {
        activeGuardRef = nextGuardRef;
      }),
    });

    handleResponseOverlayPhaseEvent({ phase: PHASE.IDLE }, deps);

    expect(deps.setResponseOverlayPhase).toHaveBeenCalledWith(PHASE.IDLE);
    expect(deps.setActiveResponseOverlayGuardRef).toHaveBeenCalledWith(null);
    expect(activeGuardRef).toBeNull();
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(false);
    expect(deps.responseWindow.hide).toHaveBeenCalledTimes(1);
  });

  test('renderer send preflight suppresses awaiting fallback when floating surface is not owner', () => {
    let activeGuardRef = RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF;
    const deps = createDeps({
      canShowFloatingResponseOverlay: jest.fn(() => false),
      getActiveResponseOverlayGuardRef: jest.fn(() => activeGuardRef),
      setActiveResponseOverlayGuardRef: jest.fn((nextGuardRef) => {
        activeGuardRef = nextGuardRef;
      }),
    });

    handleResponseOverlayPhaseEvent({
      phase: PHASE.AWAITING_FIRST_CHUNK,
      source: RESPONSE_OVERLAY_PREFLIGHT_SOURCE,
    }, deps);

    expect(deps.setResponseOverlayPhase).toHaveBeenCalledWith(PHASE.AWAITING_FIRST_CHUNK);
    expect(deps.setActiveResponseOverlayGuardRef).toHaveBeenCalledWith(null);
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(false);
    expect(deps.responseWindow.hide).toHaveBeenCalledTimes(1);
    expect(deps.ensureResponseOverlayFallbackBounds).not.toHaveBeenCalled();
    expect(deps.showResponseWindowWhenChatVisible).not.toHaveBeenCalled();
  });

  test('streaming phase does not force overlay click-through when hit-test is active', () => {
    const deps = createDeps({
      getChatboxHitTestActive: jest.fn(() => true),
    });

    handleResponseOverlayPhaseEvent({ phase: PHASE.STREAMING }, deps);

    expect(deps.chatWindow.setIgnoreMouseEvents).not.toHaveBeenCalled();
    expect(deps.chatWindow.setFocusable).not.toHaveBeenCalled();
    expect(deps.responseWindow.setIgnoreMouseEvents).not.toHaveBeenCalled();
    expect(deps.responseWindow.setFocusable).not.toHaveBeenCalled();
  });

  test('skips fallback/show when response window is unavailable in streaming phase', () => {
    const deps = createDeps({
      responseWindow: {
        isDestroyed: jest.fn().mockReturnValue(true),
      },
    });

    handleResponseOverlayPhaseEvent({ phase: PHASE.TOOL_CALL }, deps);

    expect(deps.setResponseOverlayVisibilityState).not.toHaveBeenCalledWith(true);
    expect(deps.ensureResponseOverlayFallbackBounds).not.toHaveBeenCalled();
    expect(deps.showResponseWindowWhenChatVisible).not.toHaveBeenCalled();
  });

  test('handles terminal phase by reshowing overlay when visible and chat is shown', () => {
    const deps = createDeps({
      getResponseOverlayVisible: jest.fn().mockReturnValue(true),
    });

    handleResponseOverlayPhaseEvent({ phase: PHASE.COMPLETE }, deps);

    expect(deps.showResponseWindowInactive).toHaveBeenCalledTimes(1);
  });

  test('terminal phase does not restore overlay when floating surface is not owner', () => {
    const deps = createDeps({
      getResponseOverlayVisible: jest.fn().mockReturnValue(true),
      canShowFloatingResponseOverlay: jest.fn(() => false),
    });

    handleResponseOverlayPhaseEvent({ phase: PHASE.COMPLETE }, deps);

    expect(deps.showResponseWindowInactive).not.toHaveBeenCalled();
  });

  test('terminal phase does not restore overlay when overlay is not visible', () => {
    const deps = createDeps({
      getResponseOverlayVisible: jest.fn().mockReturnValue(false),
    });

    handleResponseOverlayPhaseEvent({ phase: PHASE.ERROR }, deps);

    expect(deps.showResponseWindowInactive).not.toHaveBeenCalled();
  });

  test('terminal phases restore only when the cached response shell is safely visible', () => {
    const deps = createDeps({
      getResponseOverlayVisible: jest.fn().mockReturnValue(true),
    });
    handleResponseOverlayPhaseEvent({ phase: PHASE.COMPLETE }, deps);
    expect(deps.showResponseWindowInactive).toHaveBeenCalledTimes(1);

    const hiddenChatDeps = createDeps({
      getResponseOverlayVisible: jest.fn().mockReturnValue(true),
    });
    hiddenChatDeps.chatWindow.isVisible.mockReturnValue(false);

    handleResponseOverlayPhaseEvent({ phase: PHASE.COMPLETE }, hiddenChatDeps);

    expect(hiddenChatDeps.showResponseWindowInactive).not.toHaveBeenCalled();
  });

  test('ignores stale terminal phases from a previous response correlation', () => {
    let activeCorrelationId = null;
    const deps = createDeps({
      getActiveResponseOverlayCorrelationId: jest.fn(() => activeCorrelationId),
      setActiveResponseOverlayCorrelationId: jest.fn((nextCorrelationId) => {
        activeCorrelationId = nextCorrelationId;
      }),
    });

    handleResponseOverlayPhaseEvent({
      phase: PHASE.AWAITING_FIRST_CHUNK,
      correlation_id: 'response-a',
    }, deps);
    handleResponseOverlayPhaseEvent({
      phase: PHASE.STREAMING,
      correlation_id: 'response-b',
    }, deps);
    handleResponseOverlayPhaseEvent({
      phase: PHASE.COMPLETE,
      correlation_id: 'response-a',
    }, deps);

    expect(deps.setResponseOverlayPhase.mock.calls.map(([phase]) => phase)).toEqual([
      PHASE.AWAITING_FIRST_CHUNK,
      PHASE.STREAMING,
    ]);
    expect(deps.setResponseOverlayVisibilityState).not.toHaveBeenCalledWith(false);
    expect(activeCorrelationId).toBe('response-b');
  });

  test('clears active response correlation after matching terminal phase', () => {
    let activeCorrelationId = null;
    const deps = createDeps({
      getActiveResponseOverlayCorrelationId: jest.fn(() => activeCorrelationId),
      setActiveResponseOverlayCorrelationId: jest.fn((nextCorrelationId) => {
        activeCorrelationId = nextCorrelationId;
      }),
      getResponseOverlayVisible: jest.fn().mockReturnValue(true),
    });

    handleResponseOverlayPhaseEvent({
      phase: PHASE.STREAMING,
      correlation_id: 'response-a',
    }, deps);
    handleResponseOverlayPhaseEvent({
      phase: PHASE.COMPLETE,
      correlation_id: 'response-a',
    }, deps);

    expect(deps.setResponseOverlayPhase.mock.calls.map(([phase]) => phase)).toEqual([
      PHASE.STREAMING,
      PHASE.COMPLETE,
    ]);
    expect(activeCorrelationId).toBeNull();
    expect(deps.showResponseWindowInactive).toHaveBeenCalledTimes(1);
  });
});
