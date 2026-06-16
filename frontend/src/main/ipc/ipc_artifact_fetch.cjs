/**
 * Provides the ipc artifact fetch module for the Electron main process.
 */

function inferArtifactId(input) {
  if (typeof input !== 'string') {
    return null;
  }
  const normalized = input.trim();
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/\/api\/artifacts\/([^/?#]+)/i);
  return match?.[1] || null;
}

function buildArtifactFetchUrl({ backendHttpUrl, artifactId, url }) {
  const normalizedBackendHttpUrl = typeof backendHttpUrl === 'string'
    ? backendHttpUrl.trim().replace(/\/+$/, '')
    : '';
  const normalizedArtifactId = typeof artifactId === 'string'
    ? artifactId.trim()
    : '';
  const inferredArtifactId = normalizedArtifactId || inferArtifactId(url);

  if (!normalizedBackendHttpUrl || !inferredArtifactId) {
    return null;
  }

  return `${normalizedBackendHttpUrl}/api/artifacts/${encodeURIComponent(inferredArtifactId)}`;
}

async function fetchArtifactImage({
  artifactId,
  url,
  backendHttpUrl,
  headers = {},
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== 'function') {
    return { success: false, error: 'Artifact fetch support is unavailable.' };
  }

  const artifactUrl = buildArtifactFetchUrl({
    backendHttpUrl,
    artifactId,
    url,
  });
  if (!artifactUrl) {
    return { success: false, error: 'Artifact ID is required.' };
  }

  const response = await fetchImpl(artifactUrl, {
    method: 'GET',
    headers,
  });
  if (!response || response.ok !== true) {
    const errorText = typeof response?.text === 'function'
      ? await response.text()
      : '';
    return {
      success: false,
      error: `Artifact fetch failed (${response?.status || 'unknown'}): ${errorText || 'Unknown error'}`,
    };
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const contentType = typeof response.headers?.get === 'function'
    ? (response.headers.get('content-type') || 'image/jpeg')
    : 'image/jpeg';

  return {
    success: true,
    dataUrl: `data:${contentType};base64,${base64}`,
    contentType,
  };
}

module.exports = {
  fetchArtifactImage,
};
