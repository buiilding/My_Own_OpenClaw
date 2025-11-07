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
 * @param {Function} props.onConfigChange - Callback function to save updated settings.
 * @param {string} props.saveStatus - The current status of the save operation.
 */
function SettingsPanel({ config, availableModels, onConfigChange, saveStatus = 'idle' }) {
  const [modelMode, setModelMode] = useState('online');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (config) {
      setModelMode(config.model_mode || 'online');
      setSelectedModelId(config.selected_model_id || '');
      setSelectedProvider(config.model_provider || '');
      setIsInitialized(true);
    }
  }, [config]);

  // This effect is now responsible for reporting changes up to the parent component.
  // Only sync changes after initialization to prevent unnecessary updates on first load.
  useEffect(() => {
    if (!config || !isInitialized) return;

    const updatedConfig = {
      ...config,
      model_mode: modelMode,
      selected_model_id: selectedModelId,
      model_provider: selectedProvider,
    };

    // To prevent sending a save request for every single character change in the
    // username input, we'll only call onConfigChange if the config has actually changed.
    if (JSON.stringify(updatedConfig) !== JSON.stringify(config)) {
      onConfigChange(updatedConfig);
    }
  }, [modelMode, selectedModelId, selectedProvider, config, onConfigChange, isInitialized]);

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
      <form onSubmit={(e) => e.preventDefault()}>
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
          <p>
            <strong>API Keys:</strong> API keys are managed via environment
            variables. Please see the documentation for details.
          </p>
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
    preferences: PropTypes.shape({}),
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
  onConfigChange: PropTypes.func.isRequired,
  saveStatus: PropTypes.oneOf(['idle', 'saving', 'success', 'error']),
};

SettingsPanel.defaultProps = {
  availableModels: { local: [], online: [] },
};

export default SettingsPanel;

