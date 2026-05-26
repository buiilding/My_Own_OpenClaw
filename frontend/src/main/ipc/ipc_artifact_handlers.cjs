function registerArtifactHandlers({
  ipcMain,
  uploadArtifact,
  fetchArtifactImage,
  ensureInstallAuthState,
  getBackendHttpUrl,
  buildInstallAuthHeaders,
}) {
  ipcMain.handle('upload-artifact', async (_event, payload) => uploadArtifact({
    ...(payload || {}),
    backendHttpUrl: getBackendHttpUrl(),
    headers: buildInstallAuthHeaders(),
  }));

  ipcMain.handle('fetch-artifact-image', async (_event, payload) => {
    try {
      await ensureInstallAuthState();
      return await fetchArtifactImage({
        ...(payload || {}),
        backendHttpUrl: getBackendHttpUrl(),
        headers: buildInstallAuthHeaders(),
      });
    } catch (error) {
      return {
        success: false,
        error: String(error?.message || error || 'Failed to fetch artifact image.'),
      };
    }
  });
}

module.exports = {
  registerArtifactHandlers,
};
