const BACKEND_EVENT_RENDERER_CHANNELS = Object.freeze({
  'models-listed': Object.freeze(['backend-settings-event']),
  'settings-updated': Object.freeze(['backend-settings-event']),
  error: Object.freeze(['backend-settings-event']),
  'client-tool-manifest': Object.freeze(['agent-capability-event']),
  'remote-tool-catalog': Object.freeze(['agent-capability-event']),
  'audio-chunk': Object.freeze(['audio-chunk']),
});

function getRendererChannelsForBackendEvent(event) {
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
    return [];
  }
  return BACKEND_EVENT_RENDERER_CHANNELS[event.type] || [];
}

function broadcastTypedBackendEvent(event, broadcastToRenderers) {
  if (typeof broadcastToRenderers !== 'function') {
    return;
  }
  for (const channel of getRendererChannelsForBackendEvent(event)) {
    broadcastToRenderers(channel, event);
  }
}

module.exports = {
  BACKEND_EVENT_RENDERER_CHANNELS,
  broadcastTypedBackendEvent,
  getRendererChannelsForBackendEvent,
};
