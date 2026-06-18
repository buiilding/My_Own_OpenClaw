/**
 * Exposes renderer runtime endpoint URL state through the app runtime boundary.
 */

import {
  buildRuntimeArtifactUrl,
  buildRuntimeTranscriptionWebSocketUrl,
  setRuntimeEndpointHttpUrl,
} from '../../infrastructure/services/RuntimeEndpointStore';

export const DesktopRuntimeEndpointClient = {
  setHttpUrl: setRuntimeEndpointHttpUrl,
  buildArtifactUrl: buildRuntimeArtifactUrl,
  buildTranscriptionWebSocketUrl: buildRuntimeTranscriptionWebSocketUrl,
};
