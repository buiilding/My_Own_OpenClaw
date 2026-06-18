/**
 * Exposes renderer runtime endpoint URL state through the app runtime boundary.
 */

import {
  buildRuntimeArtifactUrl,
  buildRuntimeTranscriptionWebSocketUrl,
  setRuntimeEndpointHttpUrl,
} from '../../infrastructure/services/RuntimeEndpointStore';

function resolveRuntimeHttpUrlFromSnapshot(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }
  const runtimeSnapshot = snapshot as Record<string, unknown>;
  const genericRuntimeUrl = runtimeSnapshot.runtimeHttpUrl;
  if (typeof genericRuntimeUrl === 'string' && genericRuntimeUrl.trim().length > 0) {
    return genericRuntimeUrl;
  }
  const legacyBackendUrl = runtimeSnapshot.backendHttpUrl;
  if (typeof legacyBackendUrl === 'string' && legacyBackendUrl.trim().length > 0) {
    return legacyBackendUrl;
  }
  return null;
}

export const DesktopRuntimeEndpointClient = {
  setHttpUrl: setRuntimeEndpointHttpUrl,
  syncFromConnectionSnapshot(snapshot: unknown): void {
    setRuntimeEndpointHttpUrl(resolveRuntimeHttpUrlFromSnapshot(snapshot));
  },
  buildArtifactUrl: buildRuntimeArtifactUrl,
  buildTranscriptionWebSocketUrl: buildRuntimeTranscriptionWebSocketUrl,
};
