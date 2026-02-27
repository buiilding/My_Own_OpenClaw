/** @jest-environment node */

const {
  initializeOverlayHandlersRuntime,
} = require('../../frontend/src/main/overlay_ipc_runtime.cjs');

describe('overlay_ipc_runtime prepare-overlay-tool-focus handler', () => {
  function createRuntime(overrides = {}) {
    const invokeHandlers = {};
    const eventHandlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        invokeHandlers[channel] = handler;
      }),
      on: jest.fn((channel, handler) => {
        eventHandlers[channel] = handler;
      }),
    };

    initializeOverlayHandlersRuntime({
      ipcMain,
      screen: {},
      shell: {},
      systemPreferences: {},
      platform: 'win32',
      getWindows: () => ({}),
      getChatWindowBounds: jest.fn(),
      positionResponseWindow: jest.fn(),
      positionContextLabelWindow: jest.fn(),
      syncContextLabelWindowVisibility: jest.fn(),
      getResponseWindowBounds: jest.fn(),
      setResponseOverlayVisibilityState: jest.fn(),
      showResponseWindowWhenChatVisible: jest.fn(),
      showMainWindow: jest.fn(),
      showChatWindow: jest.fn(),
      hideChatWindow: jest.fn(),
      normalizeMainWindowOpenTarget: jest.fn(),
      emitMainWindowOpenTarget: jest.fn(),
      warn: jest.fn(),
      ...overrides,
    });

    return {
      invokeHandlers,
      eventHandlers,
    };
  }

  test('forwards waitMs to overlay focus preparation and returns payload', async () => {
    const prepareOverlayToolFocus = jest.fn().mockResolvedValue({
      restoredExternalFocus: true,
      externalFocusActive: true,
    });
    const { invokeHandlers } = createRuntime({ prepareOverlayToolFocus });

    const result = await invokeHandlers['prepare-overlay-tool-focus'](null, { waitMs: 260 });

    expect(prepareOverlayToolFocus).toHaveBeenCalledWith({ waitMs: 260 });
    expect(result).toEqual({
      success: true,
      data: {
        restoredExternalFocus: true,
        externalFocusActive: true,
      },
    });
  });

  test('uses default wait duration when none is provided', async () => {
    const prepareOverlayToolFocus = jest.fn().mockResolvedValue(null);
    const { invokeHandlers } = createRuntime({ prepareOverlayToolFocus });

    await invokeHandlers['prepare-overlay-tool-focus'](null, {});

    expect(prepareOverlayToolFocus).toHaveBeenCalledWith({ waitMs: 180 });
  });

  test('returns unavailable error when focus preparation is not wired', async () => {
    const { invokeHandlers } = createRuntime({ prepareOverlayToolFocus: undefined });

    const result = await invokeHandlers['prepare-overlay-tool-focus'](null, {});

    expect(result).toEqual({ success: false, reason: 'Overlay focus preparation unavailable' });
  });

  test('returns failure when focus preparation throws', async () => {
    const prepareOverlayToolFocus = jest.fn().mockRejectedValue(new Error('focus boom'));
    const { invokeHandlers } = createRuntime({ prepareOverlayToolFocus });

    const result = await invokeHandlers['prepare-overlay-tool-focus'](null, { waitMs: 10 });

    expect(result).toEqual({
      success: false,
      reason: 'Failed to prepare overlay tool focus: focus boom',
    });
  });

  test('does not register deprecated chatbox resize invoke channel', () => {
    const { invokeHandlers } = createRuntime();

    expect(invokeHandlers['set-chatbox-size']).toBeUndefined();
    expect(typeof invokeHandlers['set-responsebox-size']).toBe('function');
  });
});
