/**
 * Compatibility wrapper for the renderer runtime endpoint store.
 */

export {
  buildRuntimeArtifactUrl as buildArtifactUrl,
  buildRuntimeTranscriptionWebSocketUrl as buildTranscriptionWebSocketUrl,
  setRuntimeEndpointHttpUrl as setBackendHttpUrl,
} from './RuntimeEndpointStore';
