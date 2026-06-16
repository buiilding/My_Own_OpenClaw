/**
 * Covers chat box state. behavior in the frontend test suite.
 */

import {
  CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT,
  resolveChatboxVisualAnchorHeight,
} from '../../frontend/src/renderer/features/chat/utils/state/chatBoxState';

describe('chatBoxState', () => {
  test('resolveChatboxVisualAnchorHeight switches by preview mode', () => {
    expect(resolveChatboxVisualAnchorHeight({ hasImagePreview: false })).toBe(CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT);
    expect(resolveChatboxVisualAnchorHeight({ hasImagePreview: true })).toBe(116);
  });

  test('resolveChatboxVisualAnchorHeight derives anchor height from measured shell height', () => {
    expect(resolveChatboxVisualAnchorHeight({
      hasImagePreview: false,
      shellHeight: 94,
    })).toBe(88);
  });
});
