import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, ChevronRight } from 'lucide-react';

export const DEFAULT_PROVIDER_API_KEYS = Object.freeze({
  openai: Object.freeze({ enabled: false, api_key: '' }),
  anthropic: Object.freeze({ enabled: false, api_key: '' }),
  kimi_coding: Object.freeze({ enabled: false, api_key: '' }),
  google: Object.freeze({ enabled: false, api_key: '' }),
  openrouter: Object.freeze({ enabled: false, api_key: '' }),
  mistral: Object.freeze({ enabled: false, api_key: '' }),
});

const PROVIDER_API_KEY_SPECS = [
  {
    id: 'openai',
    title: 'OpenAI API Key',
    description: 'Enable to use your own OpenAI key.',
    placeholder: 'Enter your OpenAI API Key',
  },
  {
    id: 'anthropic',
    title: 'Anthropic API Key',
    description: 'Enable to use your own Anthropic key.',
    placeholder: 'Enter your Anthropic API Key',
  },
  {
    id: 'kimi_coding',
    title: 'Kimi Code API Key',
    description: 'Enable to use your own Kimi Code key.',
    placeholder: 'Enter your Kimi Code API Key',
  },
  {
    id: 'google',
    title: 'Google API Key',
    description: 'Enable to use your own Google AI Studio key.',
    placeholder: 'Enter your Google API Key',
  },
  {
    id: 'openrouter',
    title: 'OpenRouter API Key',
    description: 'Enable to use your own OpenRouter key.',
    placeholder: 'Enter your OpenRouter API Key',
  },
  {
    id: 'mistral',
    title: 'Mistral API Key',
    description: 'Enable to use your own Mistral key.',
    placeholder: 'Enter your Mistral API Key',
  },
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeProviderApiKeys(input) {
  const source = isPlainObject(input) ? input : {};
  const normalized = {};

  for (const [provider, defaults] of Object.entries(DEFAULT_PROVIDER_API_KEYS)) {
    const candidate = isPlainObject(source[provider]) ? source[provider] : {};
    normalized[provider] = {
      enabled: candidate.enabled === true,
      api_key: typeof candidate.api_key === 'string' ? candidate.api_key : defaults.api_key,
    };
  }

  return normalized;
}

function ApiKeysSection({ providerApiKeys, onProviderApiKeysChange }) {
  const [expanded, setExpanded] = useState(false);
  const normalizedProviderApiKeys = useMemo(
    () => normalizeProviderApiKeys(providerApiKeys),
    [providerApiKeys],
  );

  const updateProviderApiKeys = (provider, patch) => {
    const currentEntry = normalizedProviderApiKeys[provider] || { enabled: false, api_key: '' };
    onProviderApiKeysChange({
      ...normalizedProviderApiKeys,
      [provider]: {
        ...currentEntry,
        ...patch,
      },
    });
  };

  return (
    <section className="clone-model-api-keys" data-testid="models-api-keys-section">
      <button
        type="button"
        className="clone-model-api-keys-toggle"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls="models-api-keys-content"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>API Keys</span>
      </button>

      {expanded ? (
        <div id="models-api-keys-content" className="clone-model-api-keys-content">
          {PROVIDER_API_KEY_SPECS.map((provider) => {
            const value = normalizedProviderApiKeys[provider.id] || { enabled: false, api_key: '' };
            return (
              <div key={provider.id} className="clone-model-api-provider-row">
                <div className="clone-model-api-provider-head">
                  <div className="clone-model-api-provider-title-wrap">
                    <h3>{provider.title}</h3>
                    <p>{provider.description}</p>
                  </div>

                  <label className={`clone-model-api-toggle${value.enabled ? ' checked' : ''}`.trim()}>
                    <input
                      type="checkbox"
                      checked={value.enabled}
                      aria-label={`${provider.title} toggle`}
                      onChange={(event) => {
                        updateProviderApiKeys(provider.id, { enabled: event.target.checked });
                      }}
                    />
                    <span className="clone-model-api-toggle-thumb" />
                  </label>
                </div>

                <input
                  type="password"
                  className="clone-model-api-input"
                  value={value.api_key}
                  onChange={(event) => {
                    updateProviderApiKeys(provider.id, { api_key: event.target.value });
                  }}
                  placeholder={provider.placeholder}
                  disabled={!value.enabled}
                  aria-label={provider.title}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

ApiKeysSection.propTypes = {
  providerApiKeys: PropTypes.shape({
    openai: PropTypes.shape({
      enabled: PropTypes.bool,
      api_key: PropTypes.string,
    }),
    anthropic: PropTypes.shape({
      enabled: PropTypes.bool,
      api_key: PropTypes.string,
    }),
    kimi_coding: PropTypes.shape({
      enabled: PropTypes.bool,
      api_key: PropTypes.string,
    }),
    google: PropTypes.shape({
      enabled: PropTypes.bool,
      api_key: PropTypes.string,
    }),
    openrouter: PropTypes.shape({
      enabled: PropTypes.bool,
      api_key: PropTypes.string,
    }),
    mistral: PropTypes.shape({
      enabled: PropTypes.bool,
      api_key: PropTypes.string,
    }),
  }),
  onProviderApiKeysChange: PropTypes.func.isRequired,
};

export default ApiKeysSection;
