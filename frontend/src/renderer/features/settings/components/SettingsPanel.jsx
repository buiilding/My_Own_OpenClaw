import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../../styles/SettingsPanel.css';

/**
 * A panel for displaying and editing application settings.
 *
 * @param {object} props - The component's props.
 * @param {object} props.config - The current application configuration.
 * @param {object} props.availableModels - Object with 'local' and 'online' arrays of model objects.
 * @param {Function} props.onConfigChange - Callback function to save updated settings.
 */
function SettingsPanel({ config, availableModels = { local: [], online: [] }, onConfigChange }) {
  const [modelResetWarning, setModelResetWarning] = useState('');

  // Fully controlled component: derive all values from config prop
  // No local state for form values - eliminates sync issues
  const modelMode = config?.model_mode || 'online';
  const selectedModelId = config?.selected_model_id || '';
  const selectedProvider = config?.model_provider || '';
  const voiceModeEnabled = config?.voice_mode_enabled ?? false;
  const speechModeEnabled = config?.speech_mode_enabled ?? false;

  // Get the current list of models based on mode
  const currentModels = modelMode === 'local'
    ? availableModels.local
    : availableModels.online;

  // Handle user input changes - call onConfigChange immediately
  const handleModelModeChange = (newMode) => {
    onConfigChange({
      model_mode: newMode,
      selected_model_id: '', // Reset when switching modes
      model_provider: '',
      voice_mode_enabled: voiceModeEnabled,
      speech_mode_enabled: speechModeEnabled,
    });
  };

  const handleModelChange = (newModelId) => {
    const model = currentModels.find(m => m.id === newModelId);
    onConfigChange({
      model_mode: modelMode,
      selected_model_id: newModelId,
      model_provider: model?.provider || '',
      voice_mode_enabled: voiceModeEnabled,
      speech_mode_enabled: speechModeEnabled,
    });
  };

  const handleVoiceModeToggle = (enabled) => {
    onConfigChange({
      model_mode: modelMode,
      selected_model_id: selectedModelId,
      model_provider: selectedProvider,
      voice_mode_enabled: enabled,
      speech_mode_enabled: speechModeEnabled,
    });
  };

  const handleSpeechModeToggle = (enabled) => {
    onConfigChange({
      model_mode: modelMode,
      selected_model_id: selectedModelId,
      model_provider: selectedProvider,
      voice_mode_enabled: voiceModeEnabled,
      speech_mode_enabled: enabled,
    });
  };


  // Validate selected model exists and auto-fix if needed
  useEffect(() => {
    if (availableModels.local.length === 0 && availableModels.online.length === 0) return;
    if (!selectedModelId || !config) return;

    const model = currentModels.find(m => m.id === selectedModelId);
    if (!model) {
      // Model doesn't exist - reset to first available or empty
      const warningMsg = `Selected model "${selectedModelId}" is not available. Resetting to default.`;
      console.warn(warningMsg);
      setModelResetWarning(warningMsg);

      if (currentModels.length > 0) {
        const defaultModel = currentModels[0];
        onConfigChange({
          model_mode: modelMode,
          selected_model_id: defaultModel.id,
          model_provider: defaultModel.provider,
          voice_mode_enabled: voiceModeEnabled,
          speech_mode_enabled: speechModeEnabled,
        });
      } else {
        onConfigChange({
          model_mode: modelMode,
          selected_model_id: '',
          model_provider: '',
          voice_mode_enabled: voiceModeEnabled,
          speech_mode_enabled: speechModeEnabled,
        });
      }

      setTimeout(() => setModelResetWarning(''), 5000);
    } else if (model.provider !== selectedProvider) {
      // Auto-update provider if model exists but provider doesn't match
      onConfigChange({
        model_mode: modelMode,
        selected_model_id: selectedModelId,
        model_provider: model.provider,
        voice_mode_enabled: voiceModeEnabled,
        speech_mode_enabled: speechModeEnabled,
      });
    }
  }, [selectedModelId, currentModels, selectedProvider, availableModels, config, modelMode, voiceModeEnabled, speechModeEnabled, onConfigChange]);

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
                onChange={(e) => handleModelModeChange(e.target.value)}
              />
              <span>Online (Cloud)</span>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="model-mode"
                value="local"
                checked={modelMode === 'local'}
                onChange={(e) => handleModelModeChange(e.target.value)}
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
              onChange={(e) => handleModelChange(e.target.value)}
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
                onChange={(e) => handleVoiceModeToggle(e.target.checked)}
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
                onChange={(e) => handleSpeechModeToggle(e.target.checked)}
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
};

export default SettingsPanel;
