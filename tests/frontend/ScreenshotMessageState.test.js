/**
 * Covers screenshot message state. behavior in the frontend test suite.
 */

import {
  buildMessageScreenshotState,
  buildRemoteScreenshotAttachment,
  buildRemoteScreenshotAttachments,
  inferArtifactRefFromUrl,
  resolveReplayScreenshotState,
  resolveScreenshotAttachmentState,
} from '../../frontend/src/renderer/infrastructure/services/screenshotMessageState';

describe('screenshotMessageState', () => {
  test('buildRemoteScreenshotAttachment normalizes refs and derives artifact urls', () => {
    expect(buildRemoteScreenshotAttachment(' artifact-1 ', null)).toEqual({
      screenshotRef: 'artifact-1',
      screenshotUrl: expect.stringContaining('/api/artifacts/artifact-1'),
    });

    expect(buildRemoteScreenshotAttachment('artifact-2', ' https://cdn.example/shot.png ')).toEqual({
      screenshotRef: 'artifact-2',
      screenshotUrl: 'https://cdn.example/shot.png',
    });
  });

  test('buildRemoteScreenshotAttachments trims refs and keeps the first explicit url only once', () => {
    expect(buildRemoteScreenshotAttachments(
      [' artifact-1 ', '   ', null, 'artifact-2'],
      ' https://cdn.example/shot.png ',
    )).toEqual([
      {
        screenshotRef: 'artifact-1',
        screenshotUrl: 'https://cdn.example/shot.png',
      },
      {
        screenshotRef: 'artifact-2',
        screenshotUrl: expect.stringContaining('/api/artifacts/artifact-2'),
      },
    ]);
  });

  test('resolveScreenshotAttachmentState can preserve inline screenshots alongside remote refs', () => {
    expect(resolveScreenshotAttachmentState({
      screenshot: 'data:image/png;base64,inline-shot',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-42',
      preserveInlineScreenshotWithRemote: true,
    })).toEqual({
      screenshot: 'inline-shot',
      screenshotRef: 'artifact-42',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-42',
      screenshotContentType: 'image/png',
      hasRemoteScreenshot: true,
    });
  });

  test('buildMessageScreenshotState prefers remote screenshots for chat message rows', () => {
    expect(buildMessageScreenshotState({
      screenshot: 'data:image/png;base64,inline-shot',
      screenshotRef: 'artifact-10',
    })).toEqual({
      screenshot: null,
      screenshotRef: 'artifact-10',
      screenshotUrl: expect.stringContaining('/api/artifacts/artifact-10'),
      screenshotContentType: null,
    });
  });

  test('resolveScreenshotAttachmentState infers transcript artifact refs from old screenshot fields', () => {
    expect(resolveScreenshotAttachmentState({
      screenshot: 'artifact-legacy-1',
      inferArtifactRefFromScreenshot: true,
      preserveInlineScreenshotWithRemote: true,
    })).toEqual({
      screenshot: null,
      screenshotRef: 'artifact-legacy-1',
      screenshotUrl: expect.stringContaining('/api/artifacts/artifact-legacy-1'),
      screenshotContentType: null,
      hasRemoteScreenshot: true,
    });
  });

  test('resolveReplayScreenshotState keeps inline screenshots when no remote ref exists', () => {
    const inlineScreenshot = 'A'.repeat(256);
    expect(resolveReplayScreenshotState({
      screenshot: inlineScreenshot,
    })).toEqual({
      screenshot: inlineScreenshot,
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: null,
    });
  });

  test('resolveReplayScreenshotState infers artifact refs from screenshot urls', () => {
    expect(resolveReplayScreenshotState({
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-91',
    })).toEqual({
      screenshot: null,
      screenshotRef: 'artifact-91',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-91',
      screenshotContentType: null,
    });
  });

  test('inferArtifactRefFromUrl extracts artifact ids from backend urls', () => {
    expect(inferArtifactRefFromUrl('http://127.0.0.1:8765/api/artifacts/artifact-77')).toBe('artifact-77');
    expect(inferArtifactRefFromUrl('https://cdn.example/not-an-artifact.png')).toBeNull();
  });
});
