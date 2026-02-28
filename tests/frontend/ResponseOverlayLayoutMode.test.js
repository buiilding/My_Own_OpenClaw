import {
  isCompactHoverLayoutMode,
  RESPONSE_OVERLAY_LAYOUT_MODE,
  resolveResponseOverlayLayoutMode,
} from '../../frontend/src/renderer/features/chat/utils/responseOverlayLayoutMode';

describe('responseOverlayLayoutMode', () => {
  test('resolves response mode when response content is visible', () => {
    expect(resolveResponseOverlayLayoutMode({
      showResponse: true,
      showAwaitingReply: true,
      thinkingText: 'thinking',
    })).toBe(RESPONSE_OVERLAY_LAYOUT_MODE.RESPONSE);
  });

  test('resolves hidden mode when no overlay content is visible', () => {
    expect(resolveResponseOverlayLayoutMode({
      showResponse: false,
      showAwaitingReply: false,
      thinkingText: '',
    })).toBe(RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN);
  });

  test('resolves awaiting-thinking mode when awaiting with non-empty thinking text', () => {
    expect(resolveResponseOverlayLayoutMode({
      showResponse: false,
      showAwaitingReply: true,
      thinkingText: 'step 1',
    })).toBe(RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_THINKING);
  });

  test('resolves awaiting-typing mode when awaiting without thinking text', () => {
    expect(resolveResponseOverlayLayoutMode({
      showResponse: false,
      showAwaitingReply: true,
      thinkingText: '   ',
    })).toBe(RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_TYPING);
  });

  test('compact hover applies only to awaiting modes', () => {
    expect(isCompactHoverLayoutMode(RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN)).toBe(false);
    expect(isCompactHoverLayoutMode(RESPONSE_OVERLAY_LAYOUT_MODE.RESPONSE)).toBe(false);
    expect(isCompactHoverLayoutMode(RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_TYPING)).toBe(true);
    expect(isCompactHoverLayoutMode(RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_THINKING)).toBe(true);
  });
});
