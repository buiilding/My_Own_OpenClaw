import { resolveToolExecutionScreenshotSelection } from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionScreenshotSelection';

describe('ToolExecutionScreenshotSelection', () => {
  test('prefers capture screenshot over tool-result image payload', () => {
    const selection = resolveToolExecutionScreenshotSelection(
      'mouse_control',
      'data:image/jpeg;base64,Y2FwdHVyZQ==',
      null,
      {
        success: true,
        data: {
          image_data: 'data:image/webp;base64,dG9vbA==',
          screenshot_ref: 'artifact-sidecar',
          screenshot_url: 'http://localhost/artifacts/artifact-sidecar',
        },
      },
    );

    expect(selection).toEqual(expect.objectContaining({
      screenshot: 'Y2FwdHVyZQ==',
      screenshotContentType: 'image/jpeg',
      uploadFilename: 'mouse_control-screenshot.jpg',
      uploadContentType: 'image/jpeg',
      preUploadedScreenshot: {
        screenshotRef: 'artifact-sidecar',
        screenshotUrl: 'http://localhost/artifacts/artifact-sidecar',
      },
    }));
  });

  test('falls back to tool-result image payload when capture image is absent', () => {
    const selection = resolveToolExecutionScreenshotSelection(
      'read_file',
      null,
      null,
      {
        success: true,
        data: {
          image_data: 'data:image/webp;base64,YWJjZA==',
        },
      },
    );

    expect(selection.screenshot).toBe('YWJjZA==');
    expect(selection.screenshotContentType).toBe('image/webp');
    expect(selection.uploadFilename).toBe('read_file-screenshot.webp');
    expect(selection.uploadContentType).toBe('image/webp');
  });

  test('returns null screenshot while preserving pre-uploaded screenshot reference', () => {
    const selection = resolveToolExecutionScreenshotSelection(
      'screenshot',
      null,
      null,
      {
        success: true,
        data: {
          screenshot_ref: 'artifact-1',
          screenshot_url: 'http://localhost/artifacts/artifact-1',
        },
      },
    );

    expect(selection.screenshot).toBeNull();
    expect(selection.uploadFilename).toBeNull();
    expect(selection.uploadContentType).toBe('image/jpeg');
    expect(selection.preUploadedScreenshot).toEqual({
      screenshotRef: 'artifact-1',
      screenshotUrl: 'http://localhost/artifacts/artifact-1',
    });
  });
});
