/** @jest-environment node */

const {
  handleSetOverlayFocusable,
} = require('../../frontend/src/main/overlay_focusable_handler.cjs');

describe('overlay_focusable_handler', () => {
  function createWindow() {
    return {
      isDestroyed: jest.fn().mockReturnValue(false),
      setFocusable: jest.fn(),
    };
  }

  test('returns unavailable when no overlay windows exist', () => {
    const result = handleSetOverlayFocusable({ focusable: false }, {
      chatWindow: null,
      responseWindow: null,
      contextLabelWindow: null,
    });

    expect(result).toEqual({ success: false, reason: 'Overlay windows not available' });
  });

  test('updates focusable state for all available windows', () => {
    const chatWindow = createWindow();
    const responseWindow = createWindow();
    const contextLabelWindow = createWindow();

    const result = handleSetOverlayFocusable({ focusable: false }, {
      chatWindow,
      responseWindow,
      contextLabelWindow,
    });

    expect(result).toEqual({ success: true });
    expect(chatWindow.setFocusable).toHaveBeenCalledWith(false);
    expect(responseWindow.setFocusable).toHaveBeenCalledWith(false);
    expect(contextLabelWindow.setFocusable).toHaveBeenCalledWith(false);
  });

  test('skips destroyed windows and windows without setFocusable', () => {
    const destroyed = {
      isDestroyed: jest.fn().mockReturnValue(true),
      setFocusable: jest.fn(),
    };
    const live = createWindow();
    const noSupport = {
      isDestroyed: jest.fn().mockReturnValue(false),
    };

    const result = handleSetOverlayFocusable({ focusable: true }, {
      chatWindow: destroyed,
      responseWindow: live,
      contextLabelWindow: noSupport,
    });

    expect(result).toEqual({ success: true });
    expect(destroyed.setFocusable).not.toHaveBeenCalled();
    expect(live.setFocusable).toHaveBeenCalledWith(true);
  });

  test('returns failure when focusable update throws', () => {
    const chatWindow = createWindow();
    chatWindow.setFocusable.mockImplementation(() => {
      throw new Error('cannot focus');
    });

    const result = handleSetOverlayFocusable({ focusable: true }, {
      chatWindow,
      responseWindow: null,
      contextLabelWindow: null,
    });

    expect(result).toEqual({
      success: false,
      reason: 'Failed to update focusable state: cannot focus',
    });
  });
});
