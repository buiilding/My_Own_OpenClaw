/** @jest-environment node */

const {
  handleMoveChatboxTo,
} = require('../../frontend/src/main/overlay_chatbox_handler.cjs');

describe('overlay_chatbox_handler move runtime', () => {
  function createDeps(overrides = {}) {
    return {
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        setPosition: jest.fn(),
      },
      positionResponseWindow: jest.fn(),
      positionContextLabelWindow: jest.fn(),
      syncContextLabelWindowVisibility: jest.fn(),
      warn: jest.fn(),
      ...overrides,
    };
  }

  test('moves chatbox and repositions dependent overlays', () => {
    const deps = createDeps();

    handleMoveChatboxTo({ x: 100.8, y: 50.2 }, deps);

    expect(deps.chatWindow.setPosition).toHaveBeenCalledWith(101, 50, false);
    expect(deps.positionResponseWindow).toHaveBeenCalledTimes(1);
    expect(deps.positionContextLabelWindow).toHaveBeenCalledTimes(1);
    expect(deps.syncContextLabelWindowVisibility).toHaveBeenCalledTimes(1);
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

  test('warns on move failure', () => {
    const deps = createDeps({
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        setPosition: jest.fn(() => {
          throw new Error('move failed');
        }),
      },
    });

    handleMoveChatboxTo({ x: 10, y: 20 }, deps);

    expect(deps.warn).toHaveBeenCalledWith('[Main] Failed to move chatbox:', 'move failed');
  });
});
