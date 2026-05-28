function isDebugStreamTraceEnabled() {
  return process.env.WINDIE_DEBUG_STREAM_EVENTS === '1';
}

function trackRendererWindow({
  win,
  rendererWindows,
  getResponseOverlayPhase,
  getReplayEvents = null,
  buildConversationEvent = null,
}) {
  if (!win || (win.isDestroyed && win.isDestroyed())) {
    return;
  }
  rendererWindows.add(win);
  const webContents = win.webContents;
  const canSubscribeToLoad = Boolean(
    webContents
      && typeof webContents.on === 'function'
      && typeof webContents.removeListener === 'function',
  );
  const canCheckLoadingState = Boolean(
    webContents && typeof webContents.isLoadingMainFrame === 'function',
  );
  const syncRendererRuntimeState = () => {
    if (!win || win.isDestroyed()) {
      return;
    }
    if (!webContents || typeof webContents.send !== 'function') {
      return;
    }
    webContents.send('response-overlay-phase', {
      phase: getResponseOverlayPhase(),
      source: 'sync',
    });
    if (typeof getReplayEvents !== 'function') {
      return;
    }
    const replayEvents = getReplayEvents();
    if (!Array.isArray(replayEvents) || replayEvents.length === 0) {
      return;
    }
    for (const replayEvent of replayEvents) {
      if (typeof buildConversationEvent === 'function') {
        const conversationEvent = buildConversationEvent(replayEvent);
        if (conversationEvent) {
          webContents.send('windie:conversation-event', conversationEvent);
        }
      }
    }
  };
  if (canSubscribeToLoad) {
    webContents.on('did-finish-load', syncRendererRuntimeState);
  }
  if (!canCheckLoadingState || !webContents.isLoadingMainFrame()) {
    syncRendererRuntimeState();
  }
  if (typeof win.on !== 'function') {
    return;
  }
  win.on('closed', () => {
    if (canSubscribeToLoad) {
      webContents.removeListener('did-finish-load', syncRendererRuntimeState);
    }
    rendererWindows.delete(win);
  });
}

function broadcastToRenderers({
  rendererWindows,
  channel,
  payload,
  sourceWebContents = null,
}) {
  let deliveredCount = 0;
  for (const win of rendererWindows) {
    if (!win || win.isDestroyed()) {
      rendererWindows.delete(win);
      continue;
    }
    if (sourceWebContents && win.webContents === sourceWebContents) {
      continue;
    }
    win.webContents.send(channel, payload);
    deliveredCount += 1;
  }
  if (isDebugStreamTraceEnabled() && channel === 'windie:conversation-event' && payload && typeof payload === 'object') {
    const eventType = typeof payload.type === 'string' ? payload.type : 'unknown';
    const turnRef = typeof payload.turn_ref === 'string' ? payload.turn_ref : '-';
    const conversationRef = typeof payload.conversation_ref === 'string' ? payload.conversation_ref : '-';
    console.log(
      `[IPC Bridge] [StreamTrace][main][broadcast] channel=${channel} type=${eventType} turn=${turnRef} conv=${conversationRef} renderer_count=${deliveredCount}`,
    );
  }
}

module.exports = {
  broadcastToRenderers,
  trackRendererWindow,
};
