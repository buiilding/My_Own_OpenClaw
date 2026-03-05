/** @jest-environment node */

const http = require('http');
const {
  loginOpenAICodexOAuth,
} = require('../../frontend/src/main/openai_codex_oauth.cjs');

function createJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

describe('openai_codex_oauth', () => {
  test('loginOpenAICodexOAuth completes browser callback flow without openclaw binary', async () => {
    const accessToken = createJwt({
      exp: Math.floor(Date.now() / 1000) + 1200,
      'https://api.openai.com/auth': { chatgpt_account_id: 'acct_flow' },
    });
    const idToken = createJwt({
      'https://api.openai.com/auth': { chatgpt_account_id: 'acct_flow' },
    });

    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: accessToken,
        refresh_token: 'refresh_flow',
        id_token: idToken,
      }),
    }));

    const openExternal = jest.fn(async (authUrl) => {
      const parsed = new URL(authUrl);
      const state = parsed.searchParams.get('state');
      expect(state).toBeTruthy();

      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:1455/auth/callback?state=${encodeURIComponent(state)}&code=test-code`, (res) => {
          res.resume();
          res.on('end', resolve);
        });
        req.on('error', reject);
      });
    });

    const result = await loginOpenAICodexOAuth({ openExternal, fetchImpl });
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.token.connected).toBe(true);
    expect(result.token.profile_id).toBe('openai-codex:acct_flow');
  });
});
