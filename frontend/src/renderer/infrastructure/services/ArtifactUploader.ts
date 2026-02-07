import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';

export type ArtifactUploadResult = {
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

export async function uploadArtifactBase64(
  base64: string,
  contentType: string,
  filename?: string
): Promise<ArtifactUploadResult | null> {
  if (!base64) {
    return null;
  }

  const response = await IpcBridge.invoke<UploadResponse>(INVOKE_CHANNELS.UPLOAD_ARTIFACT, {
    base64,
    contentType,
    filename,
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
  const baseUrl = 'http://127.0.0.1:8765';
  return `${baseUrl}/api/artifacts/${artifactId}`;
}
