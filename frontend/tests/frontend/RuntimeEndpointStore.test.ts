/**
 * Covers renderer runtime endpoint URL state.
 */

import {
  buildRuntimeArtifactUrl,
  buildRuntimeTranscriptionWebSocketUrl,
  setRuntimeEndpointHttpUrl,
} from '../../src/renderer/infrastructure/services/RuntimeEndpointStore';
import {
  DesktopRuntimeEndpointClient,
} from '../../src/renderer/app/runtime/desktopRuntimeEndpointClient';

describe('RuntimeEndpointStore', () => {
  beforeEach(() => {
    setRuntimeEndpointHttpUrl('http://127.0.0.1:8765');
  });

  test('buildRuntimeArtifactUrl returns canonical API artifact path', () => {
    expect(buildRuntimeArtifactUrl('art-2')).toBe('http://127.0.0.1:8765/api/artifacts/art-2');
  });

  test('buildRuntimeArtifactUrl uses normalized runtime http URL when provided', () => {
    setRuntimeEndpointHttpUrl('http://10.0.0.42:9001/prefix/?debug=1#hash');

    expect(buildRuntimeArtifactUrl('art-2')).toBe('http://10.0.0.42:9001/prefix/api/artifacts/art-2');
  });

  test('setRuntimeEndpointHttpUrl ignores invalid runtime URLs', () => {
    setRuntimeEndpointHttpUrl('https://runtime.backend.example.test/');
    setRuntimeEndpointHttpUrl('file:///tmp/not-http');

    expect(buildRuntimeArtifactUrl('art-2')).toBe('https://runtime.backend.example.test/api/artifacts/art-2');
  });

  test('buildRuntimeTranscriptionWebSocketUrl maps http endpoints to websocket endpoints', () => {
    setRuntimeEndpointHttpUrl('https://runtime.backend.example.test/base');

    expect(buildRuntimeTranscriptionWebSocketUrl()).toBe('wss://runtime.backend.example.test/ws/transcription');
  });

  test('runtime endpoint client syncs generic runtime snapshot URL', () => {
    DesktopRuntimeEndpointClient.syncFromConnectionSnapshot({
      runtimeHttpUrl: 'http://10.0.0.42:9001/runtime/',
    });

    expect(buildRuntimeArtifactUrl('art-2')).toBe('http://10.0.0.42:9001/runtime/api/artifacts/art-2');
  });

  test('runtime endpoint client ignores backend-shaped snapshot fields', () => {
    DesktopRuntimeEndpointClient.syncFromConnectionSnapshot({
      backendHttpUrl: 'http://10.0.0.43:9001',
    });

    expect(buildRuntimeArtifactUrl('art-2')).toBe('http://127.0.0.1:8765/api/artifacts/art-2');
  });

});
