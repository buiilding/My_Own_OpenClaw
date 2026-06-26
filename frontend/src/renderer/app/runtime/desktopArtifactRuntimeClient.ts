/**
 * Coordinates artifact image commands for renderer app-runtime clients.
 */

import {
  inferArtifactRefFromUrl,
  normalizeArtifactImageContentType,
  resolveArtifactImageExtension,
} from '../../infrastructure/services/ArtifactImageUtils';
import { IpcBridge } from '../../infrastructure/ipc/bridge';
import { INVOKE_CHANNELS } from '../../infrastructure/ipc/channels';
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

export const DesktopArtifactRuntimeClient = {
  buildArtifactUrl(artifactId: string): string {
    return buildArtifactUrl(artifactId);
  },

  normalizeArtifactImageContentType,

  resolveArtifactImageExtension,

  inferArtifactRefFromUrl,

  fetchArtifactImage(request: FetchArtifactImageRequest): Promise<FetchArtifactImageResult> {
    return IpcBridge.invoke(INVOKE_CHANNELS.FETCH_ARTIFACT_IMAGE, request) as Promise<FetchArtifactImageResult>;
  },

  showImageContextMenu(request: ShowImageContextMenuRequest): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SHOW_IMAGE_CONTEXT_MENU, request);
  },
};
