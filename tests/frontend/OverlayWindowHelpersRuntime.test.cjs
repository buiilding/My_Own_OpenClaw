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
      chatVisualAnchorHeight: 96,
    });

    runtime.getResponseWindowBounds(400, 200);

    const [firstCall] = getOverlayResponseWindowBounds.mock.calls[0] || [];
    expect(firstCall.width).toBe(400);
    expect(firstCall.height).toBe(200);
    expect(firstCall.gap).toBe(10);
    expect(firstCall.chatBounds).toEqual(
      expect.objectContaining({
        x: 200,
        y: 720,
        width: 520,
        height: 96,
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
      chatVisualAnchorHeight: 96,
    });

    const bounds = runtime.getContextLabelWindowBounds();

    expect(bounds).toEqual({ x: 111, y: 222, width: 280, height: 26 });
    const [firstCall] = getOverlayContextLabelWindowBounds.mock.calls[0] || [];
    expect(firstCall.chatBounds).toEqual(
      expect.objectContaining({
        x: 100,
        y: 700,
        width: 520,
        height: 96,
      }),
    );
  });

  test('passes configured response gap override for tighter chat/response spacing', () => {
    const chatWindow = {
      isDestroyed: jest.fn(() => false),
      getBounds: jest.fn(() => ({ x: 240, y: 700, width: 520, height: 116 })),
    };
    const getOverlayResponseWindowBounds = jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 }));

    const runtime = createOverlayWindowHelpersRuntime({
      screen: {},
      getChatWindow: () => chatWindow,
      getOverlayChatWindowBounds: jest.fn(),
      getOverlayResponseWindowBounds,
      getOverlayContextLabelWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      contextLabelWidth: 280,
      contextLabelHeight: 26,
      contextLabelOffsetX: 14,
      contextLabelGapAboveChatbox: -6,
      chatVisualAnchorHeight: 96,
      responseGap: 2,
    });

    runtime.getResponseWindowBounds(380, 140);

    expect(getOverlayResponseWindowBounds).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 380,
        height: 140,
        gap: 2,
      }),
    );
  });

  test('uses dynamic chat visual anchor height getter when provided', () => {
    const chatWindow = {
      isDestroyed: jest.fn(() => false),
      getBounds: jest.fn(() => ({ x: 220, y: 700, width: 520, height: 116 })),
    };
    const getOverlayResponseWindowBounds = jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 }));
    const getChatVisualAnchorHeight = jest.fn(() => 116);

    const runtime = createOverlayWindowHelpersRuntime({
      screen: {},
      getChatWindow: () => chatWindow,
      getOverlayChatWindowBounds: jest.fn(),
      getOverlayResponseWindowBounds,
      getOverlayContextLabelWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      contextLabelWidth: 280,
      contextLabelHeight: 26,
      contextLabelOffsetX: 14,
      contextLabelGapAboveChatbox: -6,
      chatVisualAnchorHeight: 96,
      getChatVisualAnchorHeight,
    });

    runtime.getResponseWindowBounds(380, 140);

    expect(getChatVisualAnchorHeight).toHaveBeenCalled();
    expect(getOverlayResponseWindowBounds).toHaveBeenCalledWith(
      expect.objectContaining({
        chatBounds: expect.objectContaining({
          x: 220,
          y: 700,
          height: 116,
        }),
      }),
    );
  });

  test('keeps chat window frame preallocated above compact and preview anchor heights', () => {
    let currentHeight = 220;
    const chatWindow = {
      isDestroyed: jest.fn(() => false),
      getSize: jest.fn(() => [520, currentHeight]),
      getBounds: jest.fn(() => ({ x: 300, y: 800, width: 520, height: currentHeight })),
      setBounds: jest.fn((bounds) => {
        currentHeight = bounds.height;
      }),
    };

    const runtime = createOverlayWindowHelpersRuntime({
      screen: {},
      getChatWindow: () => chatWindow,
      getOverlayChatWindowBounds: jest.fn(() => ({ x: 300, y: 800, width: 520, height: currentHeight })),
      getOverlayResponseWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      getOverlayContextLabelWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      contextLabelWidth: 280,
      contextLabelHeight: 26,
      contextLabelOffsetX: 14,
      contextLabelGapAboveChatbox: -6,
    });

    expect(runtime.resizeChatWindowForVisualAnchorHeight(96)).toBe(false);
    expect(runtime.resizeChatWindowForVisualAnchorHeight(148)).toBe(false);
    expect(chatWindow.setBounds).not.toHaveBeenCalled();
  });

  test('keeps compact fallback response height at 24px instead of inflating to 42px', () => {
    const responseWindow = {
      isDestroyed: jest.fn(() => false),
      getSize: jest.fn(() => [520, 1]),
      setBounds: jest.fn(),
    };
    const chatWindow = {
      isDestroyed: jest.fn(() => false),
      getSize: jest.fn(() => [520, 64]),
    };
    const getOverlayResponseWindowBounds = jest.fn((args) => ({
      x: 0,
      y: 0,
      width: args.width,
      height: args.height,
    }));

    const runtime = createOverlayWindowHelpersRuntime({
      screen: {},
      getChatWindow: () => chatWindow,
      getResponseWindow: () => responseWindow,
      getResponseOverlayVisible: () => true,
      getOverlayChatWindowBounds: jest.fn(),
      getOverlayResponseWindowBounds,
      getOverlayContextLabelWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      contextLabelWidth: 280,
      contextLabelHeight: 26,
      contextLabelOffsetX: 14,
      contextLabelGapAboveChatbox: -6,
    });

    runtime.ensureResponseOverlayFallbackBounds();

    expect(getOverlayResponseWindowBounds).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 520,
        height: 24,
      }),
    );
    expect(responseWindow.setBounds).toHaveBeenCalledWith(
      expect.objectContaining({ width: 520, height: 24 }),
      false,
    );
  });

  test('keeps manually dragged chat window position on subsequent reposition calls', () => {
    const chatWindow = {
      isDestroyed: jest.fn(() => false),
      getSize: jest.fn(() => [520, 116]),
      setPosition: jest.fn(),
    };
    const runtime = createOverlayWindowHelpersRuntime({
      screen: {},
      getChatWindow: () => chatWindow,
      getOverlayChatWindowBounds: jest.fn(({ targetX }) => ({
        x: Number.isFinite(targetX) ? targetX : 400,
        y: 500,
        width: 520,
        height: 116,
      })),
      getOverlayResponseWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      getOverlayContextLabelWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      contextLabelWidth: 280,
      contextLabelHeight: 26,
      contextLabelOffsetX: 14,
      contextLabelGapAboveChatbox: -6,
    });

    runtime.positionChatWindow();
    runtime.setManualChatWindowPosition({ x: 2100, y: 120 });
    runtime.positionChatWindow();

    expect(chatWindow.setPosition.mock.calls).toEqual([
      [400, 500, false],
      [2100, 120, false],
    ]);
  });

  test('keeps the dragged bottom edge fixed when the pill height grows', () => {
    let currentX = 2100;
    let currentY = 120;
    let currentHeight = 220;
    const chatWindow = {
      isDestroyed: jest.fn(() => false),
      getSize: jest.fn(() => [520, currentHeight]),
      getBounds: jest.fn(() => ({ x: currentX, y: currentY, width: 520, height: currentHeight })),
      setBounds: jest.fn((bounds) => {
        currentX = bounds.x;
        currentY = bounds.y;
        currentHeight = bounds.height;
      }),
      setPosition: jest.fn((x, y) => {
        currentX = x;
        currentY = y;
      }),
    };
    const runtime = createOverlayWindowHelpersRuntime({
      screen: {},
      getChatWindow: () => chatWindow,
      getOverlayChatWindowBounds: jest.fn(({ targetX }) => ({
        x: Number.isFinite(targetX) ? targetX : 400,
        y: 500,
        width: 520,
        height: currentHeight,
      })),
      getOverlayResponseWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      getOverlayContextLabelWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      contextLabelWidth: 280,
      contextLabelHeight: 26,
      contextLabelOffsetX: 14,
      contextLabelGapAboveChatbox: -6,
    });

    runtime.setManualChatWindowPosition({ x: 2100, y: 120 });
    runtime.positionChatWindow();
    runtime.setChatWindowBoundsForVisualAnchorHeight(140);

    expect(chatWindow.setPosition.mock.calls).toEqual([
      [2100, 120, false],
    ]);
    if (chatWindow.setBounds.mock.calls.length !== 0) {
      throw new Error(`Expected no setBounds calls, received ${chatWindow.setBounds.mock.calls.length}`);
    }
  });

  test('ignores manually dragged chat window position when monitor affinity changes', () => {
    const chatWindow = {
      isDestroyed: jest.fn(() => false),
      getSize: jest.fn(() => [520, 116]),
      setPosition: jest.fn(),
    };
    let activeDisplayAffinity = {
      monitor_id: '1',
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    };
    const getOverlayChatWindowBounds = jest.fn(({ displayAffinity, targetX }) => ({
      x: Number.isFinite(targetX) ? targetX : (displayAffinity?.workArea?.x === 1920 ? 2940 : 1020),
      y: 900,
      width: 520,
      height: 116,
    }));
    const runtime = createOverlayWindowHelpersRuntime({
      screen: {},
      getActiveDisplayAffinity: () => activeDisplayAffinity,
      getChatWindow: () => chatWindow,
      getOverlayChatWindowBounds,
      getOverlayResponseWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      getOverlayContextLabelWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      contextLabelWidth: 280,
      contextLabelHeight: 26,
      contextLabelOffsetX: 14,
      contextLabelGapAboveChatbox: -6,
    });

    runtime.positionChatWindow();
    runtime.setManualChatWindowPosition({ x: 1500, y: 140 });
    runtime.positionChatWindow();
    activeDisplayAffinity = {
      monitor_id: '2',
      workArea: { x: 1920, y: 0, width: 2560, height: 1440 },
    };
    runtime.positionChatWindow();

    expect(chatWindow.setPosition.mock.calls).toEqual([
      [1020, 900, false],
      [1500, 140, false],
      [2940, 900, false],
    ]);
    if (getOverlayChatWindowBounds.mock.calls.length !== 3) {
      throw new Error(`Expected 3 chat bound computations, received ${getOverlayChatWindowBounds.mock.calls.length}`);
    }
  });

  test('positions chat window on active display affinity when no manual position exists', () => {
    const chatWindow = {
      isDestroyed: jest.fn(() => false),
      getSize: jest.fn(() => [520, 116]),
      setPosition: jest.fn(),
    };
    const runtime = createOverlayWindowHelpersRuntime({
      screen: {
        getPrimaryDisplay: jest.fn(() => ({
          workArea: { x: 0, y: 0, width: 1920, height: 1080 },
        })),
      },
      getActiveDisplayAffinity: () => ({
        monitor_id: '2',
        workArea: { x: 1920, y: 40, width: 2560, height: 1400 },
      }),
      getChatWindow: () => chatWindow,
      getOverlayChatWindowBounds: jest.requireActual('../../frontend/src/main/overlay_bounds.cjs').getChatWindowBounds,
      getOverlayResponseWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      getOverlayContextLabelWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      contextLabelWidth: 280,
      contextLabelHeight: 26,
      contextLabelOffsetX: 14,
      contextLabelGapAboveChatbox: -6,
    });

    runtime.positionChatWindow();

    expect(chatWindow.setPosition.mock.calls).toEqual([[2940, 1300, false]]);
  });

  test('re-promotes chat overlay with mac level fallback and moveTop', () => {
    const chatWindow = {
      isDestroyed: jest.fn(() => false),
      setAlwaysOnTop: jest.fn()
        .mockImplementationOnce(() => {
          throw new Error('unsupported');
        })
        .mockImplementationOnce(() => {}),
      moveTop: jest.fn(),
    };

    const runtime = createOverlayWindowHelpersRuntime({
      screen: {},
      platform: 'darwin',
      getChatWindow: () => chatWindow,
      getOverlayChatWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 520, height: 116 })),
      getOverlayResponseWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      getOverlayContextLabelWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      contextLabelWidth: 280,
      contextLabelHeight: 26,
      contextLabelOffsetX: 14,
      contextLabelGapAboveChatbox: -6,
      warn: jest.fn(),
    });

    runtime.ensureChatWindowOnTop();

    expect(chatWindow.setAlwaysOnTop).toHaveBeenNthCalledWith(1, true, 'screen-saver');
    expect(chatWindow.setAlwaysOnTop).toHaveBeenNthCalledWith(2, true, 'floating');
    expect(chatWindow.moveTop).toHaveBeenCalledTimes(1);
  });
});
