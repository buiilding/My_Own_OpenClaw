const DEFAULT_BACKEND_HTTP_URL = 'http://127.0.0.1:8765';

let backendHttpUrl = DEFAULT_BACKEND_HTTP_URL;

function normalizeBackendHttpUrl(url: string | null | undefined): string | null {
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

export function setBackendHttpUrl(url: string | null | undefined): void {
  const normalized = normalizeBackendHttpUrl(url);
  if (normalized) {
    backendHttpUrl = normalized;
  }
}

export function getBackendHttpUrl(): string {
  return backendHttpUrl;
}

export function buildTranscriptionWebSocketUrl(): string {
  const httpUrl = getBackendHttpUrl();
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
