/**
 * Covers renderer backend endpoint URL state.
 */

import {
  buildArtifactUrl,
  buildTranscriptionWebSocketUrl,
  setBackendHttpUrl,
} from '../../frontend/src/renderer/infrastructure/services/BackendEndpointStore';

describe('BackendEndpointStore', () => {
  beforeEach(() => {
    setBackendHttpUrl('http://127.0.0.1:8765');
  });

  test('buildArtifactUrl returns canonical API artifact path', () => {
    expect(buildArtifactUrl('art-2')).toBe('http://127.0.0.1:8765/api/artifacts/art-2');
  });

  test('buildArtifactUrl uses normalized runtime backend http URL when provided', () => {
    setBackendHttpUrl('http://10.0.0.42:9001/prefix/?debug=1#hash');

    expect(buildArtifactUrl('art-2')).toBe('http://10.0.0.42:9001/prefix/api/artifacts/art-2');
  });

  test('setBackendHttpUrl ignores invalid backend URLs', () => {
    setBackendHttpUrl('https://api.windieos.test/');
    setBackendHttpUrl('file:///tmp/not-http');

    expect(buildArtifactUrl('art-2')).toBe('https://api.windieos.test/api/artifacts/art-2');
  });

  test('buildTranscriptionWebSocketUrl maps http endpoints to websocket endpoints', () => {
    setBackendHttpUrl('https://api.windieos.test/base');

    expect(buildTranscriptionWebSocketUrl()).toBe('wss://api.windieos.test/ws/transcription');
  });
});
