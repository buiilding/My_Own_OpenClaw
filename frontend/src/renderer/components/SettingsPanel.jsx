import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../styles/SettingsPanel.css';

/**
 * A feedback component to show the status of the save operation.
 */
const SaveStatusFeedback = ({ status }) => {
  if (status === 'idle') return null;

  const messages = {
    saving: 'Saving...',
    success: 'Settings saved successfully!',
    error: 'Error: Could not save settings.',
  };

  const colors = {
    saving: '#3b82f6', // blue-500
    success: '#22c55e', // green-500
    error: '#ef4444', // red-500
  };

  return (
    <div className="save-status" style={{ color: colors[status] }}>
      {messages[status]}
    </div>
  );
};

SaveStatusFeedback.propTypes = {
  status: PropTypes.oneOf(['idle', 'saving', 'success', 'error']).isRequired,
};

/**
 * A panel for displaying and editing application settings.
 *
 * @param {object} props - The component's props.
 * @param {object} props.config - The current application configuration.
 * @param {Function} props.onSave - Callback function to save updated settings.
 * @param {string} props.saveStatus - The current status of the save operation.
 */
function SettingsPanel({ config, onSave, saveStatus = 'idle' }) {
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
    if (saveStatus === 'saving') return; // Prevent multiple saves

    const updatedConfig = {
      ...config,
      active_provider: activeProvider,
      preferences: {
        ...(config.preferences || {}),
        user_name: userName,
      },
    };
    onSave(updatedConfig);
  };

  if (!config) {
    return <div>Loading settings...</div>;
  }

  const isSaving = saveStatus === 'saving';

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
            disabled={isSaving}
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
            disabled={isSaving}
          />
        </div>

        <div className="form-group">
          <p>
            <strong>API Keys:</strong> API keys are managed via environment
            variables. Please see the documentation for details.
          </p>
        </div>

        <div className="save-container">
          <button type="submit" className="save-button" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
          <SaveStatusFeedback status={saveStatus} />
        </div>
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
  saveStatus: PropTypes.oneOf(['idle', 'saving', 'success', 'error']),
};

export default SettingsPanel;
