const crypto = require('crypto');
const http = require('http');

const OPENAI_CODEX_CLIENT_ID = process.env.OPENAI_CODEX_CLIENT_ID || 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_AUTH_ISSUER = (process.env.OPENAI_CODEX_AUTH_ISSUER || 'https://auth.openai.com').replace(/\/+$/, '');
const OPENAI_CODEX_LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const OPENAI_CODEX_CALLBACK_PORT = 1455;
const OPENAI_CODEX_CALLBACK_PATH = '/auth/callback';
const OPENAI_CODEX_ORIGINATOR = process.env.OPENAI_CODEX_ORIGINATOR || 'codex_cli_rs';
const OPENAI_CODEX_SCOPE = 'openid profile email offline_access api.model.audio.request';

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function generatePkceCodes() {
  const verifier = base64Url(crypto.randomBytes(64));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function generateState() {
  return base64Url(crypto.randomBytes(32));
}

function buildAuthorizeUrl({ issuer, clientId, redirectUri, codeChallenge, state }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: OPENAI_CODEX_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state,
    originator: OPENAI_CODEX_ORIGINATOR,
  });
  return `${issuer}/oauth/authorize?${params.toString()}`;
}

function parseJwtClaims(jwtToken) {
  if (typeof jwtToken !== 'string') {
    return {};
  }
  const parts = jwtToken.split('.');
  if (parts.length < 2 || !parts[1]) {
    return {};
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') {
      return {};
    }
    return payload;
  } catch (_error) {
    return {};
  }
}

function resolveExpiresAt(accessToken, expiresIn) {
  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0) {
    return Date.now() + Math.floor(expiresIn * 1000);
  }
  const claims = parseJwtClaims(accessToken);
  if (typeof claims.exp === 'number' && Number.isFinite(claims.exp) && claims.exp > 0) {
    return Math.floor(claims.exp * 1000);
  }
  return null;
}

function resolveAccountId(idToken, accessToken) {
  const authClaims = parseJwtClaims(idToken)['https://api.openai.com/auth'];
  if (authClaims && typeof authClaims === 'object' && typeof authClaims.chatgpt_account_id === 'string') {
    const accountId = authClaims.chatgpt_account_id.trim();
    if (accountId) {
      return accountId;
    }
  }
  const accessAuthClaims = parseJwtClaims(accessToken)['https://api.openai.com/auth'];
  if (accessAuthClaims && typeof accessAuthClaims === 'object' && typeof accessAuthClaims.chatgpt_account_id === 'string') {
    const accountId = accessAuthClaims.chatgpt_account_id.trim();
    if (accountId) {
      return accountId;
    }
  }
  return '';
}

function buildTokenPayload(tokens) {
  const accessToken = typeof tokens.access_token === 'string' ? tokens.access_token.trim() : '';
  const refreshToken = typeof tokens.refresh_token === 'string' ? tokens.refresh_token.trim() : '';
  const idToken = typeof tokens.id_token === 'string' ? tokens.id_token.trim() : '';
  if (!accessToken || !refreshToken || !idToken) {
    throw new Error('OAuth token exchange returned an incomplete token payload.');
  }

  const accountId = resolveAccountId(idToken, accessToken);
  return {
    connected: true,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: resolveExpiresAt(accessToken, tokens.expires_in),
    profile_id: accountId ? `openai-codex:${accountId}` : 'openai-codex:default',
  };
}

async function exchangeCodeForTokens({ issuer, clientId, redirectUri, codeVerifier, code, fetchImpl }) {
  const response = await fetchImpl(`${issuer}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch (_error) {
      detail = '';
    }
    throw new Error(`OpenAI OAuth token exchange failed (${response.status}): ${detail || 'unknown error'}`);
  }

  return await response.json();
}

function createCallbackResponse(content, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html><body><pre>${content}</pre></body></html>`,
  };
}

async function waitForOAuthCallback({ server, state, codeVerifier, redirectUri, issuer, clientId, timeoutMs, fetchImpl, cancelSignal }) {
  return await new Promise((resolve, reject) => {
    let settled = false;
    let timeoutHandle = null;
    let cleanupCancelListener = () => {};
    const finish = (error, tokenPayload) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      cleanupCancelListener();
      try {
        server.close();
      } catch (_error) {
        // no-op
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(tokenPayload);
    };

    timeoutHandle = setTimeout(() => {
      finish(new Error('OpenAI Codex login timed out before completing in the browser.'));
    }, timeoutMs);

    if (cancelSignal) {
      const handleCancel = () => {
        finish(new Error('OpenAI Codex login was cancelled before completing in the browser.'));
      };
      if (cancelSignal.aborted) {
        handleCancel();
      } else if (typeof cancelSignal.addEventListener === 'function') {
        cancelSignal.addEventListener('abort', handleCancel, { once: true });
        cleanupCancelListener = () => cancelSignal.removeEventListener('abort', handleCancel);
      }
    }

    server.on('request', async (req, res) => {
      if (settled) {
        res.writeHead(410, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Login flow already completed.');
        return;
      }

      const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${OPENAI_CODEX_CALLBACK_PORT}`);
      if (requestUrl.pathname !== OPENAI_CODEX_CALLBACK_PATH) {
        const notFound = createCallbackResponse('Not Found', 404);
        res.writeHead(notFound.statusCode, notFound.headers);
        res.end(notFound.body);
        return;
      }

      const callbackState = (requestUrl.searchParams.get('state') || '').trim();
      if (!callbackState || callbackState !== state) {
        const invalidState = createCallbackResponse('State mismatch.', 400);
        res.writeHead(invalidState.statusCode, invalidState.headers);
        res.end(invalidState.body);
        finish(new Error('OAuth callback state mismatch.'));
        return;
      }

      const oauthError = (requestUrl.searchParams.get('error') || '').trim();
      if (oauthError) {
        const oauthDescription = (requestUrl.searchParams.get('error_description') || '').trim();
        const message = oauthDescription || oauthError;
        const callbackError = createCallbackResponse(`OAuth login failed: ${message}`, 400);
        res.writeHead(callbackError.statusCode, callbackError.headers);
        res.end(callbackError.body);
        finish(new Error(`OpenAI Codex OAuth login failed: ${message}`));
        return;
      }

      const code = (requestUrl.searchParams.get('code') || '').trim();
      if (!code) {
        const missingCode = createCallbackResponse('Missing authorization code.', 400);
        res.writeHead(missingCode.statusCode, missingCode.headers);
        res.end(missingCode.body);
        finish(new Error('OAuth callback did not include an authorization code.'));
        return;
      }

      try {
        const rawTokens = await exchangeCodeForTokens({
          issuer,
          clientId,
          redirectUri,
          codeVerifier,
          code,
          fetchImpl,
        });
        const tokenPayload = buildTokenPayload(rawTokens);
        const success = createCallbackResponse('Codex login complete. You can close this tab.');
        res.writeHead(success.statusCode, success.headers);
        res.end(success.body);
        finish(null, tokenPayload);
      } catch (error) {
        const tokenError = createCallbackResponse('Token exchange failed. Return to WindieOS for details.', 500);
        res.writeHead(tokenError.statusCode, tokenError.headers);
        res.end(tokenError.body);
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

async function loginOpenAICodexOAuth(options = {}) {
  const openExternal = options.openExternal;
  const fetchImpl = options.fetchImpl || fetch;
  if (typeof openExternal !== 'function') {
    throw new Error('Browser launcher is unavailable in Electron main process.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('HTTP client is unavailable for OAuth token exchange.');
  }

  const clientId = OPENAI_CODEX_CLIENT_ID;
  const issuer = OPENAI_AUTH_ISSUER;
  const { verifier, challenge } = generatePkceCodes();
  const state = generateState();
  const redirectUri = `http://127.0.0.1:${OPENAI_CODEX_CALLBACK_PORT}${OPENAI_CODEX_CALLBACK_PATH}`;
  const authUrl = buildAuthorizeUrl({
    issuer,
    clientId,
    redirectUri,
    codeChallenge: challenge,
    state,
  });

  const server = await new Promise((resolve, reject) => {
    const next = http.createServer();
    next.once('error', (error) => {
      reject(error);
    });
    next.listen(OPENAI_CODEX_CALLBACK_PORT, '127.0.0.1', () => {
      resolve(next);
    });
  });

  const callbackAbortController = new AbortController();
  const waitForCallbackPromise = waitForOAuthCallback({
    server,
    state,
    codeVerifier: verifier,
    redirectUri,
    issuer,
    clientId,
    timeoutMs: OPENAI_CODEX_LOGIN_TIMEOUT_MS,
    fetchImpl,
    cancelSignal: callbackAbortController.signal,
  });

  try {
    await openExternal(authUrl);
  } catch (error) {
    callbackAbortController.abort();
    await waitForCallbackPromise.catch(() => {});
    throw new Error(`Failed to open browser for Codex login: ${String(error?.message || error)}`);
  }

  const token = await waitForCallbackPromise;
  return { token, authPath: null };
}

async function logoutOpenAICodexOAuth() {
  return { authPath: null, removed: 1 };
}

exports.loginOpenAICodexOAuth = loginOpenAICodexOAuth;
exports.logoutOpenAICodexOAuth = logoutOpenAICodexOAuth;
