import { useCallback, useEffect, useMemo, useState } from 'react';
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

function MemorySection({ title, description }) {
  return (
    <div className="settings-panel">
      <div className="settings-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <section className="settings-section">
        <h3>Status</h3>
        <div className="settings-card">
          <div className="settings-card-title">Coming soon</div>
          <div className="settings-card-desc">Memory management will land here.</div>
        </div>
      </section>
    </div>
  );
}

MemorySection.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
};

function ProceduralSection() {
  return (
    <div className="settings-panel">
      <div className="settings-header">
        <div>
          <h2>Procedural Memory</h2>
          <p>Skills and reusable workflows.</p>
        </div>
      </div>
      <section className="settings-section">
        <h3>SKILLS.md</h3>
        <div className="settings-card">
          <div className="settings-card-title">Not detected</div>
          <div className="settings-card-desc">Add a SKILLS.md file to enable procedural memory.</div>
        </div>
      </section>
    </div>
  );
}

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

function UsageSection() {
  return (
    <div className="settings-panel">
      <div className="settings-header">
        <div>
          <h2>Usage</h2>
          <p>Limits, quotas, and current consumption.</p>
        </div>
      </div>
      <section className="settings-section">
        <h3>Limits</h3>
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

function SettingsSection({ config, onConfigChange }) {
  const { wakewordEnabled, wakewordSuppressed, setWakewordEnabled } = useAppConfigContext();
  const [displays, setDisplays] = useState([]);
  const [displayError, setDisplayError] = useState('');
  const [selectedDisplayId, setSelectedDisplayId] = useState(() => loadLocalValue(DISPLAY_STORAGE_KEY, ''));

  const modelMode = config?.model_mode || 'online';
  const selectedModelId = config?.selected_model_id || '';
  const selectedProvider = config?.model_provider || '';
  const speechModeEnabled = config?.speech_mode_enabled ?? false;
  const interactionMode = config?.interaction_mode || 'chat';

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

  const handleSpeechModeToggle = (enabled) => {
    onConfigChange({
      model_mode: modelMode,
      selected_model_id: selectedModelId,
      model_provider: selectedProvider,
      speech_mode_enabled: enabled,
      interaction_mode: interactionMode,
    });
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <div>
          <h2>Settings</h2>
          <p>Wakeword, hotkeys, audio, and permissions.</p>
        </div>
        <div className="settings-chip">Hotkey: Win + Alt + W</div>
      </div>

      <section className="settings-section">
        <h3>Wakeword</h3>
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
          <p className="settings-help">Press Win + Alt + W to show or hide the chatbox.</p>
          {wakewordSuppressed ? (
            <p className="settings-help">Listening is paused while the chatbox is visible.</p>
          ) : null}
        </div>
      </section>

      <section className="settings-section">
        <h3>Audio</h3>
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
    </div>
  );
}

SettingsSection.propTypes = {
  config: PropTypes.shape({
    model_mode: PropTypes.oneOf(['local', 'online']),
    selected_model_id: PropTypes.string,
    model_provider: PropTypes.string,
    interaction_mode: PropTypes.string,
    speech_mode_enabled: PropTypes.bool,
  }),
  onConfigChange: PropTypes.func.isRequired,
};

function DashboardContent({ sectionId, config, availableModels, onConfigChange }) {
  switch (sectionId) {
    case 'episodic':
      return (
        <MemorySection
          title="Episodic Memory"
          description="Conversation summaries and short-term recall."
        />
      );
    case 'semantic':
      return (
        <MemorySection
          title="Semantic Memory"
          description="Long-term facts and preferences."
        />
      );
    case 'procedural':
      return <ProceduralSection />;
    case 'models':
      return (
        <ModelsSection
          config={config}
          availableModels={availableModels}
          onConfigChange={onConfigChange}
        />
      );
    case 'usage':
      return <UsageSection />;
    case 'settings':
      return (
        <SettingsSection
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    default:
      return (
        <div className="settings-panel">
          <div className="settings-header">
            <div>
              <h2>Section</h2>
              <p>Select an area from the left.</p>
            </div>
          </div>
        </div>
      );
  }
}

DashboardContent.propTypes = {
  sectionId: PropTypes.string.isRequired,
  config: PropTypes.shape({}),
  availableModels: PropTypes.shape({
    local: PropTypes.array,
    online: PropTypes.array,
  }),
  onConfigChange: PropTypes.func.isRequired,
};

export default DashboardContent;
