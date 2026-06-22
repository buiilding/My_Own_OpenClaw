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

  test('keeps same-turn inline screenshot source visible while artifact source resolves', async () => {
    const artifactFetch = createDeferred();
    DesktopArtifactRuntimeClient.fetchArtifactImage.mockReturnValueOnce(artifactFetch.promise);
    const inlineMessage = {
      id: 'turn-1-sdk-evt-000002-user_message',
      turnRef: 'turn-1',
      sender: 'user',
      text: 'hello my name is peter',
      screenshots: [{
        screenshot: 'inline-optimistic-base64',
        screenshotContentType: 'image/png',
      }],
    };
    const artifactMessage = {
      ...inlineMessage,
      screenshots: [{
        screenshotRef: 'artifact-screen-1',
      }],
    };

    const { result, rerender } = renderHook(
      ({ message }) => (
        DesktopResolvedMessageScreenshotsRuntime.useResolvedMessageScreenshotSrcList(message)
      ),
      { initialProps: { message: inlineMessage } },
    );

    expect(result.current).toEqual(['data:image/png;base64,inline-optimistic-base64']);

    act(() => {
      rerender({ message: artifactMessage });
    });

    expect(DesktopArtifactRuntimeClient.fetchArtifactImage).toHaveBeenCalledWith({
      artifactId: 'artifact-screen-1',
      url: 'http://runtime.test/api/artifacts/artifact-screen-1',
    });
    expect(result.current).toEqual(['data:image/png;base64,inline-optimistic-base64']);

    await act(async () => {
      artifactFetch.resolve({
        success: true,
        dataUrl: 'data:image/png;base64,artifact-backed-base64',
      });
      await artifactFetch.promise;
    });

    await waitFor(() => {
      expect(result.current).toEqual(['data:image/png;base64,artifact-backed-base64']);
    });
  });

  test('clears stale inline source when an artifact-only screenshot belongs to a different message', () => {
    const artifactFetch = createDeferred();
    DesktopArtifactRuntimeClient.fetchArtifactImage.mockReturnValueOnce(artifactFetch.promise);
    const inlineMessage = {
      id: 'turn-1-sdk-evt-000002-user_message',
      turnRef: 'turn-1',
      sender: 'user',
      text: 'first',
      screenshots: [{
        screenshot: 'inline-first-base64',
        screenshotContentType: 'image/png',
      }],
    };
    const nextArtifactMessage = {
      id: 'turn-2-sdk-evt-000002-user_message',
      turnRef: 'turn-2',
      sender: 'user',
      text: 'second',
      screenshots: [{
        screenshotRef: 'artifact-screen-2',
      }],
    };

    const { result, rerender } = renderHook(
      ({ message }) => (
        DesktopResolvedMessageScreenshotsRuntime.useResolvedMessageScreenshotSrcList(message)
      ),
      { initialProps: { message: inlineMessage } },
    );

    expect(result.current).toEqual(['data:image/png;base64,inline-first-base64']);

    act(() => {
      rerender({ message: nextArtifactMessage });
    });

    expect(result.current).toEqual([]);
  });

  test('keeps cached same-turn inline source after artifact-only message remounts', () => {
    const artifactFetch = createDeferred();
    DesktopArtifactRuntimeClient.fetchArtifactImage.mockReturnValueOnce(artifactFetch.promise);
    const inlineMessage = {
      id: 'turn-remount-sdk-evt-000002-user_message',
      turnRef: 'turn-remount',
      sender: 'user',
      text: 'same turn before remount',
      screenshots: [{
        screenshot: 'inline-remount-base64',
        screenshotContentType: 'image/png',
      }],
    };
    const artifactMessage = {
      id: 'turn-remount-sdk-evt-000002-user_message',
      turnRef: 'turn-remount',
      sender: 'user',
      text: 'same turn after remount',
      screenshots: [{
        screenshotRef: 'artifact-screen-remount',
      }],
    };

    const inlineHook = renderHook(
      ({ message }) => (
        DesktopResolvedMessageScreenshotsRuntime.useResolvedMessageScreenshotSrcList(message)
      ),
      { initialProps: { message: inlineMessage } },
    );

    expect(inlineHook.result.current).toEqual(['data:image/png;base64,inline-remount-base64']);

    inlineHook.unmount();

    const artifactHook = renderHook(
      ({ message }) => (
        DesktopResolvedMessageScreenshotsRuntime.useResolvedMessageScreenshotSrcList(message)
      ),
      { initialProps: { message: artifactMessage } },
    );

    expect(DesktopArtifactRuntimeClient.fetchArtifactImage).toHaveBeenCalledWith({
      artifactId: 'artifact-screen-remount',
      url: 'http://runtime.test/api/artifacts/artifact-screen-remount',
    });
    expect(artifactHook.result.current).toEqual(['data:image/png;base64,inline-remount-base64']);
  });
});
