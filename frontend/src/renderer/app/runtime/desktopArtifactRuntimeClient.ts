/**
 * Coordinates desktop artifact image commands for renderer runtime clients.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';
import { buildRuntimeArtifactUrl } from '../../infrastructure/services/RuntimeEndpointStore';

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

export const DesktopArtifactRuntimeClient = {
  buildArtifactUrl(artifactId: string): string {
    return buildRuntimeArtifactUrl(artifactId);
  },

  fetchArtifactImage(request: FetchArtifactImageRequest): Promise<FetchArtifactImageResult> {
    return IpcBridge.invoke(INVOKE_CHANNELS.FETCH_ARTIFACT_IMAGE, request) as Promise<FetchArtifactImageResult>;
  },

  showImageContextMenu(request: ShowImageContextMenuRequest): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SHOW_IMAGE_CONTEXT_MENU, request);
  },
};
