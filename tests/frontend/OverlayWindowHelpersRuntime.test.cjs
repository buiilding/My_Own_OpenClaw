/** @jest-environment node */

const { createOverlayWindowHelpersRuntime } = require('../../frontend/src/main/overlay_window_helpers_runtime.cjs');

describe('overlay_window_helpers_runtime', () => {
  test('applies compact visual anchor offset when computing response bounds', () => {
    const chatWindow = {
      isDestroyed: jest.fn(() => false),
      getBounds: jest.fn(() => ({ x: 200, y: 700, width: 520, height: 116 })),
    };
    const getOverlayResponseWindowBounds = jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 }));
    const getOverlayContextLabelWindowBounds = jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 }));

    const runtime = createOverlayWindowHelpersRuntime({
      screen: {},
      getChatWindow: () => chatWindow,
      getOverlayChatWindowBounds: jest.fn(),
      getOverlayResponseWindowBounds,
      getOverlayContextLabelWindowBounds,
      contextLabelWidth: 280,
      contextLabelHeight: 26,
      contextLabelOffsetX: 14,
      contextLabelGapAboveChatbox: -6,
      chatVisualAnchorHeight: 64,
    });

    runtime.getResponseWindowBounds(400, 200);

    expect(getOverlayResponseWindowBounds).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 400,
        height: 200,
        chatBounds: expect.objectContaining({
          x: 200,
          width: 520,
          height: 64,
          y: 752,
        }),
      }),
    );
  });

  test('applies compact visual anchor offset when computing context label bounds', () => {
    const chatWindow = {
      isDestroyed: jest.fn(() => false),
      getBounds: jest.fn(() => ({ x: 100, y: 680, width: 520, height: 116 })),
    };
    const getOverlayResponseWindowBounds = jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 }));
    const getOverlayContextLabelWindowBounds = jest.fn(() => ({ x: 111, y: 222, width: 280, height: 26 }));

    const runtime = createOverlayWindowHelpersRuntime({
      screen: {},
      getChatWindow: () => chatWindow,
      getOverlayChatWindowBounds: jest.fn(),
      getOverlayResponseWindowBounds,
      getOverlayContextLabelWindowBounds,
      contextLabelWidth: 280,
      contextLabelHeight: 26,
      contextLabelOffsetX: 14,
      contextLabelGapAboveChatbox: -6,
      chatVisualAnchorHeight: 64,
    });

    const bounds = runtime.getContextLabelWindowBounds();

    expect(bounds).toEqual({ x: 111, y: 222, width: 280, height: 26 });
    expect(getOverlayContextLabelWindowBounds).toHaveBeenCalledWith(
      expect.objectContaining({
        chatBounds: expect.objectContaining({
          x: 100,
          width: 520,
          height: 64,
          y: 732,
        }),
      }),
    );
  });
});
