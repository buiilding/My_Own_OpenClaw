function handleRendererLog(payload = {}, {
  log = console.log,
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  if (payload.source === 'frontend-interaction') {
    log('[FrontendInteraction][renderer]', payload.entry || {});
    return true;
  }
  log('[RendererLog]', payload);
  return true;
}

module.exports = {
  handleRendererLog,
};
