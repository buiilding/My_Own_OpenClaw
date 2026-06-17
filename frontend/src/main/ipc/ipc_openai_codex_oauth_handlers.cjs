/**
 * Handles ipc openai codex oauth handlers events for the Electron main process.
 */

const DEFAULT_LOGIN_FAILURE = 'OAuth login failed.';
const DEFAULT_LOGOUT_FAILURE = 'OAuth sign-out failed.';

function registerOpenAICodexOAuthHandlers({
  ipcMain,
  loginOpenAICodexOAuth,
  logoutOpenAICodexOAuth,
  openExternal,
  copy = null,
}) {
  const oauthCopy = copy || {};
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
        error: String(error?.message || error || oauthCopy.loginFailure || DEFAULT_LOGIN_FAILURE),
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
        error: String(error?.message || error || oauthCopy.logoutFailure || DEFAULT_LOGOUT_FAILURE),
      };
    }
  });
}

module.exports = {
  registerOpenAICodexOAuthHandlers,
};
