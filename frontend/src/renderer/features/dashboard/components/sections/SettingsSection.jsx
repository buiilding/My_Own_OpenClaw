import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  X,
  Settings,
  ChevronDown,
} from 'lucide-react';
import { useAppConfigContext } from '../../../../app/providers/AppContextHooks';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import {
  getGlobalAgentStopShortcutLabel,
  getGlobalAgentStopShortcutOptions,
} from '../../../../infrastructure/shortcuts/agentStopShortcut';
import PermissionControlCenter from '../../../permissions/components/PermissionControlCenter';
import '../../../../styles/CloneSettings.css';

const SETTINGS_TABS = Object.freeze([
  { id: 'general', icon: Settings, label: 'General' },
]);

function SelectDropdown({
  value,
  options,
  onChange,
  showSwatch = false,
  className = '',
}) {
  return (
    <div className={['clone-settings-select-wrap', className].filter(Boolean).join(' ')}>
      {showSwatch ? <span className="clone-settings-swatch" aria-hidden="true" /> : null}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="clone-settings-select">
        {options.map((option) => (
          <option key={option.value || option} value={option.value || option}>
            {option.label || option}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </div>
  );
}

SelectDropdown.propTypes = {
  value: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ])).isRequired,
  onChange: PropTypes.func.isRequired,
  showSwatch: PropTypes.bool,
  className: PropTypes.string,
};

function CloneToggle({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
}) {
  return (
    <label className={`clone-settings-toggle${checked ? ' checked' : ''}`.trim()}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={ariaLabel}
        disabled={disabled}
      />
      <span className="clone-settings-toggle-thumb" />
    </label>
  );
}

CloneToggle.propTypes = {
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  ariaLabel: PropTypes.string,
  disabled: PropTypes.bool,
};

function GeneralTab({ config, onConfigChange }) {
  const {
    wakewordEnabled,
    wakewordSuppressed,
    setWakewordEnabled,
    globalAgentStopShortcutStatus,
  } = useAppConfigContext();
  const [voice, setVoice] = useState('Jenny');
  const [sudoAccessPending, setSudoAccessPending] = useState(false);
  const wakewordSttEnabled = config?.wakeword_stt_enabled ?? false;
  const agentFullSudoEnabled = config?.agent_full_sudo_enabled ?? false;
  const globalStopShortcut = config?.global_agent_stop_shortcut;
  const globalStopShortcutOptions = getGlobalAgentStopShortcutOptions();
  const shortcutRegistrationFailed = globalAgentStopShortcutStatus?.registrationFailed === true;
  const shortcutFallbackActive = (
    globalAgentStopShortcutStatus?.usingFallback === true
    && typeof globalAgentStopShortcutStatus?.resolvedAccelerator === 'string'
    && typeof globalAgentStopShortcutStatus?.requestedAccelerator === 'string'
    && globalAgentStopShortcutStatus.resolvedAccelerator !== globalAgentStopShortcutStatus.requestedAccelerator
  );

  const handleWakewordSttEnabledChange = (enabled) => {
    onConfigChange({
      wakeword_stt_enabled: enabled,
    });
  };

  const handleAgentSudoAccessChange = async (enabled) => {
    if (sudoAccessPending) {
      return;
    }
    if (enabled) {
      const confirmed = window.confirm(
        'Warning: This action will enable the agent to have sudo access without password prompts. Continue?',
      );
      if (!confirmed) {
        return;
      }
    }

    setSudoAccessPending(true);
    try {
      const result = await IpcBridge.invoke(INVOKE_CHANNELS.SET_AGENT_SUDO_ACCESS, { enabled });
      if (!result?.success) {
        const reason = result?.reason || 'Failed to update sudo access setting.';
        window.alert(reason);
        return;
      }
      onConfigChange({
        agent_full_sudo_enabled: enabled,
      });
    } catch (error) {
      window.alert(error?.message || 'Failed to open OS authentication prompt.');
    } finally {
      setSudoAccessPending(false);
    }
  };

  return (
    <div className="clone-settings-general">
      <h2>General</h2>

      <div className="clone-settings-row clone-settings-row-tts">
        <span>Text-to-speech name</span>
        <SelectDropdown
          value={voice}
          options={['Jenny']}
          onChange={setVoice}
        />
      </div>

      <div className="clone-settings-row clone-settings-row-rich">
        <div>
          <span>Wakeword Listening (Hey Jarvis)</span>
          <p>Allow wakeword detection when the chat pill is hidden.</p>
          {wakewordEnabled && wakewordSuppressed ? (
            <p>Listening is paused while the chatbox is visible.</p>
          ) : null}
        </div>
        <CloneToggle
          checked={wakewordEnabled}
          onChange={setWakewordEnabled}
          ariaLabel="Wakeword Listening (Hey Jarvis)"
        />
      </div>

      <div className="clone-settings-row clone-settings-row-rich">
        <div>
          <span>Speech-To-Text After &quot;Hey Jarvis&quot;</span>
          <p>After wakeword, open chat pill and transcribe speech into the input field.</p>
        </div>
        <CloneToggle
          checked={wakewordSttEnabled}
          onChange={handleWakewordSttEnabledChange}
          ariaLabel={'Speech-To-Text After "Hey Jarvis"'}
        />
      </div>

      <div className="clone-settings-row clone-settings-row-rich">
        <div>
          <span>Agent Full Sudo Access (No Password Prompt)</span>
          <p>This action will enable the agent to have sudo access.</p>
          {sudoAccessPending ? (
            <p>Waiting for OS authentication prompt...</p>
          ) : null}
        </div>
        <CloneToggle
          checked={agentFullSudoEnabled}
          onChange={(enabled) => {
            void handleAgentSudoAccessChange(enabled);
          }}
          ariaLabel="Agent Full Sudo Access"
          disabled={sudoAccessPending}
        />
      </div>

      <div className="clone-settings-row clone-settings-row-rich">
        <div>
          <span>Global Stop Shortcut</span>
          <p>
            Ends the active agent loop from anywhere. Current binding:
            {' '}
            <strong>{getGlobalAgentStopShortcutLabel(globalStopShortcut)}</strong>
            .
          </p>
          {shortcutFallbackActive ? (
            <p className="clone-settings-inline-warning">
              Requested shortcut unavailable on this system. WindieOS switched to
              {' '}
              <strong>
                {getGlobalAgentStopShortcutLabel(globalAgentStopShortcutStatus.resolvedAccelerator)}
              </strong>
              {' '}
              and saved that binding locally.
            </p>
          ) : null}
          {shortcutRegistrationFailed ? (
            <p className="clone-settings-inline-warning">
              Global stop shortcut could not be registered. Choose another binding if you need
              stop-from-anywhere behavior.
            </p>
          ) : null}
          <p>Focused chat and dashboard windows still support <strong>Esc</strong> for stop.</p>
        </div>
        <SelectDropdown
          value={globalStopShortcut}
          options={globalStopShortcutOptions.map((shortcut) => ({
            value: shortcut.accelerator,
            label: shortcut.label,
          }))}
          onChange={(nextShortcut) => {
            onConfigChange({
              global_agent_stop_shortcut: nextShortcut,
            });
          }}
          className="clone-settings-select-shortcut"
        />
      </div>

    </div>
  );
}

GeneralTab.propTypes = {
  config: PropTypes.shape({
    wakeword_stt_enabled: PropTypes.bool,
    agent_full_sudo_enabled: PropTypes.bool,
    global_agent_stop_shortcut: PropTypes.string,
  }),
  onConfigChange: PropTypes.func.isRequired,
};

function PlaceholderTab({ title }) {
  return (
    <div className="clone-settings-placeholder">
      <h2>{title}</h2>
      <p>Settings for {title.toLowerCase()} will appear here.</p>
    </div>
  );
}

PlaceholderTab.propTypes = {
  title: PropTypes.string.isRequired,
};

function SettingsSection({ config, onConfigChange, initialTab = 'general', onClose }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab || 'general');
  }, [initialTab]);

  const renderTabContent = () => {
    if (activeTab === 'general') {
      return <GeneralTab config={config} onConfigChange={onConfigChange} />;
    }
    if (activeTab === 'data-controls') {
      return <PermissionControlCenter />;
    }

    const tab = SETTINGS_TABS.find((item) => item.id === activeTab);
    return <PlaceholderTab title={tab?.label || 'Settings'} />;
  };

  return (
    <div className="clone-settings-panel">
      <aside className="clone-settings-sidebar">
        <button
          type="button"
          className="clone-settings-close clone-settings-close-left"
          onClick={onClose}
          aria-label="Close settings"
        >
          <X size={18} />
        </button>

        <nav className="clone-settings-tab-list">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`clone-settings-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`settings-tab-${tab.id}`}
            >
              <tab.icon size={15} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="clone-settings-content-wrap">
        <div className="clone-settings-content">
          {renderTabContent()}
        </div>
      </section>
    </div>
  );
}

SettingsSection.propTypes = {
  config: PropTypes.shape({
    show_additional_models: PropTypes.bool,
    agent_full_sudo_enabled: PropTypes.bool,
    global_agent_stop_shortcut: PropTypes.string,
  }),
  onConfigChange: PropTypes.func.isRequired,
  initialTab: PropTypes.string,
  onClose: PropTypes.func.isRequired,
};

export default SettingsSection;
