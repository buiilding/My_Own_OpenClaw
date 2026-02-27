/** @jest-environment node */

const {
  handleMoveChatboxTo,
  handleSetChatboxSize,
} = require('../../frontend/src/main/overlay_chatbox_handler.cjs');

describe('overlay_chatbox_handler', () => {
  function createDeps(overrides = {}) {
    return {
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        getSize: jest.fn().mockReturnValue([320, 120]),
        getBounds: jest.fn().mockReturnValue({ x: 40, y: 320, width: 320, height: 120 }),
        setBounds: jest.fn(),
        setPosition: jest.fn(),
      },
      getChatWindowBounds: jest.fn((width, height) => ({ x: 10, y: 20, width, height })),
      positionResponseWindow: jest.fn(),
      positionContextLabelWindow: jest.fn(),
      syncContextLabelWindowVisibility: jest.fn(),
      warn: jest.fn(),
      ...overrides,
    };
  }

  test('resizes chatbox and repositions dependent overlays', async () => {
    const deps = createDeps();

    const result = await handleSetChatboxSize({ width: 501.4, height: 300.2 }, deps);

    expect(result).toEqual({ success: true, resized: true, width: 501, height: 300 });
    expect(deps.getChatWindowBounds).not.toHaveBeenCalled();
    expect(deps.chatWindow.setBounds).toHaveBeenCalledWith({ x: 40, y: 140, width: 501, height: 300 }, false);
    expect(deps.positionResponseWindow).toHaveBeenCalledTimes(1);
    expect(deps.positionContextLabelWindow).toHaveBeenCalledTimes(1);
    expect(deps.syncContextLabelWindowVisibility).toHaveBeenCalledTimes(1);
  });

  test('returns resized false when requested size already applied', async () => {
    const deps = createDeps({
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        getSize: jest.fn().mockReturnValue([400, 250]),
        setBounds: jest.fn(),
      },
    });

    const result = await handleSetChatboxSize({ width: 400, height: 250 }, deps);

    expect(result).toEqual({ success: true, resized: false });
    expect(deps.getChatWindowBounds).not.toHaveBeenCalled();
    expect(deps.chatWindow.setBounds).not.toHaveBeenCalled();
  });

  test('applies size bounds clamps', async () => {
    const deps = createDeps();

    const result = await handleSetChatboxSize({ width: 0, height: 999999 }, deps);

    expect(result).toEqual({ success: true, resized: true, width: 1, height: 7500 });
    expect(deps.getChatWindowBounds).not.toHaveBeenCalled();
    expect(deps.chatWindow.setBounds).toHaveBeenCalledWith({ x: 40, y: -7060, width: 1, height: 7500 }, false);
  });

  test('falls back to centered chat bounds when current bounds are unavailable', async () => {
    const deps = createDeps({
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        getSize: jest.fn().mockReturnValue([320, 120]),
        setBounds: jest.fn(),
      },
    });

    const result = await handleSetChatboxSize({ width: 500, height: 250 }, deps);

    expect(result).toEqual({ success: true, resized: true, width: 500, height: 250 });
    expect(deps.getChatWindowBounds).toHaveBeenCalledWith(500, 250);
    expect(deps.chatWindow.setBounds).toHaveBeenCalledWith({ x: 10, y: 20, width: 500, height: 250 }, false);
  });

  test('keeps bottom anchor stable across sequential resizes when getBounds is stale', async () => {
    const getBounds = jest.fn()
      .mockReturnValue({ x: 40, y: 320, width: 320, height: 120 })
      .mockReturnValue({ x: 40, y: 320, width: 320, height: 120 });
    const deps = createDeps({
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        getSize: jest.fn()
          .mockReturnValueOnce([320, 120])
          .mockReturnValueOnce([501, 300]),
        getBounds,
        setBounds: jest.fn(),
      },
    });

    const first = await handleSetChatboxSize({ width: 501, height: 300 }, deps);
    const second = await handleSetChatboxSize({ width: 501, height: 250 }, deps);

    expect(first).toEqual({ success: true, resized: true, width: 501, height: 300 });
    expect(second).toEqual({ success: true, resized: true, width: 501, height: 250 });
    expect(deps.chatWindow.setBounds).toHaveBeenNthCalledWith(1, {
      x: 40,
      y: 140,
      width: 501,
      height: 300,
    }, false);
    expect(deps.chatWindow.setBounds).toHaveBeenNthCalledWith(2, {
      x: 40,
      y: 190,
      width: 501,
      height: 250,
    }, false);
  });

  test('returns failure when chat window is unavailable', async () => {
    const deps = createDeps({ chatWindow: null });

    const result = await handleSetChatboxSize({ width: 500, height: 250 }, deps);

    expect(result).toEqual({ success: false, reason: 'Chat window not available' });
  });

  test('logs resize failure reason', async () => {
    const deps = createDeps({
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        getSize: jest.fn().mockReturnValue([320, 120]),
        setBounds: jest.fn(),
      },
      getChatWindowBounds: jest.fn(() => {
        throw new Error('boom');
      }),
    });

    const result = await handleSetChatboxSize({ width: 500, height: 250 }, deps);

    expect(result).toEqual({ success: false, reason: 'Failed to resize chatbox: boom' });
  });

  test('moves chatbox and repositions dependent overlays', () => {
    const deps = createDeps();

    handleMoveChatboxTo({ x: 100.8, y: 50.2 }, deps);

    expect(deps.chatWindow.setPosition).toHaveBeenCalledWith(101, 50, false);
    expect(deps.positionResponseWindow).toHaveBeenCalledTimes(1);
    expect(deps.positionContextLabelWindow).toHaveBeenCalledTimes(1);
    expect(deps.syncContextLabelWindowVisibility).toHaveBeenCalledTimes(1);
  });

  test('skips move when coordinates are invalid', () => {
    const deps = createDeps();

    handleMoveChatboxTo({ x: 'invalid', y: 50 }, deps);

    expect(deps.chatWindow.setPosition).not.toHaveBeenCalled();
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
