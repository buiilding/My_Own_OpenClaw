jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: jest.fn(),
  },
  INVOKE_CHANNELS: {
    CAPTURE_SCREENSHOT_ATTACHMENT: 'capture-screenshot-attachment',
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
import { restoreScreenshotCaptureVisibility } from '../../frontend/src/renderer/infrastructure/services/SurfaceOrchestrator';

const mockInvoke = IpcBridge.invoke as jest.MockedFunction<typeof IpcBridge.invoke>;
const mockUploadArtifactBase64 = uploadArtifactBase64 as jest.MockedFunction<typeof uploadArtifactBase64>;
const mockRestoreScreenshotCaptureVisibility = restoreScreenshotCaptureVisibility as jest.MockedFunction<typeof restoreScreenshotCaptureVisibility>;

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

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

    expect(mockInvoke).toHaveBeenCalledWith(INVOKE_CHANNELS.CAPTURE_SCREENSHOT_ATTACHMENT, {
      args: {
        explanation: 'Initial user message screenshot',
        expectation: 'Current screen state',
      },
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
      detail: expect.objectContaining({ active: true, activeCount: 1 }),
    }));
    expect(dispatchSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'windie:screenshot-capture',
      detail: expect.objectContaining({ active: false, activeCount: 0 }),
    }));
  });

  test('captureScreenshotAttachment keeps capture event active until overlapping captures finish', async () => {
    const captureEvents: Array<{ active: boolean; activeCount: number }> = [];
    const listener = (event: Event) => {
      captureEvents.push((event as CustomEvent).detail);
    };
    window.addEventListener('windie:screenshot-capture', listener);
    const firstCapture = deferred<any>();
    const secondCapture = deferred<any>();
    mockInvoke
      .mockReturnValueOnce(firstCapture.promise)
      .mockReturnValueOnce(secondCapture.promise);

    try {
      const firstResult = captureScreenshotAttachment({ correlationId: 'cap-1' });
      const secondResult = captureScreenshotAttachment({ correlationId: 'cap-2' });

      await Promise.resolve();
      expect(captureEvents).toEqual([
        { active: true, activeCount: 1 },
        { active: true, activeCount: 2 },
      ]);

      firstCapture.resolve({
        success: true,
        data: { screenshot: 'first-shot', screenshot_content_type: 'image/png' },
      });
      await expect(firstResult).resolves.toEqual(expect.objectContaining({
        screenshot: 'first-shot',
      }));
      expect(captureEvents).toEqual([
        { active: true, activeCount: 1 },
        { active: true, activeCount: 2 },
      ]);

      secondCapture.resolve({
        success: true,
        data: { screenshot: 'second-shot', screenshot_content_type: 'image/png' },
      });
      await expect(secondResult).resolves.toEqual(expect.objectContaining({
        screenshot: 'second-shot',
      }));
      expect(captureEvents).toEqual([
        { active: true, activeCount: 1 },
        { active: true, activeCount: 2 },
        { active: false, activeCount: 0 },
      ]);
    } finally {
      window.removeEventListener('windie:screenshot-capture', listener);
    }
  });

  test('captureScreenshotAttachment clears active state when visibility restore fails', async () => {
    const captureEvents: Array<{ active: boolean; activeCount: number }> = [];
    const listener = (event: Event) => {
      captureEvents.push((event as CustomEvent).detail);
    };
    window.addEventListener('windie:screenshot-capture', listener);
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        screenshot: 'shot',
        screenshot_content_type: 'image/png',
      },
    } as any);
    mockRestoreScreenshotCaptureVisibility.mockRejectedValueOnce(new Error('restore failed'));

    try {
      await expect(captureScreenshotAttachment({ correlationId: 'cap-restore' })).resolves.toEqual({
        screenshot: 'shot',
        screenshotRef: null,
        screenshotUrl: null,
        screenshotContentType: 'image/png',
        captureMeta: null,
      });

      expect(captureEvents).toEqual([
        { active: true, activeCount: 1 },
        { active: false, activeCount: 0 },
      ]);
      expect(console.warn).toHaveBeenCalledWith(
        '[captureScreenshotAttachment] Failed to restore screenshot capture visibility:',
        expect.any(Error),
      );
    } finally {
      window.removeEventListener('windie:screenshot-capture', listener);
    }
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
