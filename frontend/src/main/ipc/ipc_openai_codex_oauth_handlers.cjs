/**
 * Handles ipc openai codex oauth handlers events for the Electron main process.
 */

function registerOpenAICodexOAuthHandlers({
  ipcMain,
  loginOpenAICodexOAuth,
  logoutOpenAICodexOAuth,
  openExternal,
  copy = null,
}) {
  ipcMain.handle('openai-codex-oauth-login', async () => {
    try {
      const result = await loginOpenAICodexOAuth({
        openExternal,
        ...(copy ? { copy } : {}),
      });
      return {
        success: true,
        token: result.token,
        auth_path: result.authPath,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error?.message || error || 'OpenAI Codex OAuth login failed.'),
      };
    }
  });

  ipcMain.handle('openai-codex-oauth-logout', async () => {
    try {
      const result = await logoutOpenAICodexOAuth();
      return {
        success: true,
        removed: result.removed,
        auth_path: result.authPath,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error?.message || error || 'OpenAI Codex OAuth sign-out failed.'),
      };
    }
  });
}

module.exports = {
  registerOpenAICodexOAuthHandlers,
};
