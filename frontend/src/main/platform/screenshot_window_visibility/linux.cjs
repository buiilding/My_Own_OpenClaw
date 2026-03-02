module.exports = async function withHiddenWindowForScreenshot({ task }) {
  // Linux hide/show is owned by the renderer SurfaceOrchestrator so capture
  // uses one deterministic collapse/restore path instead of double-hiding here.
  return task();
};
