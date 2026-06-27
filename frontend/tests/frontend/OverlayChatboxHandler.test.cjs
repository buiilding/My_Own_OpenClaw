/** @jest-environment node */

const {
  handleMoveChatboxTo,
} = require('../../src/main/surfaces/overlay_chatbox_handler.cjs');

describe('overlay_chatbox_handler move runtime', () => {
  function createDeps(overrides = {}) {
    return {
      screen: {},
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        getSize: jest.fn(() => [520, 116]),
        setPosition: jest.fn(),
      },
      resolveDisplayAffinityForBounds: jest.fn(() => ({
        monitor_id: 'display-2',
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      })),
      setActiveDisplayAffinity: jest.fn(),
      setManualChatWindowPosition: jest.fn(() => true),
      positionChatWindow: jest.fn(),
      syncWindowDisplayAffinity: jest.fn(),
      positionResponseWindow: jest.fn(),
      warn: jest.fn(),
      ...overrides,
    };
  }

  test('moves chatbox and repositions dependent overlays', () => {
    const deps = createDeps();

    handleMoveChatboxTo({ x: 100.8, y: 50.2 }, deps);

    expect(deps.resolveDisplayAffinityForBounds).toHaveBeenCalledWith(deps.screen, {
      x: 101,
      y: 50,
      width: 520,
      height: 116,
    });
    expect(deps.setActiveDisplayAffinity).toHaveBeenCalledWith({
      monitor_id: 'display-2',
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    });
    expect(deps.setManualChatWindowPosition).toHaveBeenCalledWith({ x: 101, y: 50, monitorId: 'display-2' });
    expect(deps.positionChatWindow).toHaveBeenCalledTimes(1);
    expect(deps.syncWindowDisplayAffinity).toHaveBeenCalledWith(deps.chatWindow);
    expect(deps.positionResponseWindow).not.toHaveBeenCalled();
    expect(deps.setActiveDisplayAffinity.mock.invocationCallOrder[0]).toBeLessThan(
      deps.setManualChatWindowPosition.mock.invocationCallOrder[0],
    );
    expect(deps.setManualChatWindowPosition.mock.invocationCallOrder[0]).toBeLessThan(
      deps.positionChatWindow.mock.invocationCallOrder[0],
    );
    expect(deps.positionChatWindow.mock.invocationCallOrder[0]).toBeLessThan(
      deps.syncWindowDisplayAffinity.mock.invocationCallOrder[0],
    );
  });

  test('skips move when chat window is unavailable', () => {
    const deps = createDeps({ chatWindow: null });

    handleMoveChatboxTo({ x: 10, y: 20 }, deps);

    expect(deps.positionResponseWindow).not.toHaveBeenCalled();
  });

  test('skips move when chat window is destroyed', () => {
    const deps = createDeps({
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(true),
        setPosition: jest.fn(),
      },
    });

    handleMoveChatboxTo({ x: 10, y: 20 }, deps);

    expect(deps.chatWindow.setPosition).not.toHaveBeenCalled();
    expect(deps.positionResponseWindow).not.toHaveBeenCalled();
  });

  test('skips move when coordinates are invalid', () => {
    const deps = createDeps();

    handleMoveChatboxTo({ x: 'invalid', y: 50 }, deps);

    expect(deps.chatWindow.setPosition).not.toHaveBeenCalled();
    expect(deps.positionResponseWindow).not.toHaveBeenCalled();
  });

  test('normalizes malformed chat window dimensions before resolving display affinity', () => {
    const deps = createDeps({
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        getSize: jest.fn(() => [Infinity, Number.NaN]),
        setPosition: jest.fn(),
      },
    });

    handleMoveChatboxTo({ x: 10, y: 20 }, deps);

    expect(deps.resolveDisplayAffinityForBounds).toHaveBeenCalledWith(deps.screen, {
      x: 10,
      y: 20,
      width: 1,
      height: 1,
    });
  });

  test('warns on move failure', () => {
    const deps = createDeps({
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        getSize: jest.fn(() => [520, 116]),
        setPosition: jest.fn(() => {
          throw new Error('move failed');
        }),
      },
      positionChatWindow: jest.fn(() => {
        throw new Error('move failed');
      }),
    });

    handleMoveChatboxTo({ x: 10, y: 20 }, deps);

    expect(deps.warn).toHaveBeenCalledWith('[Main] Failed to move chatbox:', 'move failed');
  });

  test('falls back to direct setPosition when helper reposition is unavailable', () => {
    const deps = createDeps({
      positionChatWindow: undefined,
    });

    handleMoveChatboxTo({ x: 10, y: 20 }, deps);

    expect(deps.chatWindow.setPosition).toHaveBeenCalledWith(10, 20, false);
    expect(deps.positionResponseWindow).toHaveBeenCalledTimes(1);
  });
});
