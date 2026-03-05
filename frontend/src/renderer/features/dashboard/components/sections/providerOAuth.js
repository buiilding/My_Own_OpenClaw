const DEFAULT_PROVIDER_OAUTH = Object.freeze({
  openai_codex: Object.freeze({
    connected: false,
    access_token: '',
    refresh_token: '',
    expires_at: null,
    profile_id: '',
  }),
});

export const PROVIDER_OAUTH_SPECS = [
  {
    id: 'openai_codex',
    title: 'OpenAI Codex OAuth',
    description: 'Use ChatGPT/Codex OAuth for supported OpenAI Codex models.',
    loginLabel: 'Login with Codex',
    logoutLabel: 'Sign Out',
  },
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeProviderOAuth(input) {
  const source = isPlainObject(input) ? input : {};
  const normalized = {};

  for (const [provider, defaults] of Object.entries(DEFAULT_PROVIDER_OAUTH)) {
    const candidate = isPlainObject(source[provider]) ? source[provider] : {};
    const expiresAt = (
      typeof candidate.expires_at === 'number'
      && Number.isFinite(candidate.expires_at)
    ) ? candidate.expires_at : defaults.expires_at;
    normalized[provider] = {
      connected: candidate.connected === true,
      access_token: typeof candidate.access_token === 'string'
        ? candidate.access_token
        : defaults.access_token,
      refresh_token: typeof candidate.refresh_token === 'string'
        ? candidate.refresh_token
        : defaults.refresh_token,
      expires_at: expiresAt,
      profile_id: typeof candidate.profile_id === 'string'
        ? candidate.profile_id
        : defaults.profile_id,
    };
  }

  return normalized;
}
