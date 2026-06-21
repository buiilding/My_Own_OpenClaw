/**
 * Coordinates artifact image commands for renderer app-runtime clients.
 */

import {
  normalizeArtifactImageContentType,
  resolveArtifactImageExtension,
} from '../../infrastructure/services/ArtifactImageUtils';
import {
  buildRemoteScreenshotAttachment,
  buildRemoteScreenshotAttachments,
  inferArtifactRefFromUrl,
  resolveReplayScreenshotState,
  resolveScreenshotAttachmentState,
} from '../../infrastructure/services/screenshotMessageState';
import { IpcBridge, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';
import { DesktopRuntimeEndpointClient } from './desktopRuntimeEndpointClient';

export type FetchArtifactImageRequest = {
  artifactId?: string | null;
  url?: string | null;
};

export type FetchArtifactImageResult = {
  success?: boolean;
  dataUrl?: string | null;
};

export type ShowImageContextMenuRequest = {
  src: string;
};

function buildArtifactUrl(artifactId: string): string {
  return DesktopRuntimeEndpointClient.buildArtifactUrl(artifactId);
}

function withArtifactUrlBuilder(
  options: Record<string, unknown> | null | undefined = {},
): Record<string, unknown> & { artifactUrlBuilder: (artifactId: string) => string } {
  return {
    ...(options || {}),
    artifactUrlBuilder: buildArtifactUrl,
  };
}

export const DesktopArtifactRuntimeClient = {
  buildArtifactUrl(artifactId: string): string {
    return buildArtifactUrl(artifactId);
  },

  normalizeArtifactImageContentType,

  resolveArtifactImageExtension,

  inferArtifactRefFromUrl,

  buildRemoteScreenshotAttachment(
    screenshotRef: string | null | undefined,
    screenshotUrl?: string | null,
    options: Record<string, unknown> = {},
  ) {
    return buildRemoteScreenshotAttachment(
      screenshotRef,
      screenshotUrl,
      withArtifactUrlBuilder(options),
    );
  },

  buildRemoteScreenshotAttachments(
    screenshotRefs: unknown,
    screenshotUrl?: string | null,
    options: Record<string, unknown> = {},
  ) {
    return buildRemoteScreenshotAttachments(
      screenshotRefs,
      screenshotUrl,
      withArtifactUrlBuilder(options),
    );
  },

  resolveScreenshotAttachmentState(input: Record<string, unknown>) {
    return resolveScreenshotAttachmentState(withArtifactUrlBuilder(input));
  },

  resolveReplayScreenshotState(input: Record<string, unknown>) {
    return resolveReplayScreenshotState(withArtifactUrlBuilder(input));
  },

  fetchArtifactImage(request: FetchArtifactImageRequest): Promise<FetchArtifactImageResult> {
    return IpcBridge.invoke(INVOKE_CHANNELS.FETCH_ARTIFACT_IMAGE, request) as Promise<FetchArtifactImageResult>;
  },

  showImageContextMenu(request: ShowImageContextMenuRequest): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SHOW_IMAGE_CONTEXT_MENU, request);
  },
};
