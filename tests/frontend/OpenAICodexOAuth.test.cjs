/** @jest-environment node */

const http = require('http');
const net = require('net');
const {
  loginOpenAICodexOAuth,
} = require('../../frontend/src/main/app/openai_codex_oauth.cjs');
const {
  mainHostSkin,
} = require('../../frontend/src/main/app/main_host_skin.cjs');

function createJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

function requestCallback(path) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let raw = '';
    const finish = (error = null) => {
      if (settled) {
        return;
      }
      if (error && !raw) {
        settled = true;
        reject(error);
        return;
      }
      if (!raw) {
        settled = true;
        reject(new Error('OAuth callback did not return a response.'));
        return;
      }
      settled = true;
      const [head, body = ''] = raw.split('\r\n\r\n');
      const statusCode = Number(head.match(/^HTTP\/1\.1\s+(\d+)/)?.[1]) || null;
      resolve({ statusCode, body });
    };

    const socket = net.createConnection({ host: '127.0.0.1', port: 1455 }, () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:1455\r\nConnection: close\r\n\r\n`);
    });
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      raw += chunk;
    });
    socket.on('error', (error) => {
      finish(error);
    });
    socket.on('close', () => {
      finish();
    });
  });
}

describe('openai_codex_oauth', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

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

  test('loginOpenAICodexOAuth cancels callback wait when browser launch fails', async () => {
    jest.useFakeTimers();
    const openExternal = jest.fn(async () => {
      throw new Error('launcher unavailable');
    });
    const fetchImpl = jest.fn();

    await expect(loginOpenAICodexOAuth({ openExternal, fetchImpl })).rejects.toThrow(
      'Failed to open browser for Codex login: launcher unavailable',
    );

    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('loginOpenAICodexOAuth escapes oauth callback error descriptions in browser response', async () => {
    const rawDescription = '<script>alert("x")</script>';
    const fetchImpl = jest.fn();
    let callbackResponse = null;
    const openExternal = jest.fn(async (authUrl) => {
      const parsed = new URL(authUrl);
      const state = parsed.searchParams.get('state');
      expect(state).toBeTruthy();

      callbackResponse = await requestCallback(
        `/auth/callback?state=${encodeURIComponent(state)}&error=access_denied&error_description=${encodeURIComponent(rawDescription)}`,
      );
    });

    await expect(loginOpenAICodexOAuth({ openExternal, fetchImpl })).rejects.toThrow(
      `OpenAI Codex OAuth login failed: ${rawDescription}`,
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(callbackResponse.statusCode).toBe(400);
    expect(callbackResponse.body).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(callbackResponse.body).not.toContain(rawDescription);
  });

  test('loginOpenAICodexOAuth uses host skin copy for token exchange callback failures', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'token service failed',
    }));
    let callbackResponse = null;
    const openExternal = jest.fn(async (authUrl) => {
      const parsed = new URL(authUrl);
      const state = parsed.searchParams.get('state');
      expect(state).toBeTruthy();

      callbackResponse = await requestCallback(
        `/auth/callback?state=${encodeURIComponent(state)}&code=test-code`,
      );
    });

    await expect(loginOpenAICodexOAuth({
      openExternal,
      fetchImpl,
      copy: mainHostSkin.openAICodexOAuth,
    })).rejects.toThrow('OpenAI OAuth token exchange failed (500): token service failed');

    expect(callbackResponse.statusCode).toBe(500);
    expect(callbackResponse.body).toContain('Return to WindieOS for details.');
  });
});
