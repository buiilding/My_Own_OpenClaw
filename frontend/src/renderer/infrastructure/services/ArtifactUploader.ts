import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';

const DEFAULT_BACKEND_HTTP_URL = 'http://127.0.0.1:8765';
let backendHttpUrl = DEFAULT_BACKEND_HTTP_URL;

const DEBUG_TOOL_SCREENSHOT = (
  typeof process !== 'undefined'
  && process?.env?.WINDIE_DEBUG_TOOL_SCREENSHOT === '1'
);

type ArtifactUploadResult = {
  artifactId: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  url: string;
};

type UploadResponse = {
  success: boolean;
  data?: {
    artifact_id: string;
    content_type: string;
    size_bytes: number;
    sha256: string;
    url: string;
  };
  error?: string;
};

function logArtifactDebug(stage: string, payload: Record<string, unknown>): void {
  if (!DEBUG_TOOL_SCREENSHOT) {
    return;
  }
  console.log('[ToolShotDebug][renderer][artifact]', stage, payload);
}

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

function getBackendHttpUrl(): string {
  return backendHttpUrl;
}

export async function uploadArtifactBase64(
  base64: string,
  contentType: string,
  filename?: string
): Promise<ArtifactUploadResult | null> {
  if (!base64) {
    return null;
  }

  logArtifactDebug('request', {
    contentType,
    filename: filename || null,
    base64Length: typeof base64 === 'string' ? base64.length : 0,
  });

  const response = await IpcBridge.invoke<UploadResponse>(INVOKE_CHANNELS.UPLOAD_ARTIFACT, {
    base64,
    contentType,
    filename,
  });

  logArtifactDebug('response', {
    success: response?.success ?? null,
    hasData: Boolean(response?.data),
    error: response?.error || null,
    artifactId: response?.data?.artifact_id || null,
    url: response?.data?.url || null,
  });

  if (!response?.success || !response.data) {
    console.warn('[ArtifactUploader] Upload failed:', response?.error || 'Unknown error');
    return null;
  }

  return {
    artifactId: response.data.artifact_id,
    contentType: response.data.content_type,
    sizeBytes: response.data.size_bytes,
    sha256: response.data.sha256,
    url: response.data.url,
  };
}

export function buildArtifactUrl(artifactId: string): string {
  return `${getBackendHttpUrl()}/api/artifacts/${artifactId}`;
}
