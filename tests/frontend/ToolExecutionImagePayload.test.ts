import {
  extractToolResultImage,
  extractToolResultScreenshotRef,
  parseImagePayload,
} from '../../frontend/src/renderer/infrastructure/services/ToolExecutionImagePayload';

describe('ToolExecutionImagePayload', () => {
  test('parseImagePayload parses data URL image payload', () => {
    const parsed = parseImagePayload('data:image/png;base64,  YWJjZA==  ');

    expect(parsed).toEqual({
      base64: 'YWJjZA==',
      contentType: 'image/png',
    });
  });

  test('parseImagePayload ignores artifact/http screenshot references', () => {
    expect(parseImagePayload('artifact://abc')).toBeNull();
    expect(parseImagePayload('http://example.com/shot.png')).toBeNull();
    expect(parseImagePayload('https://example.com/shot.png')).toBeNull();
  });

  test('extractToolResultImage prefers explicit screenshot content type when valid', () => {
    const parsed = extractToolResultImage({
      success: true,
      data: {
        screenshot: 'YWJjZA==',
        screenshot_content_type: 'image/webp',
      },
    });

    expect(parsed).toEqual({
      base64: 'YWJjZA==',
      contentType: 'image/webp',
    });
  });

  test('extractToolResultImage falls back to parsed data-url content type', () => {
    const parsed = extractToolResultImage({
      success: true,
      data: {
        image_data: 'data:image/jpeg;base64,MTIzNA==',
        image_content_type: 'application/octet-stream',
      },
    });

    expect(parsed).toEqual({
      base64: 'MTIzNA==',
      contentType: 'image/jpeg',
    });
  });

  test('extractToolResultScreenshotRef returns null when no ref/url exist', () => {
    expect(extractToolResultScreenshotRef({ success: true, data: { output: 'ok' } })).toBeNull();
  });

  test('extractToolResultScreenshotRef trims and returns screenshot references', () => {
    const parsed = extractToolResultScreenshotRef({
      success: true,
      data: {
        screenshot_ref: '  artifact-123  ',
        screenshot_url: '  http://localhost/artifact-123  ',
      },
    });

    expect(parsed).toEqual({
      screenshotRef: 'artifact-123',
      screenshotUrl: 'http://localhost/artifact-123',
    });
  });
});
