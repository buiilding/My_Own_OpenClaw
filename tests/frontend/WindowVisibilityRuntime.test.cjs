/** @jest-environment node */

const {
  showChatWindow,
} = require('../../frontend/src/main/window_visibility_runtime.cjs');

function createWindow({
  visible = false,
  destroyed = false,
} = {}) {
  return {
    isDestroyed: jest.fn(() => destroyed),
    isVisible: jest.fn(() => visible),
    show: jest.fn(),
    hide: jest.fn(),
    focus: jest.fn(),
    webContents: {
      send: jest.fn(),
    },
  };
}

describe('window_visibility_runtime showChatWindow', () => {
  test('captures previous external focus even when focus is false', () => {
    const chatWindow = createWindow({ visible: false });
    const externalFocusTracker = {
      capturePreviousExternalFocusedWindow: jest.fn(),
    };

    const result = showChatWindow(
      { focus: false },
      {
        chatWindow,
        externalFocusTracker,
        syncWakewordToggleForChatVisibility: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true });
    expect(externalFocusTracker.capturePreviousExternalFocusedWindow).toHaveBeenCalledTimes(1);
    expect(chatWindow.focus).not.toHaveBeenCalled();
    expect(chatWindow.webContents.send).not.toHaveBeenCalled();
  });

  test('still focuses and emits chatbox-focus when focus is true', () => {
    const chatWindow = createWindow({ visible: true });
    const externalFocusTracker = {
      capturePreviousExternalFocusedWindow: jest.fn(),
    };

    const result = showChatWindow(
      { focus: true },
      {
        chatWindow,
        externalFocusTracker,
        syncWakewordToggleForChatVisibility: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true });
    expect(externalFocusTracker.capturePreviousExternalFocusedWindow).toHaveBeenCalledTimes(1);
    expect(chatWindow.focus).toHaveBeenCalledTimes(1);
    expect(chatWindow.webContents.send).toHaveBeenCalledWith('chatbox-focus');
  });
});
