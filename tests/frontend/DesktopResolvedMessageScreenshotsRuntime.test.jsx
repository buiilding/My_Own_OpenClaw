/**
 * Covers resolved message screenshot source behavior in the frontend test suite.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import {
  DesktopResolvedMessageScreenshotsRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopResolvedMessageScreenshotsRuntime';
import { DesktopArtifactRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient';

jest.mock('../../frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient', () => {
  const imageUtils = jest.requireActual(
    '../../frontend/src/renderer/infrastructure/services/ArtifactImageUtils',
  );
  const screenshotState = jest.requireActual(
    '../../frontend/src/renderer/infrastructure/services/screenshotMessageState',
  );
  const buildArtifactUrl = jest.fn((artifactId) => `http://runtime.test/api/artifacts/${artifactId}`);
  const withArtifactUrlBuilder = (input = {}) => ({
    ...input,
    artifactUrlBuilder: buildArtifactUrl,
  });

  return {
    DesktopArtifactRuntimeClient: {
      buildArtifactUrl,
      fetchArtifactImage: jest.fn(),
      inferArtifactRefFromUrl: screenshotState.inferArtifactRefFromUrl,
      normalizeArtifactImageContentType: imageUtils.normalizeArtifactImageContentType,
      resolveScreenshotAttachmentState: (input) => (
        screenshotState.resolveScreenshotAttachmentState(withArtifactUrlBuilder(input))
      ),
    },
  };
});

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('DesktopResolvedMessageScreenshotsRuntime', () => {
  beforeEach(() => {
    DesktopArtifactRuntimeClient.fetchArtifactImage.mockReset();
  });

  test('resolves artifact image attachments through the artifact runtime', async () => {
    const artifactFetch = createDeferred();
    DesktopArtifactRuntimeClient.fetchArtifactImage.mockReturnValueOnce(artifactFetch.promise);

    const { result, rerender } = renderHook(
      ({ attachment }) => (
        DesktopResolvedMessageScreenshotsRuntime.useResolvedArtifactImageSrc(attachment)
      ),
      {
        initialProps: {
          attachment: {
            id: 'attachment-1',
            screenshotRef: 'artifact-screen-1',
          },
        },
      },
    );

    expect(DesktopArtifactRuntimeClient.fetchArtifactImage).toHaveBeenCalledWith({
      artifactId: 'artifact-screen-1',
      url: null,
    });
    expect(result.current).toBeNull();

    await act(async () => {
      artifactFetch.resolve({
        success: true,
        dataUrl: 'data:image/png;base64,artifact-backed-base64',
      });
      await artifactFetch.promise;
    });

    await waitFor(() => {
      expect(result.current).toBe('data:image/png;base64,artifact-backed-base64');
    });

    act(() => {
      rerender({
        attachment: {
          id: 'attachment-1',
          screenshotRef: 'artifact-screen-1',
        },
      });
    });

    expect(result.current).toBe('data:image/png;base64,artifact-backed-base64');
  });

  test('returns static non-artifact attachment urls without fetching', () => {
    const { result } = renderHook(
      () => DesktopResolvedMessageScreenshotsRuntime.useResolvedArtifactImageSrc({
        id: 'attachment-static',
        screenshotUrl: 'https://cdn.example/static.png',
      }),
    );

    expect(result.current).toBe('https://cdn.example/static.png');
    expect(DesktopArtifactRuntimeClient.fetchArtifactImage).not.toHaveBeenCalled();
  });
});
