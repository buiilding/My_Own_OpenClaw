/** @jest-environment node */

const {
  RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF,
} = require('../../src/main/ipc/ipc_overlay_phase_contract.cjs');

const {
  createSdkLiveTurnSurfaceState,
  handleSdkLiveTurnSurfaceIntent,
} = require('../../src/main/surfaces/live_turn_surface_controller.cjs');
const {
  configureDebugEnvRuntime,
} = require('../../src/main/app/debug_env.cjs');

const sampleDebugConfig = Object.freeze({
  env: Object.freeze({
    liveSurface: 'SAMPLE_DEBUG_LIVE_SURFACE',
  }),
});

function createWindow({ visible = false } = {}) {
  let isVisible = visible;
  return {
    isDestroyed: jest.fn(() => false),
    isVisible: jest.fn(() => isVisible),
    setBounds: jest.fn(),
    showInactive: jest.fn(() => {
      isVisible = true;
    }),
    hide: jest.fn(() => {
      isVisible = false;
    }),
  };
}

function createCurrentTurn({
  mode = 'response',
  visible = true,
  turnRef = 'turn-1',
  conversationRef = 'conv-1',
} = {}) {
  return {
    conversationRef,
    turnRef,
    presentation: {
      conversationRef,
      turnRef,
      overlayIntent: {
        visible,
        mode,
        turnRef,
        conversationRef,
        staleGuardRef: turnRef,
      },
    },
  };
}

function createSnapshotWithView({
  viewMode = 'response',
  visible = true,
  currentTurnMode = 'awaiting',
  turnRef = 'turn-1',
  conversationRef = 'conv-1',
} = {}) {
  return {
    currentTurn: createCurrentTurn({
      mode: currentTurnMode,
      visible: currentTurnMode !== 'hidden',
      turnRef,
      conversationRef,
    }),
    view: {
      conversationRef,
      liveTurn: {
        turnRef,
        phase: viewMode === 'typing' ? 'awaiting' : 'streaming',
        entries: viewMode === 'response'
          ? [{ id: 'entry-view-response', text: 'view response' }]
          : [],
        isBusy: true,
      },
      surfaces: {
        responseOverlay: {
          mode: viewMode,
          visible,
          guardRef: turnRef,
          ownerConversationRef: conversationRef,
          turnRef,
        },
      },
    },
  };
}

function createDeps(overrides = {}) {
  const responseWindow = createWindow();
  let overlayVisible = false;
  let activeGuardRef = null;
  return {
    responseWindow,
    getResponseWindowBounds: jest.fn((width, height, options = {}) => ({
      x: 10,
      y: options.compactHover ? 40 : 20,
      width,
      height,
    })),
    getResponseOverlayVisible: jest.fn(() => overlayVisible),
    getResponseOverlayPhase: jest.fn(() => 'streaming'),
    getActiveResponseOverlayGuardRef: jest.fn(() => activeGuardRef),
    setActiveResponseOverlayGuardRef: jest.fn((nextGuardRef) => {
      activeGuardRef = nextGuardRef || null;
    }),
    setResponseOverlayVisibilityState: jest.fn((nextVisible) => {
      overlayVisible = nextVisible === true;
    }),
    showResponseWindowInactive: jest.fn(() => {
      responseWindow.showInactive();
    }),
    log: jest.fn(),
    warn: jest.fn(),
    ...overrides,
  };
}

describe('sdk_live_turn_surface_controller', () => {
  test('ignores raw current-turn overlay intent without a ConversationView', () => {
    const deps = createDeps();

    expect(handleSdkLiveTurnSurfaceIntent(createCurrentTurn(), deps)).toMatchObject({
      success: true,
      applied: false,
      reason: 'missing-conversation-view-overlay-intent',
    });
    expect(deps.responseWindow.setBounds).not.toHaveBeenCalled();
    expect(deps.setResponseOverlayVisibilityState).not.toHaveBeenCalled();
    expect(deps.showResponseWindowInactive).not.toHaveBeenCalled();
  });

  test('shows awaiting overlay from ConversationView surface intent', () => {
    const deps = createDeps();

    const result = handleSdkLiveTurnSurfaceIntent(
      createSnapshotWithView({ viewMode: 'typing' }),
      deps,
    );

    expect(result).toMatchObject({
      success: true,
      applied: true,
      visible: true,
      mode: 'awaiting',
      staleGuardRef: 'turn-1',
    });
    expect(deps.getResponseWindowBounds).toHaveBeenCalledWith(520, 24, {
      compactHover: true,
    });
    expect(deps.responseWindow.setBounds).toHaveBeenCalledWith({
      x: 10,
      y: 40,
      width: 520,
      height: 24,
    }, false);
    expect(deps.setActiveResponseOverlayGuardRef).toHaveBeenCalledWith('turn-1');
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(true);
    expect(deps.showResponseWindowInactive).toHaveBeenCalledTimes(1);
  });

  test('shows response overlay from ConversationView surface intent', () => {
    const deps = createDeps();

    handleSdkLiveTurnSurfaceIntent(createSnapshotWithView({ viewMode: 'response' }), deps);

    expect(deps.getResponseWindowBounds).toHaveBeenCalledWith(520, 236, {
      compactHover: false,
    });
    expect(deps.responseWindow.setBounds).toHaveBeenCalledWith({
      x: 10,
      y: 20,
      width: 520,
      height: 236,
    }, false);
    expect(deps.showResponseWindowInactive).toHaveBeenCalledTimes(1);
  });

  test('applies response overlay from conversation view before stale current-turn intent', () => {
    const deps = createDeps();

    const result = handleSdkLiveTurnSurfaceIntent(createSnapshotWithView({
      viewMode: 'response',
      currentTurnMode: 'awaiting',
    }), deps);

    expect(result).toMatchObject({
      success: true,
      applied: true,
      visible: true,
      mode: 'response',
      staleGuardRef: 'turn-1',
    });
    expect(deps.getResponseWindowBounds).toHaveBeenCalledWith(520, 236, {
      compactHover: false,
    });
    expect(deps.responseWindow.setBounds).toHaveBeenCalledWith({
      x: 10,
      y: 20,
      width: 520,
      height: 236,
    }, false);
  });

  test('keeps a user response overlay when a same-turn other conversation awaiting intent arrives', () => {
    const surfaceState = createSdkLiveTurnSurfaceState();
    const deps = createDeps({ surfaceState });

    const userResult = handleSdkLiveTurnSurfaceIntent(
      createSnapshotWithView({
        viewMode: 'response',
        conversationRef: 'conv-user',
        turnRef: 'turn-shared',
      }),
      deps,
    );
    const internalResult = handleSdkLiveTurnSurfaceIntent(
      createSnapshotWithView({
        viewMode: 'typing',
        conversationRef: 'conv-other',
        turnRef: 'turn-shared',
      }),
      deps,
    );

    expect(userResult).toMatchObject({
      applied: true,
      mode: 'response',
      staleGuardRef: 'turn-shared',
    });
    expect(internalResult).toMatchObject({
      applied: false,
      ignored: true,
      reason: 'conversation-owner-mismatch',
      mode: 'awaiting',
    });
    expect(deps.responseWindow.setBounds).toHaveBeenCalledTimes(1);
    expect(deps.responseWindow.setBounds).toHaveBeenCalledWith({
      x: 10,
      y: 20,
      width: 520,
      height: 236,
    }, false);
    expect(deps.showResponseWindowInactive).toHaveBeenCalledTimes(1);
  });

  test('falls back from malformed layout contract heights before bounds resolution', () => {
    jest.isolateModules(() => {
      jest.doMock(
        '../../src/shared/response_overlay_layout_contract.json',
        () => ({
          awaiting_frame_height: Infinity,
          response_fixed_height: -1,
        }),
      );
      const {
        handleSdkLiveTurnSurfaceIntent: handleWithMalformedLayout,
      } = require('../../src/main/surfaces/live_turn_surface_controller.cjs');
      const awaitingDeps = createDeps();
      const responseDeps = createDeps();

      handleWithMalformedLayout(createSnapshotWithView({ viewMode: 'typing' }), awaitingDeps);
      handleWithMalformedLayout(createSnapshotWithView({ viewMode: 'response' }), responseDeps);

      expect(awaitingDeps.getResponseWindowBounds).toHaveBeenCalledWith(520, 24, {
        compactHover: true,
      });
      expect(responseDeps.getResponseWindowBounds).toHaveBeenCalledWith(520, 236, {
        compactHover: false,
      });
    });
  });

  test('rejects non-finite response bounds before native window mutation', () => {
    const deps = createDeps({
      getResponseWindowBounds: jest.fn(() => ({
        x: 10,
        y: Infinity,
        width: 520,
        height: 236,
      })),
    });

    const result = handleSdkLiveTurnSurfaceIntent(
      createSnapshotWithView({ viewMode: 'response' }),
      deps,
    );

    expect(result).toMatchObject({
      success: false,
      applied: false,
      reason: 'invalid-response-bounds',
      visible: false,
      mode: 'response',
      staleGuardRef: 'turn-1',
    });
    expect(deps.responseWindow.setBounds).not.toHaveBeenCalled();
    expect(deps.setActiveResponseOverlayGuardRef).not.toHaveBeenCalled();
    expect(deps.setResponseOverlayVisibilityState).not.toHaveBeenCalled();
    expect(deps.showResponseWindowInactive).not.toHaveBeenCalled();
  });

  test('rejects non-positive response dimensions before native window mutation', () => {
    const deps = createDeps({
      getResponseWindowBounds: jest.fn(() => ({
        x: 10,
        y: 20,
        width: 0,
        height: 236,
      })),
    });

    const result = handleSdkLiveTurnSurfaceIntent(
      createSnapshotWithView({ viewMode: 'response' }),
      deps,
    );

    expect(result).toMatchObject({
      success: false,
      applied: false,
      reason: 'invalid-response-bounds',
      visible: false,
      mode: 'response',
      staleGuardRef: 'turn-1',
    });
    expect(deps.responseWindow.setBounds).not.toHaveBeenCalled();
    expect(deps.setActiveResponseOverlayGuardRef).not.toHaveBeenCalled();
    expect(deps.setResponseOverlayVisibilityState).not.toHaveBeenCalled();
    expect(deps.showResponseWindowInactive).not.toHaveBeenCalled();
  });

  test('suppresses visible SDK overlay intent when floating surface does not own presentation', () => {
    const responseWindow = createWindow({ visible: true });
    const deps = createDeps({
      responseWindow,
      canShowFloatingResponseOverlay: jest.fn(() => false),
      getActiveResponseOverlayGuardRef: jest.fn(() => 'turn-1'),
    });

    const result = handleSdkLiveTurnSurfaceIntent(
      createSnapshotWithView({ viewMode: 'response' }),
      deps,
    );

    expect(result).toMatchObject({
      success: true,
      applied: false,
      ignored: true,
      reason: 'surface-not-owner',
      visible: false,
      mode: 'response',
      staleGuardRef: 'turn-1',
    });
    expect(deps.getResponseWindowBounds).not.toHaveBeenCalled();
    expect(responseWindow.setBounds).not.toHaveBeenCalled();
    expect(deps.showResponseWindowInactive).not.toHaveBeenCalled();
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(false);
    expect(deps.setActiveResponseOverlayGuardRef).toHaveBeenCalledWith(null);
    expect(responseWindow.hide).toHaveBeenCalledTimes(1);
  });

  test('skips dismissed response overlay intent inside the surface controller', () => {
    const deps = createDeps({
      isResponseOverlayGuardDismissed: jest.fn(() => true),
    });

    const result = handleSdkLiveTurnSurfaceIntent(
      createSnapshotWithView({ viewMode: 'response' }),
      deps,
    );

    expect(result).toMatchObject({
      success: true,
      applied: false,
      ignored: true,
      reason: 'dismissed-response-overlay',
      visible: false,
      mode: 'response',
      staleGuardRef: 'turn-1',
    });
    expect(deps.isResponseOverlayGuardDismissed).toHaveBeenCalledWith('turn-1');
    expect(deps.responseWindow.setBounds).not.toHaveBeenCalled();
    expect(deps.showResponseWindowInactive).not.toHaveBeenCalled();
  });

  test('skips repeated identical awaiting intent after the native window is already visible', () => {
    const surfaceState = createSdkLiveTurnSurfaceState();
    const deps = createDeps({ surfaceState });
    const currentTurn = createSnapshotWithView({ viewMode: 'typing' });

    const firstResult = handleSdkLiveTurnSurfaceIntent(currentTurn, deps);
    const secondResult = handleSdkLiveTurnSurfaceIntent(currentTurn, deps);

    expect(firstResult).toMatchObject({ applied: true, mode: 'awaiting' });
    expect(secondResult).toMatchObject({
      applied: false,
      ignored: true,
      reason: 'idempotent-visible-intent',
      mode: 'awaiting',
    });
    expect(deps.responseWindow.setBounds).toHaveBeenCalledTimes(1);
    expect(deps.showResponseWindowInactive).toHaveBeenCalledTimes(1);
  });

  test('applies response intent once and skips repeated token snapshots with the same window signature', () => {
    const surfaceState = createSdkLiveTurnSurfaceState();
    const deps = createDeps({ surfaceState });
    const firstTurn = createSnapshotWithView({ viewMode: 'response' });
    const repeatedTokenSnapshot = {
      ...createSnapshotWithView({ viewMode: 'response' }),
      assistantText: 'longer text that should not alter native window signature',
      currentTurn: {
        ...firstTurn.currentTurn,
        presentation: {
          ...firstTurn.currentTurn.presentation,
          entries: [{ id: 'assistant-1', text: 'longer text' }],
          hasVisibleContent: true,
        },
      },
    };

    const firstResult = handleSdkLiveTurnSurfaceIntent(firstTurn, deps);
    const secondResult = handleSdkLiveTurnSurfaceIntent(repeatedTokenSnapshot, deps);

    expect(firstResult).toMatchObject({ applied: true, mode: 'response' });
    expect(secondResult).toMatchObject({
      applied: false,
      ignored: true,
      reason: 'idempotent-visible-intent',
      mode: 'response',
    });
    expect(deps.responseWindow.setBounds).toHaveBeenCalledTimes(1);
    expect(deps.showResponseWindowInactive).toHaveBeenCalledTimes(1);
  });

  test('ignores hidden intent from an older SDK turn while a guarded overlay is active', () => {
    const deps = createDeps({
      getActiveResponseOverlayGuardRef: jest.fn(() => 'turn-2'),
    });

    const result = handleSdkLiveTurnSurfaceIntent(
      createSnapshotWithView({ viewMode: 'hidden', visible: false, turnRef: 'turn-1' }),
      deps,
    );

    expect(result).toMatchObject({
      success: true,
      ignored: true,
      reason: 'stale-hide',
    });
    expect(deps.setResponseOverlayVisibilityState).not.toHaveBeenCalled();
    expect(deps.responseWindow.hide).not.toHaveBeenCalled();
  });

  test('ignores hidden SDK intent while renderer send preflight guard is active', () => {
    const responseWindow = createWindow({ visible: true });
    const deps = createDeps({
      responseWindow,
      getResponseOverlayVisible: jest.fn(() => true),
      getResponseOverlayPhase: jest.fn(() => 'awaiting-first-chunk'),
      getActiveResponseOverlayGuardRef: jest.fn(() => RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF),
    });

    const result = handleSdkLiveTurnSurfaceIntent(
      createSnapshotWithView({ viewMode: 'hidden', visible: false, turnRef: 'turn-1' }),
      deps,
    );

    expect(result).toMatchObject({
      success: true,
      ignored: true,
      reason: 'stale-hide',
    });
    expect(deps.setResponseOverlayVisibilityState).not.toHaveBeenCalled();
    expect(responseWindow.hide).not.toHaveBeenCalled();
  });

  test('hides overlay from matching SDK hidden intent', () => {
    const responseWindow = createWindow({ visible: true });
    const deps = createDeps({
      responseWindow,
      getActiveResponseOverlayGuardRef: jest.fn(() => 'turn-1'),
    });

    const result = handleSdkLiveTurnSurfaceIntent(
      createSnapshotWithView({ viewMode: 'hidden', visible: false, turnRef: 'turn-1' }),
      deps,
    );

    expect(result).toMatchObject({
      success: true,
      applied: true,
      visible: false,
    });
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(false);
    expect(deps.setActiveResponseOverlayGuardRef).toHaveBeenCalledWith(null);
    expect(responseWindow.hide).toHaveBeenCalledTimes(1);
  });

  test('logs SDK typing transition once for show and once for hide on a turn', () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, SAMPLE_DEBUG_LIVE_SURFACE: '1' };
    configureDebugEnvRuntime(sampleDebugConfig);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const surfaceState = createSdkLiveTurnSurfaceState();
    const awaitingTurn = {
      ...createSnapshotWithView({ viewMode: 'typing' }),
      currentTurn: {
        ...createCurrentTurn({ mode: 'awaiting' }),
        phase: 'awaiting',
        presentation: {
          ...createCurrentTurn({ mode: 'awaiting' }).presentation,
          typingVisible: true,
          overlayVisible: true,
          hasVisibleContent: false,
          entries: [],
        },
      },
    };
    const responseTurn = {
      ...createSnapshotWithView({ viewMode: 'response' }),
      currentTurn: {
        ...createCurrentTurn({ mode: 'response' }),
        phase: 'streaming',
        assistantText: 'hey',
        presentation: {
          ...createCurrentTurn({ mode: 'response' }).presentation,
          typingVisible: false,
          overlayVisible: true,
          hasVisibleContent: true,
          entries: [{ id: 'assistant-1', text: 'hey' }],
        },
      },
    };

    try {
      const deps = createDeps({ surfaceState });
      handleSdkLiveTurnSurfaceIntent(awaitingTurn, deps);
      handleSdkLiveTurnSurfaceIntent(awaitingTurn, deps);
      handleSdkLiveTurnSurfaceIntent(responseTurn, deps);

      const events = logSpy.mock.calls
        .filter(([marker]) => marker === '[LiveSurfaceTrace]')
        .map(([, payload]) => payload.event)
        .filter((event) => event.startsWith('typing.'));
      expect(events).toEqual(['typing.show', 'typing.hide']);
      const typingPayloads = logSpy.mock.calls
        .filter(([marker, payload]) => marker === '[LiveSurfaceTrace]' && payload.event?.startsWith('typing.'))
        .map(([, payload]) => payload);
      expect(typingPayloads[0]).toEqual(expect.objectContaining({
        event: 'typing.show',
        process: 'main',
        source: 'sdk-live-turn-surface',
        turnRef: 'turn-1',
        hasVisibleContent: false,
        entryCount: 0,
      }));
      expect(typingPayloads[1]).toEqual(expect.objectContaining({
        event: 'typing.hide',
        process: 'main',
        source: 'sdk-live-turn-surface',
        turnRef: 'turn-1',
        hasVisibleContent: true,
        entryCount: 1,
      }));
    } finally {
      logSpy.mockRestore();
      configureDebugEnvRuntime();
      process.env = originalEnv;
    }
  });
});
