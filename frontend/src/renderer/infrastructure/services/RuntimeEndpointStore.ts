/**
 * Stores and retrieves runtime endpoint state for renderer URL composition.
 */

const DEFAULT_RUNTIME_HTTP_URL = 'http://127.0.0.1:8765';

let runtimeHttpUrl = DEFAULT_RUNTIME_HTTP_URL;

function normalizeRuntimeHttpUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.search = '';
    parsed.hash = '';
    parsed.pathname = parsed.pathname === '/' ? '/' : parsed.pathname.replace(/\/$/, '');
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function setRuntimeEndpointHttpUrl(url: string | null | undefined): void {
  const normalized = normalizeRuntimeHttpUrl(url);
  if (normalized) {
    runtimeHttpUrl = normalized;
  }
}

function getRuntimeEndpointHttpUrl(): string {
  return runtimeHttpUrl;
}

export function buildRuntimeArtifactUrl(artifactId: string): string {
  return `${getRuntimeEndpointHttpUrl()}/api/artifacts/${artifactId}`;
}

export function buildRuntimeTranscriptionWebSocketUrl(): string {
  const httpUrl = getRuntimeEndpointHttpUrl();
  try {
    const parsed = new URL(httpUrl);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    parsed.pathname = '/ws/transcription';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return 'ws://127.0.0.1:8765/ws/transcription';
  }
}
