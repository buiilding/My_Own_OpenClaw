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
    <div className="save-status" style={{ color: colors[status] }} role="status" aria-live="polite">
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
 * @param {object} props.availableModels - Object with 'local' and 'online' arrays of model objects.
 * @param {Function} props.onSave - Callback function to save updated settings.
 * @param {string} props.saveStatus - The current status of the save operation.
 */
function SettingsPanel({ config, availableModels, onSave, saveStatus = 'idle' }) {
  const [modelMode, setModelMode] = useState('online');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    if (config) {
      setModelMode(config.model_mode || 'online');
      setSelectedModelId(config.selected_model_id || '');
      setSelectedProvider(config.model_provider || '');
      setUserName(config.preferences?.user_name || 'User');
    }
  }, [config]);

  const handleSave = (e) => {
    e.preventDefault();
    if (saveStatus === 'saving') return; // Prevent multiple saves

    const updatedConfig = {
      ...config,
      model_mode: modelMode,
      selected_model_id: selectedModelId,
      model_provider: selectedProvider,
      preferences: {
        ...(config.preferences || {}),
        user_name: userName,
      },
    };

    // The backend now computes llm_model, so we don't send it from the frontend.
    delete updatedConfig.llm_model;

    onSave(updatedConfig);
  };

  const isSaving = saveStatus === 'saving';

  // Get the current list of models based on mode
  const currentModels = modelMode === 'local'
    ? availableModels.local
    : availableModels.online;

  // Find the selected model to get its provider if not set
  useEffect(() => {
    if (selectedModelId) {
      const model = currentModels.find(m => m.id === selectedModelId);
      if (model && model.provider !== selectedProvider) {
        setSelectedProvider(model.provider);
      }
    }
  }, [selectedModelId, currentModels, selectedProvider]);

  if (!config) {
    return <div>Loading settings...</div>;
  }

  return (
    <div className="settings-panel">
      <h2>Settings</h2>
      <form onSubmit={handleSave}>
        <div className="form-group">
          <label>Model Mode</label>
          <div className="mode-toggle">
            <label className="radio-label">
              <input
                type="radio"
                name="model-mode"
                value="online"
                checked={modelMode === 'online'}
                onChange={(e) => {
                  setModelMode(e.target.value);
                  // Reset selection when switching modes
                  setSelectedModelId('');
                  setSelectedProvider('');
                }}
                disabled={isSaving}
              />
              <span>Online (Cloud)</span>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="model-mode"
                value="local"
                checked={modelMode === 'local'}
                onChange={(e) => {
                  setModelMode(e.target.value);
                  // Reset selection when switching modes
                  setSelectedModelId('');
                  setSelectedProvider('');
                }}
                disabled={isSaving}
              />
              <span>Local</span>
            </label>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="model-select">
            {modelMode === 'local' ? 'Local Model' : 'Online Model'}
          </label>
          {currentModels.length === 0 ? (
            <div className="no-models-message">
              {modelMode === 'local'
                ? 'No local models found. Make sure Ollama or LM Studio is running.'
                : 'Loading available models...'}
            </div>
          ) : (
            <select
              id="model-select"
              value={selectedModelId}
              onChange={(e) => {
                const model = currentModels.find(m => m.id === e.target.value);
                setSelectedModelId(e.target.value);
                if (model) {
                  setSelectedProvider(model.provider);
                }
              }}
              disabled={isSaving}
            >
              <option value="">-- Select a model --</option>
              {currentModels.map((model) => {
                // Format display: "model-id (provider)"
                const displayText = `${model.id} (${model.provider})`;
                return (
                  <option key={model.id} value={model.id}>
                    {displayText}
                  </option>
                );
              })}
            </select>
          )}
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
          <button type="submit" className="save-button" disabled={isSaving || !selectedModelId}>
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
    model_mode: PropTypes.oneOf(['local', 'online']),
    selected_model_id: PropTypes.string,
    model_provider: PropTypes.string,
    preferences: PropTypes.shape({
      user_name: PropTypes.string,
    }),
  }),
  availableModels: PropTypes.shape({
    local: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        provider: PropTypes.string.isRequired,
        display_name: PropTypes.string,
      })
    ),
    online: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        provider: PropTypes.string.isRequired,
        display_name: PropTypes.string,
      })
    ),
  }),
  onSave: PropTypes.func.isRequired,
  saveStatus: PropTypes.oneOf(['idle', 'saving', 'success', 'error']),
};

SettingsPanel.defaultProps = {
  availableModels: { local: [], online: [] },
};

export default SettingsPanel;
