import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import '../../../styles/SettingsPanel.css';

const API_KEY_STORAGE_KEY = 'desktop-assistant-api-key';
const DISPLAY_STORAGE_KEY = 'desktop-assistant-display-id';

function loadLocalValue(key, fallback = '') {
  try {
    const value = localStorage.getItem(key);
    return value ?? fallback;
  } catch (error) {
    console.warn('[Dashboard] Failed to read localStorage:', error);
    return fallback;
  }
}

function saveLocalValue(key, value) {
  try {
    if (!value) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn('[Dashboard] Failed to write localStorage:', error);
  }
}

/**
 * Dashboard panel for application settings and status.
 */
function SettingsPanel({ config, availableModels = { local: [], online: [] }, onConfigChange }) {
  const [modelResetWarning, setModelResetWarning] = useState('');
  const [apiKey, setApiKey] = useState(() => loadLocalValue(API_KEY_STORAGE_KEY, ''));
  const [displays, setDisplays] = useState([]);
  const [displayError, setDisplayError] = useState('');
  const [selectedDisplayId, setSelectedDisplayId] = useState(() => loadLocalValue(DISPLAY_STORAGE_KEY, ''));
  const { wakewordEnabled, setWakewordEnabled } = useAppConfigContext();

  const modelMode = config?.model_mode || 'online';
  const selectedModelId = config?.selected_model_id || '';
  const selectedProvider = config?.model_provider || '';
  const speechModeEnabled = config?.speech_mode_enabled ?? false;
  const interactionMode = config?.interaction_mode || 'chat';

  const currentModels = modelMode === 'local'
    ? availableModels.local
    : availableModels.online;

  useEffect(() => {
    let mounted = true;
    IpcBridge.invoke(INVOKE_CHANNELS.GET_DISPLAYS)
      .then((result) => {
        if (!mounted) return;
        setDisplays(Array.isArray(result) ? result : []);
        setDisplayError('');
      })
      .catch((error) => {
        if (!mounted) return;
        setDisplayError(error?.message || 'Unable to load displays');
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!displays.length || selectedDisplayId) {
      return;
    }
    const primary = displays.find((display) => display.isPrimary) || displays[0];
    if (primary) {
      const nextId = String(primary.id);
      setSelectedDisplayId(nextId);
      saveLocalValue(DISPLAY_STORAGE_KEY, nextId);
    }
  }, [displays, selectedDisplayId]);

  const displayOptions = useMemo(() => displays.map((display) => ({
    value: String(display.id),
    label: display.label || `Display ${display.id}`,
  })), [displays]);

  const handleModelModeChange = (newMode) => {
    onConfigChange({
      model_mode: newMode,
      selected_model_id: '',
      model_provider: '',
      speech_mode_enabled: speechModeEnabled,
      interaction_mode: interactionMode,
    });
  };

  const handleModelChange = (newModelId) => {
    const model = currentModels.find((m) => m.id === newModelId);
    onConfigChange({
      model_mode: modelMode,
      selected_model_id: newModelId,
      model_provider: model?.provider || '',
      speech_mode_enabled: speechModeEnabled,
      interaction_mode: interactionMode,
    });
  };

  const handleSpeechModeToggle = (enabled) => {
    onConfigChange({
      model_mode: modelMode,
      selected_model_id: selectedModelId,
      model_provider: selectedProvider,
      speech_mode_enabled: enabled,
      interaction_mode: interactionMode,
    });
  };

  useEffect(() => {
    if (availableModels.local.length === 0 && availableModels.online.length === 0) return;
    if (!selectedModelId || !config) return;

    const model = currentModels.find(m => m.id === selectedModelId);
    if (!model) {
      const warningMsg = `Selected model "${selectedModelId}" is not available. Resetting to default.`;
      console.warn(warningMsg);
      setModelResetWarning(warningMsg);

      if (currentModels.length > 0) {
        const defaultModel = currentModels[0];
        onConfigChange({
          model_mode: modelMode,
          selected_model_id: defaultModel.id,
          model_provider: defaultModel.provider,
          speech_mode_enabled: speechModeEnabled,
          interaction_mode: interactionMode,
        });
      } else {
        onConfigChange({
          model_mode: modelMode,
          selected_model_id: '',
          model_provider: '',
          speech_mode_enabled: speechModeEnabled,
          interaction_mode: interactionMode,
        });
      }

      setTimeout(() => setModelResetWarning(''), 5000);
    } else if (model.provider !== selectedProvider) {
      onConfigChange({
        model_mode: modelMode,
        selected_model_id: selectedModelId,
        model_provider: model.provider,
        speech_mode_enabled: speechModeEnabled,
        interaction_mode: interactionMode,
      });
    }
  }, [selectedModelId, currentModels, selectedProvider, availableModels, config, modelMode, speechModeEnabled, interactionMode, onConfigChange]);

  if (!config) {
    return <div className="settings-panel">Loading dashboard...</div>;
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <div>
          <h2>Dashboard</h2>
          <p>Memory, skills, models, and access.</p>
        </div>
        <div className="settings-chip">Hotkey: Win + Alt + W</div>
      </div>

      {modelResetWarning && (
        <div className="model-reset-warning">
          ⚠️ {modelResetWarning}
        </div>
      )}

      <section className="settings-section">
        <h3>Memory</h3>
        <div className="settings-grid">
          <div className="settings-card">
            <div className="settings-card-title">Episodic Memory</div>
            <div className="settings-card-desc">Conversation summaries. Coming soon.</div>
          </div>
          <div className="settings-card">
            <div className="settings-card-title">Semantic Memory</div>
            <div className="settings-card-desc">Long-term facts and preferences. Coming soon.</div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Procedural Memory</h3>
        <div className="settings-card">
          <div className="settings-card-title">SKILLS.md</div>
          <div className="settings-card-desc">Add a SKILLS.md file to enable procedural memory.</div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Model</h3>
        <div className="settings-field">
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
        <div className="settings-field">
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
                const displayText = `${model.id} (${model.provider})`;
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
      </section>

      <section className="settings-section">
        <h3>Access</h3>
        <div className="settings-field">
          <label htmlFor="api-key">API Key</label>
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
        <div className="settings-field">
          <label className="toggle-label">
            <span>Wakeword Listening (Hey Jarvis)</span>
            <div className="toggle-switch">
              <input
                type="checkbox"
                checked={wakewordEnabled}
                onChange={(event) => setWakewordEnabled(event.target.checked)}
                className="toggle-input"
              />
              <span className="toggle-slider"></span>
            </div>
          </label>
          <p className="settings-help">Use Win + Alt + W to toggle the chatbox.</p>
        </div>
        <div className="settings-field">
          <label className="toggle-label">
            <span>Voice Typing</span>
            <div className="toggle-switch">
              <input
                type="checkbox"
                checked={false}
                disabled
                className="toggle-input"
              />
              <span className="toggle-slider"></span>
            </div>
          </label>
          <p className="settings-help">Disabled for now.</p>
        </div>
        <div className="settings-field">
          <label className="toggle-label">
            <span>Speech Replies (TTS)</span>
            <div className="toggle-switch">
              <input
                type="checkbox"
                checked={speechModeEnabled}
                onChange={(event) => handleSpeechModeToggle(event.target.checked)}
                className="toggle-input"
              />
              <span className="toggle-slider"></span>
            </div>
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>Screen</h3>
        <div className="settings-field">
          <label htmlFor="display-select">Active Display</label>
          {displayError ? (
            <div className="no-models-message">{displayError}</div>
          ) : displayOptions.length === 0 ? (
            <div className="no-models-message">No displays detected yet.</div>
          ) : (
            <select
              id="display-select"
              value={selectedDisplayId}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSelectedDisplayId(nextValue);
                saveLocalValue(DISPLAY_STORAGE_KEY, nextValue);
              }}
            >
              {displayOptions.map((display) => (
                <option key={display.value} value={display.value}>
                  {display.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h3>Permissions</h3>
        <div className="settings-field">
          <label>Access Level</label>
          <div className="mode-toggle">
            <label className="radio-label">
              <input type="radio" name="access" checked readOnly />
              <span>Normal Access</span>
            </label>
            <label className="radio-label">
              <input type="radio" name="access" disabled />
              <span>System Access (coming soon)</span>
            </label>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Usage Limits</h3>
        <div className="settings-grid">
          <div className="settings-card">
            <div className="settings-card-title">Weekly Limit</div>
            <div className="settings-card-desc">Not configured.</div>
          </div>
          <div className="settings-card">
            <div className="settings-card-title">Session Limit</div>
            <div className="settings-card-desc">5-hour cap not configured.</div>
          </div>
        </div>
      </section>
    </div>
  );
}

SettingsPanel.propTypes = {
  config: PropTypes.shape({
    model_mode: PropTypes.oneOf(['local', 'online']),
    selected_model_id: PropTypes.string,
    model_provider: PropTypes.string,
    interaction_mode: PropTypes.string,
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
