import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import { logRendererArtifactScreenshotDebug } from './toolExecution/ToolScreenshotDebugTrace';
import {
  getBackendHttpUrl,
  setBackendHttpUrl,
} from './BackendEndpointStore';

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

export { setBackendHttpUrl };

export async function uploadArtifactBase64(
  base64: string,
  contentType: string,
  filename?: string
): Promise<ArtifactUploadResult | null> {
  if (!base64) {
    return null;
  }

  logRendererArtifactScreenshotDebug('request', {
    contentType,
    filename: filename || null,
    base64Length: typeof base64 === 'string' ? base64.length : 0,
  });

  const response = await IpcBridge.invoke<UploadResponse>(INVOKE_CHANNELS.UPLOAD_ARTIFACT, {
    base64,
    contentType,
    filename,
  });

  logRendererArtifactScreenshotDebug('response', {
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
