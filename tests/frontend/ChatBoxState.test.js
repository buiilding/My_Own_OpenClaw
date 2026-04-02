import {
  CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT,
  resolveChatboxVisualAnchorHeight,
} from '../../frontend/src/renderer/features/chat/utils/state/chatBoxState';

describe('chatBoxState', () => {
  test('resolveChatboxVisualAnchorHeight keeps a compact minimum and adds wrapper padding', () => {
    expect(resolveChatboxVisualAnchorHeight(0)).toBe(CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT);
    expect(resolveChatboxVisualAnchorHeight(56)).toBe(CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT);
    expect(resolveChatboxVisualAnchorHeight(120)).toBe(128);
  });
});
