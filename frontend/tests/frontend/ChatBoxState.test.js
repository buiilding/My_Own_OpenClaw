/**
 * Covers chatbox layout runtime behavior in the frontend test suite.
 */

import { DesktopChatboxLayoutRuntime } from '../../src/renderer/app/runtime/desktopChatboxLayoutRuntime';

describe('desktopChatboxLayoutRuntime', () => {
  const {
    resolveChatboxNativeFrameHeight,
    resolveChatboxVisualAnchorHeight,
  } = DesktopChatboxLayoutRuntime;

  test('resolveChatboxVisualAnchorHeight switches by preview mode', () => {
    expect(resolveChatboxVisualAnchorHeight({ hasImagePreview: false })).toBe(64);
    expect(resolveChatboxVisualAnchorHeight({ hasImagePreview: true })).toBe(116);
  });

  test('resolveChatboxVisualAnchorHeight derives anchor height from measured shell height', () => {
    expect(resolveChatboxVisualAnchorHeight({
      hasImagePreview: false,
      shellHeight: 94,
    })).toBe(88);
  });

  test('resolveChatboxNativeFrameHeight includes the host window frame padding', () => {
    expect(resolveChatboxNativeFrameHeight({
      hasImagePreview: false,
      shellHeight: 94,
    })).toBe(94);
    expect(resolveChatboxNativeFrameHeight({ hasImagePreview: false })).toBe(70);
  });
});
