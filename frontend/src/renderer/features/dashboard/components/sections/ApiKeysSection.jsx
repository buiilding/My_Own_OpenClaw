/**
 * Provides the api keys section module for the renderer UI.
 */

import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DesktopProviderCredentialRuntime } from '../../../../app/runtime/desktopProviderCredentialRuntime';
import { providerApiKeysPropType } from './providerApiKeysPropTypes';

const PROVIDER_API_KEY_CONTROLS = DesktopProviderCredentialRuntime.getProviderApiKeySpecs();

function ApiKeysSection({ providerApiKeys, onProviderApiKeysChange }) {
  const [expanded, setExpanded] = useState(false);
  const normalizedProviderApiKeys = useMemo(
    () => DesktopProviderCredentialRuntime.normalizeProviderApiKeys(providerApiKeys),
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
    <section className="model-surface-api-keys" data-testid="models-api-keys-section">
      <button
        type="button"
        className="model-surface-api-keys-toggle"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls="models-api-keys-content"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>API Keys</span>
      </button>

      {expanded ? (
        <div id="models-api-keys-content" className="model-surface-api-keys-content">
          {PROVIDER_API_KEY_CONTROLS.map((provider) => {
            const value = normalizedProviderApiKeys[provider.id] || { enabled: false, api_key: '' };
            return (
              <div key={provider.id} className="model-surface-api-provider-row">
                <div className="model-surface-api-provider-head">
                  <div className="model-surface-api-provider-title-wrap">
                    <h3>{provider.title}</h3>
                    <p>{provider.description}</p>
                  </div>

                  <label className={`model-surface-api-toggle${value.enabled ? ' checked' : ''}`.trim()}>
                    <input
                      type="checkbox"
                      checked={value.enabled}
                      aria-label={`${provider.title} toggle`}
                      onChange={(event) => {
                        updateProviderApiKeys(provider.id, { enabled: event.target.checked });
                      }}
                    />
                    <span className="model-surface-api-toggle-thumb" />
                  </label>
                </div>

                <input
                  type="password"
                  className="model-surface-api-input"
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
  providerApiKeys: providerApiKeysPropType,
  onProviderApiKeysChange: PropTypes.func.isRequired,
};

export default ApiKeysSection;
