import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { loadLocalValue, saveLocalValue } from '../../utils/storage';
import '../../../../styles/SettingsPanel.css';

const API_KEY_STORAGE_KEY = 'desktop-assistant-api-key';

function ModelsSection({ config, availableModels, onConfigChange }) {
  const [modelResetWarning, setModelResetWarning] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [apiKey, setApiKey] = useState(() => loadLocalValue(API_KEY_STORAGE_KEY, ''));

  const modelMode = config?.model_mode || 'online';
  const selectedModelId = config?.selected_model_id || '';
  const selectedProvider = config?.model_provider || '';
  const speechModeEnabled = config?.speech_mode_enabled ?? false;
  const interactionMode = config?.interaction_mode || 'chat';

  const currentModels = modelMode === 'local'
    ? availableModels.local
    : availableModels.online;

  const filteredModels = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return currentModels;
    }
    return currentModels.filter((model) => model.id.toLowerCase().includes(query));
  }, [currentModels, searchTerm]);

  const handleModelModeChange = useCallback((newMode) => {
    onConfigChange({
      model_mode: newMode,
      selected_model_id: '',
      model_provider: '',
      speech_mode_enabled: speechModeEnabled,
      interaction_mode: interactionMode,
    });
  }, [interactionMode, onConfigChange, speechModeEnabled]);

  const handleModelSelect = useCallback((model) => {
    onConfigChange({
      model_mode: modelMode,
      selected_model_id: model?.id || '',
      model_provider: model?.provider || '',
      speech_mode_enabled: speechModeEnabled,
      interaction_mode: interactionMode,
    });
  }, [interactionMode, modelMode, onConfigChange, speechModeEnabled]);

  useEffect(() => {
    if (availableModels.local.length === 0 && availableModels.online.length === 0) return;
    if (!selectedModelId || !config) return;

    const model = currentModels.find((m) => m.id === selectedModelId);
    if (!model) {
      const warningMsg = `Selected model "${selectedModelId}" is not available. Resetting to default.`;
      console.warn(warningMsg);
      setModelResetWarning(warningMsg);

      if (currentModels.length > 0) {
        const defaultModel = currentModels[0];
        handleModelSelect(defaultModel);
      } else {
        handleModelSelect({ id: '', provider: '' });
      }

      setTimeout(() => setModelResetWarning(''), 5000);
    } else if (model.provider !== selectedProvider) {
      handleModelSelect(model);
    }
  }, [selectedModelId, currentModels, selectedProvider, availableModels, config, handleModelSelect]);

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <div>
          <h2>Models</h2>
          <p>Select a model and manage provider access.</p>
        </div>
      </div>

      {modelResetWarning && (
        <div className="model-reset-warning">
          ⚠️ {modelResetWarning}
        </div>
      )}

      <section className="settings-section">
        <h3>Model Mode</h3>
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
      </section>

      <section className="settings-section">
        <h3>{modelMode === 'local' ? 'Local Models' : 'Online Models'}</h3>
        <div className="settings-field">
          <label htmlFor="model-search">Search</label>
          <input
            id="model-search"
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search model ids"
          />
        </div>
        {currentModels.length === 0 ? (
          <div className="no-models-message">
            {modelMode === 'local'
              ? 'No local models found. Make sure Ollama or LM Studio is running.'
              : 'Loading available models...'}
          </div>
        ) : (
          <div className="models-list">
            {filteredModels.length === 0 ? (
              <div className="no-models-message">No models match that search.</div>
            ) : (
              filteredModels.map((model) => {
                const isActive = model.id === selectedModelId && model.provider === selectedProvider;
                return (
                  <button
                    type="button"
                    key={`${model.id}-${model.provider}`}
                    className={`model-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleModelSelect(model)}
                  >
                    <div className="model-item-title">{model.id}</div>
                    <div className="model-item-subtitle">{model.provider}</div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </section>

      <section className="settings-section">
        <h3>API Key</h3>
        <div className="settings-field">
          <label htmlFor="api-key">Provider Key</label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(event) => {
              const nextValue = event.target.value;
              setApiKey(nextValue);
              saveLocalValue(API_KEY_STORAGE_KEY, nextValue);
            }}
            placeholder="Paste your provider key"
          />
          <p className="settings-help">Stored locally on this device.</p>
        </div>
      </section>
    </div>
  );
}

ModelsSection.propTypes = {
  config: PropTypes.shape({
    model_mode: PropTypes.oneOf(['local', 'online']),
    selected_model_id: PropTypes.string,
    model_provider: PropTypes.string,
    interaction_mode: PropTypes.string,
    speech_mode_enabled: PropTypes.bool,
  }),
  availableModels: PropTypes.shape({
    local: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        provider: PropTypes.string.isRequired,
      })
    ),
    online: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        provider: PropTypes.string.isRequired,
      })
    ),
  }),
  onConfigChange: PropTypes.func.isRequired,
};

export default ModelsSection;
