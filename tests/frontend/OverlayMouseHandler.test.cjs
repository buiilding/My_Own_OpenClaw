/** @jest-environment node */

const {
  handleSetOverlayIgnoreMouse,
} = require('../../frontend/src/main/overlay_mouse_handler.cjs');

describe('overlay_mouse_handler', () => {
  function createWindow() {
    return {
      isDestroyed: jest.fn().mockReturnValue(false),
      setIgnoreMouseEvents: jest.fn(),
    };
  }

  test('returns unavailable when no overlay windows exist', () => {
    const result = handleSetOverlayIgnoreMouse({ ignore: true }, {
      chatWindow: null,
      responseWindow: null,
      contextLabelWindow: null,
    });

    expect(result).toEqual({ success: false, reason: 'Overlay windows not available' });
  });

  test('enables ignore mouse with forward option for all available windows', () => {
    const chatWindow = createWindow();
    const responseWindow = createWindow();
    const contextLabelWindow = createWindow();

    const result = handleSetOverlayIgnoreMouse({ ignore: true }, {
      chatWindow,
      responseWindow,
      contextLabelWindow,
    });

    expect(result).toEqual({ success: true });
    expect(chatWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    expect(responseWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    expect(contextLabelWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
  });

  test('disables ignore mouse for available windows', () => {
    const chatWindow = createWindow();
    const responseWindow = createWindow();

    const result = handleSetOverlayIgnoreMouse({ ignore: false }, {
      chatWindow,
      responseWindow,
      contextLabelWindow: null,
    });

    expect(result).toEqual({ success: true });
    expect(chatWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(false);
    expect(responseWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(false);
  });

  test('skips destroyed windows', () => {
    const destroyed = {
      isDestroyed: jest.fn().mockReturnValue(true),
      setIgnoreMouseEvents: jest.fn(),
    };
    const live = createWindow();

    const result = handleSetOverlayIgnoreMouse({ ignore: true }, {
      chatWindow: destroyed,
      responseWindow: live,
      contextLabelWindow: null,
    });

    expect(result).toEqual({ success: true });
    expect(destroyed.setIgnoreMouseEvents).not.toHaveBeenCalled();
    expect(live.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
  });

  test('returns failure when ignore mouse update throws', () => {
    const chatWindow = createWindow();
    chatWindow.setIgnoreMouseEvents.mockImplementation(() => {
      throw new Error('cannot update');
    });

    const result = handleSetOverlayIgnoreMouse({ ignore: true }, {
      chatWindow,
      responseWindow: null,
      contextLabelWindow: null,
    });

    expect(result).toEqual({
      success: false,
      reason: 'Failed to update ignore state: cannot update',
    });
  });
});
