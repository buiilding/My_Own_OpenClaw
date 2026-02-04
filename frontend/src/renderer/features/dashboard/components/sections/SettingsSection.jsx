import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import { useAppConfigContext } from '../../../../app/providers/AppContextHooks';
import { getStoredDisplayId, persistDisplaySelection } from '../../../../utils/displaySelection';
import '../../../../styles/SettingsPanel.css';

function SettingsSection({ config, onConfigChange }) {
  const { wakewordEnabled, wakewordSuppressed, setWakewordEnabled } = useAppConfigContext();
  const [displays, setDisplays] = useState([]);
  const [displayError, setDisplayError] = useState('');
  const [selectedDisplayId, setSelectedDisplayId] = useState(() => getStoredDisplayId());

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
    if (!displays.length) {
      return;
    }
    const selected = displays.find((display) => String(display.id) === selectedDisplayId);
    if (selected) {
      persistDisplaySelection(selected);
      return;
    }
    const primary = displays.find((display) => display.isPrimary) || displays[0];
    if (primary) {
      const nextId = String(primary.id);
      if (nextId !== selectedDisplayId) {
        setSelectedDisplayId(nextId);
      }
      persistDisplaySelection(primary);
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
                const selectedDisplay = displays.find((display) => String(display.id) === nextValue);
                persistDisplaySelection(selectedDisplay ? selectedDisplay : { id: nextValue, bounds: null });
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

export default SettingsSection;
