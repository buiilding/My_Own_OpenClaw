import { resolveQueryScreenshotArtifacts } from '../../frontend/src/renderer/features/chat/utils/messageSender/queryScreenshotPipeline';
import { extractOSstate } from '../../frontend/src/renderer/infrastructure/services/SystemCapture';
import { uploadArtifactBase64 } from '../../frontend/src/renderer/infrastructure/services/ArtifactUploader';

jest.mock('../../frontend/src/renderer/infrastructure/services/SystemCapture', () => ({
  extractOSstate: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/ArtifactUploader', () => ({
  uploadArtifactBase64: jest.fn(),
}));

const mockExtractOSstate = extractOSstate as jest.MockedFunction<typeof extractOSstate>;
const mockUploadArtifactBase64 = uploadArtifactBase64 as jest.MockedFunction<typeof uploadArtifactBase64>;

describe('queryScreenshotPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uploads clipboard screenshots and returns all screenshot refs', async () => {
    mockUploadArtifactBase64
      .mockResolvedValueOnce({ artifactId: 'artifact-1', url: '/api/artifacts/artifact-1' } as any)
      .mockResolvedValueOnce({ artifactId: 'artifact-2', url: '/api/artifacts/artifact-2' } as any);

    const result = await resolveQueryScreenshotArtifacts({
      clipboardImages: [
        { base64: 'img-1', contentType: 'image/png', filename: 'one.png' },
        { base64: 'img-2', contentType: 'image/jpeg', filename: 'two.jpg' },
      ],
      shouldCaptureQueryScreenshot: true,
      isFirstUserMessage: false,
    });

    expect(mockExtractOSstate).not.toHaveBeenCalled();
    expect(mockUploadArtifactBase64).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      captureMeta: null,
      uploadedScreenshotEntries: [
        {
          screenshot: 'img-1',
          screenshotContentType: 'image/png',
          screenshotRef: 'artifact-1',
          screenshotUrl: '/api/artifacts/artifact-1',
        },
        {
          screenshot: 'img-2',
          screenshotContentType: 'image/jpeg',
          screenshotRef: 'artifact-2',
          screenshotUrl: '/api/artifacts/artifact-2',
        },
      ],
      screenshotRef: 'artifact-1',
      screenshotUrl: '/api/artifacts/artifact-1',
      screenshotRefs: ['artifact-1', 'artifact-2'],
    });
  });

  test('reuses auto-captured artifact refs when screenshot bytes are absent', async () => {
    mockExtractOSstate.mockResolvedValue({
      systemState: null,
      screenshot: null,
      screenshotRef: 'artifact-auto-1',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-auto-1',
      screenshotContentType: null,
      captureMeta: { source_w: 1920 },
    });

    const result = await resolveQueryScreenshotArtifacts({
      clipboardImages: [],
      shouldCaptureQueryScreenshot: true,
      isFirstUserMessage: true,
    });

    expect(mockExtractOSstate).toHaveBeenCalledWith(true, false, 0, true);
    expect(mockUploadArtifactBase64).not.toHaveBeenCalled();
    expect(result).toEqual({
      captureMeta: { source_w: 1920 },
      uploadedScreenshotEntries: [],
      screenshotRef: 'artifact-auto-1',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-auto-1',
      screenshotRefs: ['artifact-auto-1'],
    });
  });
});
