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
function SettingsPanel({ config, availableModels = { local: [], online: [] }, onConfigChange, saveStatus = 'idle' }) {
  const [modelMode, setModelMode] = useState('online');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [modelResetWarning, setModelResetWarning] = useState('');
  // Default to undefined so we can distinguish between "not loaded" and "false"
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [speechModeEnabled, setSpeechModeEnabled] = useState(false);

  useEffect(() => {
    if (config) {
      setModelMode(config.model_mode || 'online');
      setSelectedModelId(config.selected_model_id || '');
      setSelectedProvider(config.model_provider || '');
      // Only update local state if config has the value
      if (config.voice_mode_enabled !== undefined) {
        setVoiceModeEnabled(config.voice_mode_enabled);
      }
      if (config.speech_mode_enabled !== undefined) {
        setSpeechModeEnabled(config.speech_mode_enabled);
      }
    }
  }, [config]);

  // This effect is now responsible for reporting changes up to the parent component.
  // Only update config after availableModels are loaded to prevent invalid model selections
  useEffect(() => {
    if (!config || availableModels.local.length === 0 && availableModels.online.length === 0) return;

    // Only send the 5 fields that frontend manages - don't spread the full config
    const updatedConfig = {
      model_mode: modelMode,
      selected_model_id: selectedModelId,
      model_provider: selectedProvider,
      voice_mode_enabled: voiceModeEnabled,
      speech_mode_enabled: speechModeEnabled,
    };

    // To prevent sending a save request for every single character change in the
    // username input, we'll only call onConfigChange if the config has actually changed.
    // We check specific fields to avoid false positives/negatives
    const hasChanged = 
      updatedConfig.model_mode !== config.model_mode ||
      updatedConfig.selected_model_id !== config.selected_model_id ||
      updatedConfig.model_provider !== config.model_provider ||
      updatedConfig.voice_mode_enabled !== config.voice_mode_enabled ||
      updatedConfig.speech_mode_enabled !== config.speech_mode_enabled;

    if (hasChanged) {
      onConfigChange(updatedConfig);
    }
  }, [modelMode, selectedModelId, selectedProvider, voiceModeEnabled, speechModeEnabled, config, onConfigChange, availableModels]);

  const isSaving = saveStatus === 'saving';

  // Get the current list of models based on mode
  const currentModels = modelMode === 'local'
    ? availableModels.local
    : availableModels.online;

  // Find the selected model to get its provider if not set, but only after models are loaded
  useEffect(() => {
    // Only validate after availableModels are loaded
    if (availableModels.local.length === 0 && availableModels.online.length === 0) return;

    if (selectedModelId && currentModels.length > 0) {
      const model = currentModels.find(m => m.id === selectedModelId);
      if (model) {
        // Model exists, update provider if needed
        if (model.provider !== selectedProvider) {
          setSelectedProvider(model.provider);
        }
      } else {
        // Model doesn't exist in available models, reset to first available model
        const warningMsg = `Selected model "${selectedModelId}" is not available. Resetting to default.`;
        console.warn(warningMsg);
        setModelResetWarning(warningMsg);

        if (currentModels.length > 0) {
          const defaultModel = currentModels[0];
          setSelectedModelId(defaultModel.id);
          setSelectedProvider(defaultModel.provider);
        } else {
          // No models available, reset to empty
          setSelectedModelId('');
          setSelectedProvider('');
        }

        // Clear warning after 5 seconds
        setTimeout(() => setModelResetWarning(''), 5000);
      }
    }
  }, [selectedModelId, currentModels, selectedProvider, availableModels]);

  if (!config) {
    return <div>Loading settings...</div>;
  }

  return (
    <div className="settings-panel">
      <h2>Settings</h2>
      {modelResetWarning && (
        <div className="model-reset-warning" style={{
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '4px',
          padding: '8px 12px',
          marginBottom: '16px',
          color: '#92400e',
          fontSize: '14px'
        }}>
          ⚠️ {modelResetWarning}
        </div>
      )}
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
              {currentModels.map((model, index) => {
                // Format display: "model-id (provider)"
                const displayText = `${model.id} (${model.provider})`;
                // Use combination of id and provider for unique key, fallback to index if needed
                const uniqueKey = `${model.id}-${model.provider}-${index}`;
                return (
                  <option key={uniqueKey} value={model.id}>
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

        <div className="form-group">
          <label htmlFor="voice-mode-toggle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', cursor: 'pointer' }}>
            <span><strong>Voice Mode:</strong></span>
            <div className="toggle-switch">
              <input
                type="checkbox"
                id="voice-mode-toggle"
                checked={voiceModeEnabled}
                onChange={(e) => setVoiceModeEnabled(e.target.checked)}
                disabled={isSaving}
                className="toggle-input"
              />
              <span className="toggle-slider"></span>
            </div>
          </label>
        </div>

        <div className="form-group">
          <label htmlFor="speech-mode-toggle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', cursor: 'pointer' }}>
            <span><strong>Speech Mode (TTS):</strong></span>
            <div className="toggle-switch">
              <input
                type="checkbox"
                id="speech-mode-toggle"
                checked={speechModeEnabled}
                onChange={(e) => setSpeechModeEnabled(e.target.checked)}
                disabled={isSaving}
                className="toggle-input"
              />
              <span className="toggle-slider"></span>
            </div>
          </label>
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
    voice_mode_enabled: PropTypes.bool,
    speech_mode_enabled: PropTypes.bool,
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

export default SettingsPanel;
