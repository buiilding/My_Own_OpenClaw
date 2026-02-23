import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import { useAppConfigContext } from '../../../../app/providers/AppContextHooks';
import { getStoredDisplayId, persistDisplaySelection } from '../../../../utils/displaySelection';
import {
  buildQueryScreenshotConfigUpdate,
  buildSpeechModeConfigUpdate,
  buildVoiceModeConfigUpdate,
  findDisplayById,
  resolveDisplaySelection,
  toDisplayOptions,
} from '../../utils/settingsDisplayUtils';
import '../../../../styles/SettingsPanel.css';

function SettingsToggleField({
  label,
  checked,
  onToggle,
  helpText = '',
  children = null,
}) {
  return (
    <div className="settings-field">
      <label className="toggle-label">
        <span>{label}</span>
        <div className="toggle-switch">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onToggle(event.target.checked)}
            className="toggle-input"
          />
          <span className="toggle-slider"></span>
        </div>
      </label>
      {helpText ? <p className="settings-help">{helpText}</p> : null}
      {children}
    </div>
  );
}

SettingsToggleField.propTypes = {
  label: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  helpText: PropTypes.string,
  children: PropTypes.node,
};

function SettingsSection({ config, onConfigChange }) {
  const { wakewordEnabled, wakewordSuppressed, setWakewordEnabled } = useAppConfigContext();
  const [displays, setDisplays] = useState([]);
  const [displayError, setDisplayError] = useState('');
  const [selectedDisplayId, setSelectedDisplayId] = useState(() => getStoredDisplayId());

  const speechModeEnabled = config?.speech_mode_enabled ?? false;
  const voiceModeEnabled = config?.voice_mode_enabled ?? false;
  const includeQueryScreenshot = config?.include_query_screenshot ?? true;

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
    const { selectedDisplay, nextSelectedDisplayId } = resolveDisplaySelection(displays, selectedDisplayId);
    if (!selectedDisplay) {
      return;
    }
    if (nextSelectedDisplayId !== selectedDisplayId) {
      setSelectedDisplayId(nextSelectedDisplayId);
    }
    persistDisplaySelection(selectedDisplay);
  }, [displays, selectedDisplayId]);

  const displayOptions = useMemo(() => toDisplayOptions(displays), [displays]);

  const handleSpeechModeToggle = (enabled) => {
    onConfigChange(buildSpeechModeConfigUpdate(config, enabled));
  };

  const handleVoiceModeToggle = (enabled) => {
    onConfigChange(buildVoiceModeConfigUpdate(config, enabled));
  };

  const handleQueryScreenshotToggle = (enabled) => {
    onConfigChange(buildQueryScreenshotConfigUpdate(config, enabled));
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
        <SettingsToggleField
          label="Wakeword Listening (Hey Jarvis)"
          checked={wakewordEnabled}
          onToggle={setWakewordEnabled}
          helpText="Press Win + Alt + W to show or hide the chatbox."
        >
          {wakewordSuppressed ? (
            <p className="settings-help">Listening is paused while the chatbox is visible.</p>
          ) : null}
        </SettingsToggleField>
      </section>

      <section className="settings-section">
        <h3>Audio</h3>
        <SettingsToggleField
          label="Voice Mode (Nova Gateway)"
          checked={voiceModeEnabled}
          onToggle={handleVoiceModeToggle}
          helpText="Streams microphone audio to ws://localhost:5026 for live transcription."
        />
        <SettingsToggleField
          label="Speech Replies (TTS)"
          checked={speechModeEnabled}
          onToggle={handleSpeechModeToggle}
        />
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
                const selectedDisplay = findDisplayById(displays, nextValue);
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
        <SettingsToggleField
          label="Attach Image To User Query"
          checked={includeQueryScreenshot}
          onToggle={handleQueryScreenshotToggle}
          helpText="When enabled, each user query includes the latest screenshot as image context."
        />
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
    voice_mode_enabled: PropTypes.bool,
    speech_mode_enabled: PropTypes.bool,
    include_query_screenshot: PropTypes.bool,
  }),
  onConfigChange: PropTypes.func.isRequired,
};

export default SettingsSection;
