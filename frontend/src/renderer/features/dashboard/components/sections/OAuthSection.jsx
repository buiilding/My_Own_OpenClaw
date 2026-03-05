import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  normalizeProviderOAuth,
  PROVIDER_OAUTH_SPECS,
} from './providerOAuth';
import { providerOAuthPropType } from './providerOAuthPropTypes';

function OAuthSection({
  providerOAuth,
  onLogin,
  onLogout,
}) {
  const [expanded, setExpanded] = useState(false);
  const [pendingProvider, setPendingProvider] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const normalizedProviderOAuth = useMemo(
    () => normalizeProviderOAuth(providerOAuth),
    [providerOAuth],
  );

  const runAction = async (providerId, action) => {
    if (pendingProvider) {
      return;
    }
    setPendingProvider(providerId);
    setErrorMessage('');
    try {
      if (action === 'login') {
        await onLogin(providerId);
      } else {
        await onLogout(providerId);
      }
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : String(error);
      setErrorMessage(nextMessage || 'OAuth operation failed.');
    } finally {
      setPendingProvider('');
    }
  };

  return (
    <section className="clone-model-oauth" data-testid="models-oauth-section">
      <button
        type="button"
        className="clone-model-api-keys-toggle"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls="models-oauth-content"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>OAuth</span>
      </button>

      {expanded ? (
        <div id="models-oauth-content" className="clone-model-api-keys-content">
          {PROVIDER_OAUTH_SPECS.map((provider) => {
            const value = normalizedProviderOAuth[provider.id] || { connected: false };
            const isPending = pendingProvider === provider.id;
            const statusClass = value.connected ? 'connected' : 'disconnected';
            return (
              <div key={provider.id} className="clone-model-api-provider-row">
                <div className="clone-model-oauth-row">
                  <div className="clone-model-api-provider-title-wrap">
                    <h3>{provider.title}</h3>
                    <p>{provider.description}</p>
                  </div>
                  <span className={`clone-model-oauth-status ${statusClass}`}>
                    {value.connected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                <div className="clone-model-oauth-actions">
                  <button
                    type="button"
                    className="clone-model-oauth-button"
                    onClick={() => runAction(provider.id, value.connected ? 'logout' : 'login')}
                    disabled={isPending}
                    aria-label={value.connected ? provider.logoutLabel : provider.loginLabel}
                  >
                    {isPending
                      ? 'Working...'
                      : (value.connected ? provider.logoutLabel : provider.loginLabel)}
                  </button>
                </div>
              </div>
            );
          })}
          {errorMessage ? (
            <p className="clone-model-oauth-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

OAuthSection.propTypes = {
  providerOAuth: providerOAuthPropType,
  onLogin: PropTypes.func.isRequired,
  onLogout: PropTypes.func.isRequired,
};

export default OAuthSection;
