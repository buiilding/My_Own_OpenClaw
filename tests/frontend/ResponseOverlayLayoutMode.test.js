import {
  RESPONSE_OVERLAY_LAYOUT_MODE,
  resolveResponseOverlayLayoutMode,
} from '../../frontend/src/renderer/features/chat/utils/overlay/responseOverlayLayoutMode';

describe('responseOverlayLayoutMode', () => {
  test('resolves response mode when response content is visible', () => {
    expect(resolveResponseOverlayLayoutMode({
      showResponse: true,
      showAwaitingReply: true,
    })).toBe(RESPONSE_OVERLAY_LAYOUT_MODE.RESPONSE);
  });

  test('resolves hidden mode when no overlay content is visible', () => {
    expect(resolveResponseOverlayLayoutMode({
      showResponse: false,
    })).toBe(RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN);
  });

  test('keeps awaiting-only states hidden until real response content exists', () => {
    expect(resolveResponseOverlayLayoutMode({
      showResponse: false,
    })).toBe(RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN);
  });
});
