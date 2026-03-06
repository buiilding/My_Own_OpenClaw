import {
  buildExtractOsStateResult,
  buildScreenshotArgs,
  createEmptyExtractOsStateResult,
  extractScreenshotData,
} from '../../frontend/src/renderer/infrastructure/services/systemCaptureRuntime';

jest.mock('../../frontend/src/renderer/utils/displaySelection', () => ({
  getStoredDisplayBounds: jest.fn(),
}));

const { getStoredDisplayBounds } = jest.requireMock('../../frontend/src/renderer/utils/displaySelection');

describe('systemCaptureRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('buildScreenshotArgs includes stored display bounds when present', () => {
    getStoredDisplayBounds.mockReturnValue({ x: 10, y: 20, width: 300, height: 200 });

    expect(buildScreenshotArgs('Capture screen')).toEqual({
      explanation: 'Capture screen',
      expectation: 'Current screen state',
      display_bounds: { x: 10, y: 20, width: 300, height: 200 },
    });
  });

  test('extractScreenshotData normalizes payload fields and infers artifact ref from url', () => {
    expect(extractScreenshotData({
      success: true,
      data: {
        screenshot: '  inline-shot  ',
        screenshot_url: 'http://127.0.0.1:8765/api/artifacts/artifact-42',
        capture_meta: { source_w: 1920 },
        compression: 'png',
      },
    } as any)).toEqual({
      ...createEmptyExtractOsStateResult(),
      screenshot: 'inline-shot',
      screenshotRef: 'artifact-42',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-42',
      screenshotContentType: 'image/png',
      captureMeta: { source_w: 1920 },
    });
  });

  test('buildExtractOsStateResult merges system state and screenshot data onto empty defaults', () => {
    expect(buildExtractOsStateResult({
      systemState: { active_window: 'App' } as any,
      screenshotData: { screenshotRef: 'artifact-1' },
    })).toEqual({
      systemState: { active_window: 'App' },
      screenshot: null,
      screenshotRef: 'artifact-1',
      screenshotUrl: null,
      screenshotContentType: null,
      captureMeta: null,
    });
  });
});
