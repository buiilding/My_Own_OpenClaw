/** @jest-environment node */

const {
  handleHideChatbox,
  handlePrepareChatboxForScreenshot,
  handleShowChatbox,
  handleShowMainWindow,
} = require('../../frontend/src/main/overlay_visibility_handler.cjs');

describe('overlay_visibility_handler', () => {
  test('show-main-window uses focus true by default and returns result', () => {
    const showMainWindow = jest.fn().mockReturnValue({ success: true });
    const resolveTargetDisplayAffinity = jest.fn().mockReturnValue(null);

    const result = handleShowMainWindow(undefined, {
      showMainWindow,
      resolveTargetDisplayAffinity,
    });

    expect(result).toEqual({ success: true });
    expect(showMainWindow).toHaveBeenCalledWith({
      focus: true,
      maximize: false,
      targetDisplayAffinity: null,
    });
  });

  test('show-main-window passes maximize true when requested', () => {
    const showMainWindow = jest.fn().mockReturnValue({ success: true });
    const resolveTargetDisplayAffinity = jest.fn().mockReturnValue({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    });

    const result = handleShowMainWindow({ maximize: true }, {
      showMainWindow,
      resolveTargetDisplayAffinity,
    });

    expect(result).toEqual({ success: true });
    expect(showMainWindow).toHaveBeenCalledWith({
      focus: true,
      maximize: true,
      targetDisplayAffinity: {
        monitor_id: '2',
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      },
    });
  });

  test('show-main-window returns formatted error result on exception', () => {
    const showMainWindow = jest.fn(() => {
      throw new Error('explode');
    });

    const result = handleShowMainWindow(undefined, { showMainWindow });

    expect(result).toEqual({
      success: false,
      reason: 'Failed to show main window: explode',
    });
  });

  test('show-chatbox defaults focus to true', () => {
    const showChatWindow = jest.fn().mockReturnValue({ success: true, visible: true });

    const result = handleShowChatbox(undefined, { showChatWindow });

    expect(result).toEqual({ success: true, visible: true });
    expect(showChatWindow).toHaveBeenCalledWith({ focus: true });
  });

  test('show-chatbox passes explicit focus false', () => {
    const showChatWindow = jest.fn().mockReturnValue({ success: true, visible: true });

    const result = handleShowChatbox({ focus: false }, { showChatWindow });

    expect(result).toEqual({ success: true, visible: true });
    expect(showChatWindow).toHaveBeenCalledWith({ focus: false });
  });

  test('hide-chatbox delegates return value', () => {
    const hideChatWindow = jest.fn().mockReturnValue({ success: true, hidden: true });

    const result = handleHideChatbox({ hideChatWindow });

    expect(result).toEqual({ success: true, hidden: true });
    expect(hideChatWindow).toHaveBeenCalledTimes(1);
  });

  test('prepare-chatbox-for-screenshot hides then waits in main process', async () => {
    const hideChatWindow = jest.fn().mockReturnValue({ success: true, hidden: true });
    const waitInMain = jest.fn().mockResolvedValue(undefined);

    const result = await handlePrepareChatboxForScreenshot(
      { waitMs: 2000, settleMs: 120 },
      { hideChatWindow, waitInMain },
    );

    expect(result).toEqual({
      success: true,
      hidden: true,
      hideChatbox: true,
      waitMs: 2000,
      settleMs: 120,
      waitTime: expect.any(Number),
      hideInvokeTime: expect.any(Number),
      settleTime: expect.any(Number),
    });
    expect(hideChatWindow).toHaveBeenCalledTimes(1);
    expect(waitInMain).toHaveBeenNthCalledWith(1, 2000);
    expect(waitInMain).toHaveBeenNthCalledWith(2, 120);
  });

  test('prepare-chatbox-for-screenshot returns hide failure without waiting', async () => {
    const hideChatWindow = jest.fn().mockReturnValue({ success: false, reason: 'Chat window not available' });
    const waitInMain = jest.fn().mockResolvedValue(undefined);

    const result = await handlePrepareChatboxForScreenshot(
      { waitMs: 2000, settleMs: 120 },
      { hideChatWindow, waitInMain },
    );

    expect(result).toEqual({ success: false, reason: 'Chat window not available' });
    expect(waitInMain).toHaveBeenCalledTimes(1);
    expect(waitInMain).toHaveBeenCalledWith(2000);
  });
});
