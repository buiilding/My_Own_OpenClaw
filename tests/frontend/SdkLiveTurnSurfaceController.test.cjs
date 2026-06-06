/** @jest-environment node */

const {
  createSdkLiveTurnSurfaceState,
  handleSdkLiveTurnSurfaceIntent,
  logSdkTypingTransition,
  resolveOverlayIntent,
} = require('../../frontend/src/main/sdk_live_turn_surface_controller.cjs');

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
    setIgnoreMouseEvents: jest.fn(),
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
    syncContextLabelWindowVisibility: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    ...overrides,
  };
}

describe('sdk_live_turn_surface_controller', () => {
  test('normalizes SDK overlay intent from current turn presentation', () => {
    expect(resolveOverlayIntent(createCurrentTurn())).toEqual({
      visible: true,
      mode: 'response',
      turnRef: 'turn-1',
      staleGuardRef: 'turn-1',
      conversationRef: 'conv-1',
    });
  });

  test('shows awaiting overlay directly from SDK current-turn intent', () => {
    const deps = createDeps();

    const result = handleSdkLiveTurnSurfaceIntent(
      createCurrentTurn({ mode: 'awaiting' }),
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

  test('shows response overlay directly from SDK current-turn intent', () => {
    const deps = createDeps();

    handleSdkLiveTurnSurfaceIntent(createCurrentTurn({ mode: 'response' }), deps);

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

  test('skips repeated identical awaiting intent after the native window is already visible', () => {
    const surfaceState = createSdkLiveTurnSurfaceState();
    const deps = createDeps({ surfaceState });
    const currentTurn = createCurrentTurn({ mode: 'awaiting' });

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
    const firstTurn = createCurrentTurn({ mode: 'response' });
    const repeatedTokenSnapshot = {
      ...createCurrentTurn({ mode: 'response' }),
      assistantText: 'longer text that should not alter native window signature',
      presentation: {
        ...firstTurn.presentation,
        entries: [{ id: 'assistant-1', text: 'longer text' }],
        hasVisibleContent: true,
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
      createCurrentTurn({ mode: 'hidden', visible: false, turnRef: 'turn-1' }),
      deps,
    );

    expect(result).toMatchObject({
      success: true,
      ignored: true,
      reason: 'stale-hide',
    });
    expect(deps.setResponseOverlayVisibilityState).not.toHaveBeenCalled();
    expect(deps.responseWindow.hide).not.toHaveBeenCalled();
    expect(deps.responseWindow.setIgnoreMouseEvents).not.toHaveBeenCalled();
  });

  test('hides overlay from matching SDK hidden intent', () => {
    const responseWindow = createWindow({ visible: true });
    const deps = createDeps({
      responseWindow,
      getActiveResponseOverlayGuardRef: jest.fn(() => 'turn-1'),
    });

    const result = handleSdkLiveTurnSurfaceIntent(
      createCurrentTurn({ mode: 'hidden', visible: false, turnRef: 'turn-1' }),
      deps,
    );

    expect(result).toMatchObject({
      success: true,
      applied: true,
      visible: false,
    });
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(false);
    expect(deps.setActiveResponseOverlayGuardRef).toHaveBeenCalledWith(null);
    expect(responseWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true, {
      forward: true,
    });
    expect(responseWindow.hide).toHaveBeenCalledTimes(1);
  });

  test('logs SDK typing transition once for show and once for hide on a turn', () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, WINDIE_DEBUG_LIVE_SURFACE: '1' };
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const surfaceState = createSdkLiveTurnSurfaceState();
    const awaitingTurn = {
      ...createCurrentTurn({ mode: 'awaiting' }),
      phase: 'awaiting',
      presentation: {
        ...createCurrentTurn({ mode: 'awaiting' }).presentation,
        typingVisible: true,
        overlayVisible: true,
        hasVisibleContent: false,
        entries: [],
      },
    };
    const responseTurn = {
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
    };

    try {
      logSdkTypingTransition(awaitingTurn, awaitingTurn.presentation.overlayIntent, surfaceState);
      logSdkTypingTransition(awaitingTurn, awaitingTurn.presentation.overlayIntent, surfaceState);
      logSdkTypingTransition(responseTurn, responseTurn.presentation.overlayIntent, surfaceState);

      const events = logSpy.mock.calls
        .filter(([marker]) => marker === '[LiveSurfaceTrace]')
        .map(([, payload]) => payload.event);
      expect(events).toEqual(['typing.show', 'typing.hide']);
      expect(logSpy.mock.calls[0][1]).toEqual(expect.objectContaining({
        event: 'typing.show',
        process: 'main',
        source: 'sdk-live-turn-surface',
        turnRef: 'turn-1',
        hasVisibleContent: false,
        entryCount: 0,
      }));
      expect(logSpy.mock.calls[1][1]).toEqual(expect.objectContaining({
        event: 'typing.hide',
        process: 'main',
        source: 'sdk-live-turn-surface',
        turnRef: 'turn-1',
        hasVisibleContent: true,
        entryCount: 1,
      }));
    } finally {
      logSpy.mockRestore();
      process.env = originalEnv;
    }
  });
});
