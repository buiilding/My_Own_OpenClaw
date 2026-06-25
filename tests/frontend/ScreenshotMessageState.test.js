/**
 * Covers screenshot message state. behavior in the frontend test suite.
 */

import {
  buildMessageScreenshotState,
  buildRemoteScreenshotAttachment,
  buildRemoteScreenshotAttachments,
  inferArtifactRefFromUrl,
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

  test('buildRemoteScreenshotAttachment accepts an injected artifact url builder', () => {
    const artifactUrlBuilder = jest.fn((artifactId) => `http://runtime.test/artifacts/${artifactId}`);

    expect(buildRemoteScreenshotAttachment('artifact-3', null, { artifactUrlBuilder })).toEqual({
      screenshotRef: 'artifact-3',
      screenshotUrl: 'http://runtime.test/artifacts/artifact-3',
    });
    expect(artifactUrlBuilder).toHaveBeenCalledWith('artifact-3');
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

  test('resolveScreenshotAttachmentState keeps screenshot payloads as inline image data', () => {
    expect(resolveScreenshotAttachmentState({
      screenshot: 'inline-shot',
      preserveInlineScreenshotWithRemote: true,
    })).toEqual({
      screenshot: 'inline-shot',
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: null,
      hasRemoteScreenshot: false,
    });
  });

  test('inferArtifactRefFromUrl extracts artifact ids from backend urls', () => {
    expect(inferArtifactRefFromUrl('http://127.0.0.1:8765/api/artifacts/artifact-77')).toBe('artifact-77');
    expect(inferArtifactRefFromUrl('https://cdn.example/not-an-artifact.png')).toBeNull();
  });
});
