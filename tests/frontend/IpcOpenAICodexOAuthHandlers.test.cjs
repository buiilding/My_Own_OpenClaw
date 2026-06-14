/**
 * Covers ipc open aicodex oauth handlers. behavior in the frontend test suite.
 */

const {
  registerOpenAICodexOAuthHandlers,
} = require('../../frontend/src/main/ipc/ipc_openai_codex_oauth_handlers.cjs');

function createHarness(overrides = {}) {
  const handlers = {};
  const deps = {
    loginOpenAICodexOAuth: jest.fn(async () => ({
      token: { connected: true, access_token: 'access' },
      authPath: '/tmp/auth.json',
    })),
    logoutOpenAICodexOAuth: jest.fn(async () => ({
      removed: true,
      authPath: '/tmp/auth.json',
    })),
    openExternal: jest.fn(),
    ...overrides,
  };
  const ipcMain = {
    handle: jest.fn((channel, handler) => {
      handlers[channel] = handler;
    }),
  };

  registerOpenAICodexOAuthHandlers({
    ipcMain,
    ...deps,
  });

  return {
    deps,
    handlers,
  };
}

describe('ipc_openai_codex_oauth_handlers', () => {
  test('registers login and logout handlers', () => {
    const { handlers } = createHarness();

    expect(typeof handlers['openai-codex-oauth-login']).toBe('function');
    expect(typeof handlers['openai-codex-oauth-logout']).toBe('function');
  });

  test('returns normalized login success payload', async () => {
    const { deps, handlers } = createHarness();

    const result = await handlers['openai-codex-oauth-login']();

    expect(deps.loginOpenAICodexOAuth).toHaveBeenCalledWith({
      openExternal: deps.openExternal,
    });
    expect(result).toEqual({
      success: true,
      token: { connected: true, access_token: 'access' },
      auth_path: '/tmp/auth.json',
    });
  });

  test('returns normalized logout success payload', async () => {
    const { deps, handlers } = createHarness();

    const result = await handlers['openai-codex-oauth-logout']();

    expect(deps.logoutOpenAICodexOAuth).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      removed: true,
      auth_path: '/tmp/auth.json',
    });
  });

  test('returns normalized login failure payload', async () => {
    const { handlers } = createHarness({
      loginOpenAICodexOAuth: jest.fn(async () => {
        throw new Error('browser blocked');
      }),
    });

    await expect(handlers['openai-codex-oauth-login']()).resolves.toEqual({
      success: false,
      error: 'browser blocked',
    });
  });

  test('returns normalized logout failure payload', async () => {
    const { handlers } = createHarness({
      logoutOpenAICodexOAuth: jest.fn(async () => {
        throw new Error('unlink failed');
      }),
    });

    await expect(handlers['openai-codex-oauth-logout']()).resolves.toEqual({
      success: false,
      error: 'unlink failed',
    });
  });
});
