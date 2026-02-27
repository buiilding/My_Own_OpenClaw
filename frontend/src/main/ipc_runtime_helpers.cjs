function resolveRendererViewFromWebContents(webContents) {
  if (!webContents || typeof webContents.getURL !== 'function') {
    return null;
  }
  const rawUrl = webContents.getURL();
  if (!rawUrl) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl);
    return parsed.searchParams.get('view');
  } catch (_error) {
    const match = rawUrl.match(/[?&]view=([^&#]+)/);
    if (!match) {
      return null;
    }
    try {
      return decodeURIComponent(match[1]);
    } catch (_decodeError) {
      return match[1];
    }
  }
}

async function runBeforeOverlayQueryCapture({
  webContents,
  onBeforeOverlayQueryCapture,
  log,
}) {
  if (typeof onBeforeOverlayQueryCapture !== 'function') {
    return;
  }
  if (resolveRendererViewFromWebContents(webContents) !== 'chatbox') {
    return;
  }
  try {
    await onBeforeOverlayQueryCapture({
      senderWebContents: webContents,
    });
  } catch (error) {
    log(`Overlay pre-capture hook failed: ${error.message}`);
  }
}

/**
 * Generate a valid user_id from system username or fallback to UUID-based ID.
 * Backend rejects 'default_user', empty, or whitespace-only values.
 */
function generateUserId({
  osUserInfo,
  uuidGenerator,
  log,
}) {
  try {
    const username = osUserInfo()?.username;
    if (username && username.trim() && username !== 'default_user') {
      // Sanitize username to match backend validation pattern (alphanumeric, underscore, hyphen)
      return username.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 128);
    }
  } catch (error) {
    log(`Failed to get system username: ${error.message}`);
  }
  // Fallback: generate UUID-based user_id (backend accepts alphanumeric, underscore, hyphen)
  return `user_${uuidGenerator().replace(/-/g, '_')}`;
}

/**
 * Normalize outbound payloads to backend-supported schema fields.
 */
function normalizeBackendPayload(type, payload) {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const normalized = { ...payload };

  if (type === 'query' || type === 'tool-bundle-result') {
    delete normalized.screenshot_url;
    delete normalized.screenshot_urls;
  }

  return normalized;
}

async function uploadArtifact({ base64, contentType, filename, backendHttpUrl }) {
  if (!base64 || typeof base64 !== 'string') {
    return { success: false, error: 'Missing artifact data' };
  }

  const resolvedContentType = contentType || 'application/octet-stream';
  const ext = resolvedContentType === 'image/png' ? 'png' : 'jpg';
  const safeName = filename && typeof filename === 'string' ? filename : `artifact.${ext}`;

  try {
    const buffer = Buffer.from(base64, 'base64');
    const blob = new Blob([buffer], { type: resolvedContentType });
    const form = new FormData();
    form.append('file', blob, safeName);

    const response = await fetch(`${backendHttpUrl}/api/artifacts/`, {
      method: 'POST',
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Upload failed (${response.status}): ${errorText}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

function processBackendMessageData(data, {
  setCurrentSessionId,
  setCurrentServerUserId,
  setCurrentConversationRef,
  resolveSettingsSync,
  setResponseOverlayPhase,
  getResponseOverlayPhase,
  onMemoryStoreEvent,
  broadcastToRenderers,
  log,
}) {
  if (data && typeof data === 'object') {
    if (data.session_id) {
      setCurrentSessionId(data.session_id);
    }
    if (data.user_id) {
      setCurrentServerUserId(data.user_id);
    }
    if (data.conversation_ref) {
      setCurrentConversationRef(data.conversation_ref);
    }
  }
  // Only log errors or important message types
  if (data.type === 'error') {
    log(`Error from backend: ${data.payload?.message || 'Unknown error'}`);
  }
  if (data.type === 'settings-updated' && data.id) {
    resolveSettingsSync(data.id, true);
  } else if (data.type === 'error' && data.id) {
    resolveSettingsSync(data.id, false);
  }
  if (data.type === 'streaming-response') {
    setResponseOverlayPhase('streaming', 'backend');
  } else if (data.type === 'tool-call' || data.type === 'tool-bundle') {
    setResponseOverlayPhase('tool-call', 'backend');
  } else if (data.type === 'tool-output') {
    setResponseOverlayPhase('awaiting-first-chunk', 'backend');
  } else if (data.type === 'streaming-complete') {
    setResponseOverlayPhase('complete', 'backend');
  } else if (data.type === 'error' && getResponseOverlayPhase() !== 'idle') {
    setResponseOverlayPhase('error', 'backend');
  }
  if (data.type === 'memory-store' && typeof onMemoryStoreEvent === 'function') {
    try {
      onMemoryStoreEvent(data);
    } catch (error) {
      log(`Memory-store side effect failed: ${error.message}`);
    }
  }
  broadcastToRenderers('from-backend', data);
}

module.exports = {
  generateUserId,
  normalizeBackendPayload,
  processBackendMessageData,
  runBeforeOverlayQueryCapture,
  uploadArtifact,
};
