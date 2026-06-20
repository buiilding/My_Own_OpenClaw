/**
 * Coordinates the ipc runtime helpers for the Electron main process.
 */

const {
  resolveBackendOverlayPhaseTransition,
} = require('./ipc_overlay_phase_events.cjs');
const {
  broadcastTypedBackendEvent,
} = require('./ipc_backend_event_channels.cjs');
const {
  isDebugFlagEnabled,
  isExactDebugFlagEnabled,
} = require('../app/debug_env.cjs');

const SCRIPTED_PROVIDER_MODEL = Object.freeze({
  id: 'scripted-runtime',
  runtime_model_id: 'scripted-runtime',
  provider: 'scripted',
  display_name: 'Scripted Runtime',
  supports_thinking: false,
  family_id: 'scripted::scripted-runtime',
  family_label: 'Scripted Runtime',
  default_model_id: 'scripted-runtime',
  capabilities: Object.freeze({
    supports_native_web_search: false,
  }),
  supports_native_web_search: false,
  context_window: 32768,
  description: 'Dev-only deterministic model for validating streaming, image, and tool paths.',
  strengths: Object.freeze(['Deterministic', 'Tools', 'Streaming', 'Images']),
  latency: 'instant',
  input_price: 'Free',
  output_price: 'Free',
});

function isDebugStreamTraceEnabled() {
  return isDebugFlagEnabled('streamEvents');
}

function isDebugToolScreenshotEnabled() {
  return isDebugFlagEnabled('toolScreenshot');
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

function isScriptedProviderDevModelEnabled(env = process.env) {
  return isExactDebugFlagEnabled('scriptedProvider', '1', env);
}

function withScriptedDevModel(data, env = process.env) {
  if (!isScriptedProviderDevModelEnabled(env)) {
    return data;
  }
  if (!data || typeof data !== 'object' || data.type !== 'models-listed') {
    return data;
  }
  const payload = data.payload && typeof data.payload === 'object' && !Array.isArray(data.payload)
    ? data.payload
    : null;
  if (!payload) {
    return data;
  }
  const onlineKey = Array.isArray(payload.online) ? 'online' : (
    Array.isArray(payload.online_models) ? 'online_models' : null
  );
  if (!onlineKey) {
    return data;
  }
  const onlineModels = payload[onlineKey];
  const hasScriptedModel = onlineModels.some((model) => (
    model
    && typeof model === 'object'
    && model.provider === SCRIPTED_PROVIDER_MODEL.provider
    && model.id === SCRIPTED_PROVIDER_MODEL.id
  ));
  if (hasScriptedModel) {
    return data;
  }
  return {
    ...data,
    payload: {
      ...payload,
      [onlineKey]: [
        ...onlineModels,
        { ...SCRIPTED_PROVIDER_MODEL },
      ],
    },
  };
}

async function runBeforeOverlayQueryCapture({
  webContents,
  onBeforeOverlayQueryCapture,
  log,
}) {
  if (typeof onBeforeOverlayQueryCapture !== 'function') {
    return;
  }
  if (resolveRendererViewFromWebContents(webContents) !== 'minimal-chat-pill') {
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

async function uploadArtifact({ base64, contentType, filename, backendHttpUrl, headers = {} }) {
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
      headers,
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
  broadcastToRenderers,
  traceBackendEvent = null,
  log,
}) {
  const rendererData = withScriptedDevModel(data);
  if (isDebugStreamTraceEnabled()) {
    log(`[StreamTrace][main][recv] ${buildBackendEventTraceSummary(rendererData)}`);
  }
  if (typeof traceBackendEvent === 'function') {
    traceBackendEvent(rendererData);
  }
  if (rendererData && typeof rendererData === 'object') {
    if (rendererData.session_id) {
      setCurrentSessionId(rendererData.session_id);
    }
    if (rendererData.user_id) {
      setCurrentServerUserId(rendererData.user_id);
    }
    if (rendererData.conversation_ref) {
      setCurrentConversationRef(rendererData.conversation_ref);
    }
  }
  // Only log errors or important message types
  if (rendererData?.type === 'error') {
    log(`Error from agent backend: ${rendererData.payload?.message || 'Unknown error'}`);
  }
  if (rendererData?.type === 'settings-updated' && rendererData.id) {
    resolveSettingsSync(rendererData.id, true);
  } else if (rendererData?.type === 'error' && rendererData.id) {
    resolveSettingsSync(rendererData.id, false);
  }
  const overlayTransition = resolveBackendOverlayPhaseTransition(rendererData, getResponseOverlayPhase());
  if (overlayTransition) {
    setResponseOverlayPhase(
      overlayTransition.phase,
      'backend',
      overlayTransition.metadata,
    );
  }
  broadcastTypedBackendEvent(rendererData, broadcastToRenderers);
}

module.exports = {
  SCRIPTED_PROVIDER_MODEL,
  isScriptedProviderDevModelEnabled,
  processBackendMessageData,
  runBeforeOverlayQueryCapture,
  uploadArtifact,
  withScriptedDevModel,
};
