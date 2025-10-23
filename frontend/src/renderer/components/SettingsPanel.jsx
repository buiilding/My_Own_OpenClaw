import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * A panel for displaying and editing application settings.
 *
 * @param {object} props - The component's props.
 * @param {object} props.config - The current application configuration.
 * @param {Function} props.onSave - Callback function to save updated settings.
 */
function SettingsPanel({ config, onSave }) {
  const [activeProvider, setActiveProvider] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    if (config) {
      setActiveProvider(config.active_provider || 'openai');
      setUserName(config.preferences?.user_name || 'User');
    }
  }, [config]);

  const handleSave = (e) => {
    e.preventDefault();
    const updatedConfig = {
      ...config,
      active_provider: activeProvider,
      preferences: {
        ...config.preferences,
        user_name: userName,
      },
    };
    onSave(updatedConfig);
    // Here you might want to show a "Saved!" confirmation message
  };

  if (!config) {
    return <div>Loading settings...</div>;
  }

  return (
    <div className="settings-panel">
      <h2>Settings</h2>
      <form onSubmit={handleSave}>
        <div className="form-group">
          <label htmlFor="llm-provider">Active LLM Provider</label>
          <select
            id="llm-provider"
            value={activeProvider}
            onChange={(e) => setActiveProvider(e.target.value)}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google</option>
            <option value="ollama">Ollama (Local)</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="user-name">User Name</label>
          <input
            id="user-name"
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
        </div>

        <div className="form-group">
            <p>
                <strong>API Keys:</strong> API keys are managed via environment variables.
                Please see the documentation for details.
            </p>
        </div>

        <button type="submit" className="save-button">
          Save Settings
        </button>
      </form>
    </div>
  );
}

SettingsPanel.propTypes = {
  config: PropTypes.shape({
    active_provider: PropTypes.string,
    preferences: PropTypes.shape({
      user_name: PropTypes.string,
    }),
  }),
  onSave: PropTypes.func.isRequired,
};

export default SettingsPanel;
