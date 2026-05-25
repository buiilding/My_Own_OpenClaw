/** @jest-environment node */

const {
  handleSetChatboxVisualAnchorHeight,
} = require('../../frontend/src/main/overlay_chatbox_visual_anchor_handler.cjs');

describe('overlay_chatbox_visual_anchor_handler', () => {
  test('updates chat window bounds before repositioning dependent windows', () => {
    const setChatVisualAnchorHeight = jest.fn(() => true);
    const setChatWindowBoundsForVisualAnchorHeight = jest.fn(() => false);
    const resizeChatWindowForVisualAnchorHeight = jest.fn(() => false);
    const positionResponseWindow = jest.fn();
    const positionContextLabelWindow = jest.fn();

    const result = handleSetChatboxVisualAnchorHeight(
      { height: 116 },
      {
        setChatVisualAnchorHeight,
        setChatWindowBoundsForVisualAnchorHeight,
        resizeChatWindowForVisualAnchorHeight,
        positionResponseWindow,
        positionContextLabelWindow,
        syncContextLabelWindowVisibility: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true, height: 116, changed: true });
    expect(setChatVisualAnchorHeight).toHaveBeenCalledWith(116);
    expect(setChatWindowBoundsForVisualAnchorHeight).toHaveBeenCalledWith(116);
    expect(resizeChatWindowForVisualAnchorHeight).toHaveBeenCalledWith(116);
    expect(
      setChatWindowBoundsForVisualAnchorHeight.mock.invocationCallOrder[0],
    ).toBeLessThan(positionResponseWindow.mock.invocationCallOrder[0]);
    expect(
      resizeChatWindowForVisualAnchorHeight.mock.invocationCallOrder[0],
    ).toBeLessThan(positionContextLabelWindow.mock.invocationCallOrder[0]);
  });

  test('does not reposition when the visual anchor height is unchanged', () => {
    const setChatWindowBoundsForVisualAnchorHeight = jest.fn();
    const positionResponseWindow = jest.fn();

    const result = handleSetChatboxVisualAnchorHeight(
      { height: 116 },
      {
        setChatVisualAnchorHeight: jest.fn(() => false),
        setChatWindowBoundsForVisualAnchorHeight,
        positionResponseWindow,
        syncContextLabelWindowVisibility: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true, height: 116, changed: false });
    expect(setChatWindowBoundsForVisualAnchorHeight).not.toHaveBeenCalled();
    expect(positionResponseWindow).not.toHaveBeenCalled();
  });
});
