import {
  buildScreenshotRefs,
  resolvePrimaryScreenshotAttachment,
  toUploadedArtifactFromCaptureAttachment,
} from '../../frontend/src/renderer/features/chat/utils/screenshotAttachmentContract';

describe('screenshotAttachmentContract', () => {
  test('toUploadedArtifactFromCaptureAttachment returns null when capture has no attachment fields', () => {
    expect(toUploadedArtifactFromCaptureAttachment(null)).toBeNull();
    expect(toUploadedArtifactFromCaptureAttachment({})).toBeNull();
    expect(toUploadedArtifactFromCaptureAttachment({
      screenshotRef: '   ',
      screenshotUrl: '',
    })).toBeNull();
  });

  test('toUploadedArtifactFromCaptureAttachment normalizes capture screenshot attachment fields', () => {
    expect(toUploadedArtifactFromCaptureAttachment({
      screenshotRef: ' artifact-1 ',
      screenshotUrl: ' http://127.0.0.1:8765/api/artifacts/artifact-1 ',
    })).toEqual({
      artifactId: 'artifact-1',
      url: 'http://127.0.0.1:8765/api/artifacts/artifact-1',
    });
  });

  test('resolvePrimaryScreenshotAttachment prefers first entry with screenshotRef', () => {
    expect(resolvePrimaryScreenshotAttachment(
      [
        { screenshotRef: null, screenshotUrl: 'http://localhost/a' },
        { screenshotRef: 'artifact-2', screenshotUrl: 'http://localhost/2' },
      ],
      { screenshotRef: 'artifact-fallback', screenshotUrl: 'http://localhost/fallback' },
    )).toEqual({
      screenshotRef: 'artifact-2',
      screenshotUrl: 'http://localhost/2',
    });
  });

  test('resolvePrimaryScreenshotAttachment falls back when no entry has screenshotRef', () => {
    expect(resolvePrimaryScreenshotAttachment(
      [{ screenshotRef: null, screenshotUrl: 'http://localhost/a' }],
      { screenshotRef: 'artifact-fallback', screenshotUrl: 'http://localhost/fallback' },
    )).toEqual({
      screenshotRef: 'artifact-fallback',
      screenshotUrl: 'http://localhost/fallback',
    });
  });

  test('buildScreenshotRefs dedupes entry refs and includes primary ref fallback', () => {
    expect(buildScreenshotRefs(
      [
        { screenshotRef: 'artifact-1' },
        { screenshotRef: 'artifact-1' },
        { screenshotRef: 'artifact-2' },
        { screenshotRef: null },
      ],
      'artifact-3',
    )).toEqual(['artifact-1', 'artifact-2', 'artifact-3']);
  });

  test('buildScreenshotRefs returns primary ref when entries are empty', () => {
    expect(buildScreenshotRefs([], 'artifact-only')).toEqual(['artifact-only']);
  });
});

