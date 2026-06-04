import { useState } from 'react';
import PropTypes from 'prop-types';
import { useAppConfigContext } from '../../../../../app/providers/AppConfigContext';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../../infrastructure/ipc/bridge';
import {
  getGlobalAgentStopShortcutLabel,
  getGlobalAgentStopShortcutOptions,
} from '../../../../../infrastructure/shortcuts/agentStopShortcut';
import { CloneToggle, SelectDropdown } from './settingsControls';

function GeneralSettingsTab({ config, onConfigChange }) {
  const {
    wakewordEnabled,
    wakewordSuppressed,
    setWakewordEnabled,
    globalAgentStopShortcutStatus,
  } = useAppConfigContext();
  const [sudoAccessPending, setSudoAccessPending] = useState(false);
  const wakewordSttEnabled = config?.wakeword_stt_enabled ?? false;
  const agentFullSudoEnabled = config?.agent_full_sudo_enabled ?? false;
  const showToolLogs = config?.show_tool_logs === true;
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

  const handleShowToolLogsChange = (enabled) => {
    onConfigChange({
      show_tool_logs: enabled,
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
          <span>View tool logs</span>
          <p>
            Show raw tool-call and tool-output cards in chat. When off, WindieOS shows only
            subdued action explanations and collapses them into a View actions summary after the
            loop completes.
          </p>
        </div>
        <CloneToggle
          checked={showToolLogs}
          onChange={handleShowToolLogsChange}
          ariaLabel="View tool logs"
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

GeneralSettingsTab.propTypes = {
  config: PropTypes.shape({
    wakeword_stt_enabled: PropTypes.bool,
    agent_full_sudo_enabled: PropTypes.bool,
    show_tool_logs: PropTypes.bool,
    global_agent_stop_shortcut: PropTypes.string,
  }),
  onConfigChange: PropTypes.func.isRequired,
};

export default GeneralSettingsTab;
