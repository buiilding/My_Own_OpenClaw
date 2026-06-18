/**
 * Defines general settings tab configuration for the renderer UI.
 */

import PropTypes from 'prop-types';
import { useDesktopRendererConfigContext } from '../../../../../app/runtime/desktopRendererConfigRuntimeClient';
import { DesktopShortcutRuntimeClient } from '../../../../../app/runtime/desktopShortcutRuntimeClient';
import { desktopRuntimeSkin } from '../../../../../app/skin/desktopRuntimeSkin';
import { CloneToggle, SelectDropdown } from './settingsControls';

const generalSettingsSkin = desktopRuntimeSkin.settings.general;

function GeneralSettingsTab({ config, onConfigChange }) {
  const {
    wakewordEnabled,
    wakewordSuppressed,
    setWakewordEnabled,
    globalAgentStopShortcutStatus,
  } = useDesktopRendererConfigContext();
  const wakewordSttEnabled = config?.wakeword_stt_enabled ?? false;
  const showToolLogs = config?.show_tool_logs === true;
  const globalStopShortcut = config?.global_agent_stop_shortcut;
  const globalStopShortcutOptions = DesktopShortcutRuntimeClient.getGlobalAgentStopShortcutOptions();
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

  return (
    <div className="clone-settings-general">
      <h2>{generalSettingsSkin.title}</h2>

      <div className="clone-settings-row clone-settings-row-rich">
        <div>
          <span>{generalSettingsSkin.wakeword.label}</span>
          <p>{generalSettingsSkin.wakeword.description}</p>
          {wakewordEnabled && wakewordSuppressed ? (
            <p>{generalSettingsSkin.wakeword.suppressedDescription}</p>
          ) : null}
        </div>
        <CloneToggle
          checked={wakewordEnabled}
          onChange={setWakewordEnabled}
          ariaLabel={generalSettingsSkin.wakeword.label}
        />
      </div>

      <div className="clone-settings-row clone-settings-row-rich">
        <div>
          <span>{generalSettingsSkin.speechAfterWakeword.label}</span>
          <p>{generalSettingsSkin.speechAfterWakeword.description}</p>
        </div>
        <CloneToggle
          checked={wakewordSttEnabled}
          onChange={handleWakewordSttEnabledChange}
          ariaLabel={generalSettingsSkin.speechAfterWakeword.label}
        />
      </div>

      <div className="clone-settings-row clone-settings-row-rich">
        <div>
          <span>{generalSettingsSkin.toolLogs.label}</span>
          <p>{generalSettingsSkin.toolLogs.description}</p>
        </div>
        <CloneToggle
          checked={showToolLogs}
          onChange={handleShowToolLogsChange}
          ariaLabel={generalSettingsSkin.toolLogs.label}
        />
      </div>

      <div className="clone-settings-row clone-settings-row-rich">
        <div>
          <span>{generalSettingsSkin.globalStopShortcut.label}</span>
          <p>
            {generalSettingsSkin.globalStopShortcut.descriptionPrefix}
            {' '}
            <strong>
              {DesktopShortcutRuntimeClient.getGlobalAgentStopShortcutLabel(globalStopShortcut)}
            </strong>
            .
          </p>
          {shortcutFallbackActive ? (
            <p className="clone-settings-inline-warning">
              {generalSettingsSkin.globalStopShortcut.fallbackPrefix}
              {' '}
              <strong>
                {DesktopShortcutRuntimeClient.getGlobalAgentStopShortcutLabel(
                  globalAgentStopShortcutStatus.resolvedAccelerator,
                )}
              </strong>
              {' '}
              {generalSettingsSkin.globalStopShortcut.fallbackSuffix}
            </p>
          ) : null}
          {shortcutRegistrationFailed ? (
            <p className="clone-settings-inline-warning">
              {generalSettingsSkin.globalStopShortcut.registrationFailure}
            </p>
          ) : null}
          <p>{generalSettingsSkin.globalStopShortcut.focusedWindowHint}</p>
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
    show_tool_logs: PropTypes.bool,
    global_agent_stop_shortcut: PropTypes.string,
  }),
  onConfigChange: PropTypes.func.isRequired,
};

export default GeneralSettingsTab;
