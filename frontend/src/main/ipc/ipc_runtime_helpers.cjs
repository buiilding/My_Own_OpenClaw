const {
  resolveBackendOverlayPhaseTransition,
} = require('./ipc_overlay_phase_events.cjs');

function isDebugStreamTraceEnabled() {
  return process.env.WINDIE_DEBUG_STREAM_EVENTS === '1';
}

function isDebugToolScreenshotEnabled() {
  return process.env.WINDIE_DEBUG_TOOL_SCREENSHOT === '1';
}

function logToolShotDebug(stage, payload) {
  if (!isDebugToolScreenshotEnabled()) {
    return;
  }
  console.log('[ToolShotDebug][main]', stage, payload);
}

function buildBackendEventTraceSummary(data) {
  if (!data || typeof data !== 'object') {
    return 'invalid-event';
  }
  const payload = (
    data.payload && typeof data.payload === 'object' && !Array.isArray(data.payload)
  ) ? data.payload : {};
  const text = typeof payload.text === 'string' ? payload.text : '';
  const finalResponse = typeof payload.final_response === 'string' ? payload.final_response : '';
  const content = typeof payload.content === 'string' ? payload.content : '';
  return [
    `type=${typeof data.type === 'string' ? data.type : 'unknown'}`,
    `turn=${typeof data.turn_ref === 'string' ? data.turn_ref : '-'}`,
    `conv=${typeof data.conversation_ref === 'string' ? data.conversation_ref : '-'}`,
    `text_len=${text.length}`,
    `final_len=${finalResponse.length}`,
    `content_len=${content.length}`,
  ].join(' ');
}

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
  if (type === 'query') {
    delete normalized.attachment_context;
    delete normalized.attachment_filenames;
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

  logToolShotDebug('upload-request', {
    hasBase64: typeof base64 === 'string' && base64.length > 0,
    base64Length: typeof base64 === 'string' ? base64.length : 0,
    contentType: resolvedContentType,
    filename: safeName,
    backendHttpUrl,
  });

  try {
    const buffer = Buffer.from(base64, 'base64');
    const blob = new Blob([buffer], { type: resolvedContentType });
    const form = new FormData();
    form.append('file', blob, safeName);

    const response = await fetch(`${backendHttpUrl}/api/artifacts/`, {
      method: 'POST',
      body: form,
    });

    logToolShotDebug('upload-http-response', {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logToolShotDebug('upload-http-error', {
        status: response.status,
        errorText,
      });
      return { success: false, error: `Upload failed (${response.status}): ${errorText}` };
    }

    const data = await response.json();
    logToolShotDebug('upload-success', {
      artifactId: data?.artifact_id || null,
      url: data?.url || null,
      contentType: data?.content_type || null,
    });
    return { success: true, data };
  } catch (error) {
    logToolShotDebug('upload-exception', {
      error: error.message || String(error),
    });
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
  if (isDebugStreamTraceEnabled()) {
    log(`[StreamTrace][main][recv] ${buildBackendEventTraceSummary(data)}`);
  }
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
  const overlayTransition = resolveBackendOverlayPhaseTransition(data, getResponseOverlayPhase());
  if (overlayTransition) {
    setResponseOverlayPhase(
      overlayTransition.phase,
      'backend',
      overlayTransition.metadata,
    );
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
