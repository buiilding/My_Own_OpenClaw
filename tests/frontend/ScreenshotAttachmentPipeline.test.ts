jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: jest.fn(),
  },
  INVOKE_CHANNELS: {
    EXECUTE_TOOL: 'execute-tool',
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/ArtifactUploader', () => ({
  uploadArtifactBase64: jest.fn(),
  buildArtifactUrl: (artifactId: string) => `http://127.0.0.1:8765/api/artifacts/${artifactId}`,
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/SurfaceOrchestrator', () => ({
  prepareExternalFocusForCapture: jest.fn().mockResolvedValue(undefined),
  prepareScreenshotCaptureVisibility: jest.fn().mockResolvedValue({
    prepared: false,
    captureId: 'capture-id',
  }),
  restoreScreenshotCaptureVisibility: jest.fn().mockResolvedValue(undefined),
}));

import {
  buildScreenshotRefs,
  captureScreenshotAttachment,
  createInlineScreenshotAttachment,
  extractScreenshotAttachment,
  materializeScreenshotAttachment,
  resolvePrimaryScreenshotAttachment,
} from '../../frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline';
import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { uploadArtifactBase64 } from '../../frontend/src/renderer/infrastructure/services/ArtifactUploader';

const mockInvoke = IpcBridge.invoke as jest.MockedFunction<typeof IpcBridge.invoke>;
const mockUploadArtifactBase64 = uploadArtifactBase64 as jest.MockedFunction<typeof uploadArtifactBase64>;

describe('ScreenshotAttachmentPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('extractScreenshotAttachment normalizes inline payloads and infers refs from urls', () => {
    expect(extractScreenshotAttachment({
      success: true,
      data: {
        screenshot: 'data:image/png;base64,inline-shot',
        screenshot_url: 'http://127.0.0.1:8765/api/artifacts/artifact-42',
        capture_meta: { source_w: 1920 },
      },
    } as any)).toEqual({
      screenshot: 'inline-shot',
      screenshotRef: 'artifact-42',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-42',
      screenshotContentType: 'image/png',
      captureMeta: { source_w: 1920 },
    });
  });

  test('captureScreenshotAttachment invokes screenshot tool and toggles capture event lifecycle', async () => {
    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        screenshot: 'shot',
        screenshot_content_type: 'image/jpeg',
      },
    } as any);

    const result = await captureScreenshotAttachment({
      waitSeconds: 0,
      isFirstUserMessage: true,
      correlationId: 'cap-1',
    });

    expect(mockInvoke).toHaveBeenCalledWith(INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'screenshot',
      args: {
        explanation: 'Initial user message screenshot',
        expectation: 'Current screen state',
      },
      skipAutoCapture: false,
    });
    expect(result).toEqual({
      screenshot: 'shot',
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: 'image/jpeg',
      captureMeta: null,
    });
    expect(dispatchSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'windie:screenshot-capture',
      detail: { active: true },
    }));
    expect(dispatchSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'windie:screenshot-capture',
      detail: { active: false },
    }));
  });

  test('materializeScreenshotAttachment uploads inline screenshots and preserves inline fallback on upload failure', async () => {
    const inlineAttachment = createInlineScreenshotAttachment({
      screenshot: 'data:image/webp;base64,YWJjZA==',
      screenshotContentType: null,
    });
    mockUploadArtifactBase64.mockResolvedValueOnce({
      artifactId: 'artifact-1',
      url: 'http://127.0.0.1:8765/api/artifacts/artifact-1',
      contentType: 'image/webp',
    } as any);

    await expect(materializeScreenshotAttachment(inlineAttachment, { filenameStem: 'capture' })).resolves.toEqual({
      screenshot: 'YWJjZA==',
      screenshotRef: 'artifact-1',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-1',
      screenshotContentType: 'image/webp',
      captureMeta: null,
    });

    mockUploadArtifactBase64.mockRejectedValueOnce(new Error('upload failed'));
    await expect(materializeScreenshotAttachment(inlineAttachment, { filenameStem: 'capture' })).resolves.toEqual({
      screenshot: 'YWJjZA==',
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: 'image/webp',
      captureMeta: null,
    });
  });

  test('resolvePrimaryScreenshotAttachment and buildScreenshotRefs prefer refs over urls and dedupe', () => {
    expect(resolvePrimaryScreenshotAttachment([
      { screenshotRef: null, screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-2' },
      { screenshotRef: 'artifact-1', screenshotUrl: '/api/artifacts/artifact-1' },
    ])).toEqual({
      screenshotRef: 'artifact-1',
      screenshotUrl: '/api/artifacts/artifact-1',
    });

    expect(buildScreenshotRefs([
      { screenshotRef: 'artifact-1' },
      { screenshotRef: 'artifact-1' },
      { screenshotRef: 'artifact-2' },
      { screenshotRef: null },
    ])).toEqual(['artifact-1', 'artifact-2']);
  });
});
