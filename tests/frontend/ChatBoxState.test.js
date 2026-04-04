import {
  CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT,
  createClipboardScreenshotImage,
  isDragBlockedTarget,
  resolveChatboxVisualAnchorHeight,
} from '../../frontend/src/renderer/features/chat/utils/state/chatBoxState';

describe('chatBoxState', () => {
  test('isDragBlockedTarget matches interactive controls and ignores non-elements', () => {
    const button = document.createElement('button');
    const wrapper = document.createElement('div');
    wrapper.appendChild(button);

    const plainDiv = document.createElement('div');

    expect(isDragBlockedTarget(button)).toBe(true);
    expect(isDragBlockedTarget(plainDiv)).toBe(false);
    expect(isDragBlockedTarget(null)).toBe(false);
  });

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

  test('createClipboardScreenshotImage builds deterministic screenshot attachment payload', () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
    const image = createClipboardScreenshotImage({
      screenshot: 'YmFzZTY0',
      contentType: 'image/png',
      extension: 'png',
      now: 1700000000000,
    });

    expect(image).toEqual({
      id: '1700000000000-4fzzzxjy',
      base64: 'YmFzZTY0',
      contentType: 'image/png',
      filename: 'screenshot-1700000000000.png',
      previewUrl: 'data:image/png;base64,YmFzZTY0',
    });

    randomSpy.mockRestore();
  });
});
