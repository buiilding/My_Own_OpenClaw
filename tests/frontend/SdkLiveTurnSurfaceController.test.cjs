/** @jest-environment node */

const {
  handleSdkLiveTurnSurfaceIntent,
  resolveOverlayIntent,
} = require('../../frontend/src/main/sdk_live_turn_surface_controller.cjs');

function createWindow({ visible = false } = {}) {
  return {
    isDestroyed: jest.fn(() => false),
    isVisible: jest.fn(() => visible),
    setBounds: jest.fn(),
    showInactive: jest.fn(),
    hide: jest.fn(),
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
  return {
    responseWindow,
    getResponseWindowBounds: jest.fn((width, height, options = {}) => ({
      x: 10,
      y: options.compactHover ? 40 : 20,
      width,
      height,
    })),
    getResponseOverlayVisible: jest.fn(() => false),
    getResponseOverlayPhase: jest.fn(() => 'streaming'),
    getActiveResponseOverlayGuardRef: jest.fn(() => null),
    setActiveResponseOverlayGuardRef: jest.fn(),
    setResponseOverlayVisibilityState: jest.fn(),
    showResponseWindowInactive: jest.fn(),
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
    expect(responseWindow.hide).toHaveBeenCalledTimes(1);
  });
});
