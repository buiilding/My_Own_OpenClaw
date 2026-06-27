/**
 * Covers attachment image source behavior in the frontend test suite.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import {
  DesktopAttachmentImageRuntime,
} from '../../src/renderer/app/runtime/desktopAttachmentImageRuntime';
import { DesktopArtifactRuntimeClient } from '../../src/renderer/app/runtime/desktopArtifactRuntimeClient';

jest.mock('../../src/renderer/app/runtime/desktopArtifactRuntimeClient', () => {
  const imageUtils = jest.requireActual(
    '../../src/renderer/infrastructure/services/ArtifactImageUtils',
  );
  const buildArtifactUrl = jest.fn((artifactId) => `http://runtime.test/api/artifacts/${artifactId}`);

  return {
    DesktopArtifactRuntimeClient: {
      buildArtifactUrl,
      fetchArtifactImage: jest.fn(),
      inferArtifactRefFromUrl: imageUtils.inferArtifactRefFromUrl,
      normalizeArtifactImageContentType: imageUtils.normalizeArtifactImageContentType,
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

describe('DesktopAttachmentImageRuntime', () => {
  beforeEach(() => {
    DesktopArtifactRuntimeClient.fetchArtifactImage.mockReset();
  });

  test('resolves artifact image attachments through the artifact runtime', async () => {
    const artifactFetch = createDeferred();
    DesktopArtifactRuntimeClient.fetchArtifactImage.mockReturnValueOnce(artifactFetch.promise);

    const { result, rerender } = renderHook(
      ({ attachment }) => (
        DesktopAttachmentImageRuntime.useResolvedAttachmentImageSrc(attachment)
      ),
      {
        initialProps: {
          attachment: {
            id: 'attachment-1',
            kind: 'image',
            source: 'user_included',
            status: 'ready',
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
          kind: 'image',
          source: 'user_included',
          status: 'ready',
          screenshotRef: 'artifact-screen-1',
        },
      });
    });

    expect(result.current).toBe('data:image/png;base64,artifact-backed-base64');
  });

  test('returns static non-artifact attachment urls without fetching', () => {
    const { result } = renderHook(
      () => DesktopAttachmentImageRuntime.useResolvedAttachmentImageSrc({
        id: 'attachment-static',
        kind: 'image',
        source: 'user_included',
        status: 'ready',
        screenshotUrl: 'https://cdn.example/static.png',
      }),
    );

    expect(result.current).toBe('https://cdn.example/static.png');
    expect(DesktopArtifactRuntimeClient.fetchArtifactImage).not.toHaveBeenCalled();
  });

  test('ignores whole-message screenshot aliases outside typed attachments', () => {
    const { result } = renderHook(
      () => DesktopAttachmentImageRuntime.useResolvedAttachmentImageSrc({
        id: 'message-row',
        screenshotRef: 'artifact-row-alias',
        screenshotUrl: 'https://cdn.example/row-alias.png',
      }),
    );

    expect(result.current).toBeNull();
    expect(DesktopArtifactRuntimeClient.fetchArtifactImage).not.toHaveBeenCalled();
  });

  test('does not loop state updates when equivalent artifact attachments are recreated', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    DesktopArtifactRuntimeClient.fetchArtifactImage.mockResolvedValue({
      success: true,
      dataUrl: 'data:image/png;base64,artifact-loop-safe',
    });
    const createAttachment = () => ({
      id: 'turn-loop:attachment:000',
      kind: 'image',
      source: 'tool_result',
      status: 'ready',
      screenshotRef: 'artifact-loop-safe',
    });

    try {
      const { result, rerender } = renderHook(
        ({ attachment }) => (
          DesktopAttachmentImageRuntime.useResolvedAttachmentImageSrc(attachment)
        ),
        { initialProps: { attachment: createAttachment() } },
      );

      await waitFor(() => {
        expect(result.current).toEqual('data:image/png;base64,artifact-loop-safe');
      });

      for (let index = 0; index < 5; index += 1) {
        act(() => {
          rerender({ attachment: createAttachment() });
        });
        expect(result.current).toEqual('data:image/png;base64,artifact-loop-safe');
      }

      expect(DesktopArtifactRuntimeClient.fetchArtifactImage).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Maximum update depth exceeded'),
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
