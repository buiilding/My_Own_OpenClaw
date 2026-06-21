/**
 * Defines general settings tab configuration for the renderer UI.
 */

import PropTypes from 'prop-types';
import { DesktopRendererConfigRuntimeClient } from '../../../../../app/runtime/desktopRendererConfigRuntimeClient';
import { DesktopShortcutRuntimeClient } from '../../../../../app/runtime/desktopShortcutRuntimeClient';
import { DesktopRuntimeSkin } from '../../../../../app/skin/desktopRuntimeSkin';
import { SettingsToggle, SelectDropdown } from './settingsControls';

const generalSettingsSkin = DesktopRuntimeSkin.desktopRuntimeSkin.settings.general;

function GeneralSettingsTab({ config, onConfigChange }) {
  const {
    wakewordEnabled,
    wakewordSuppressed,
    setWakewordEnabled,
    globalAgentStopShortcutStatus,
  } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();
  const wakewordSttEnabled = config?.wakeword_stt_enabled ?? false;
  const showToolLogs = config?.show_tool_logs === true;
  const globalStopShortcut = config?.global_agent_stop_shortcut;
  const globalStopShortcutOptions = DesktopShortcutRuntimeClient.getGlobalAgentStopShortcutOptions();
  const shortcutStatusPresentation = (
    DesktopShortcutRuntimeClient.getGlobalAgentStopShortcutStatusPresentation(
      globalAgentStopShortcutStatus,
    )
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
    <div className="settings-surface-general">
      <h2>{generalSettingsSkin.title}</h2>

      <div className="settings-surface-row settings-surface-row-rich">
        <div>
          <span>{generalSettingsSkin.wakeword.label}</span>
          <p>{generalSettingsSkin.wakeword.description}</p>
          {wakewordEnabled && wakewordSuppressed ? (
            <p>{generalSettingsSkin.wakeword.suppressedDescription}</p>
          ) : null}
        </div>
        <SettingsToggle
          checked={wakewordEnabled}
          onChange={setWakewordEnabled}
          ariaLabel={generalSettingsSkin.wakeword.label}
        />
      </div>

      <div className="settings-surface-row settings-surface-row-rich">
        <div>
          <span>{generalSettingsSkin.speechAfterWakeword.label}</span>
          <p>{generalSettingsSkin.speechAfterWakeword.description}</p>
        </div>
        <SettingsToggle
          checked={wakewordSttEnabled}
          onChange={handleWakewordSttEnabledChange}
          ariaLabel={generalSettingsSkin.speechAfterWakeword.label}
        />
      </div>

      <div className="settings-surface-row settings-surface-row-rich">
        <div>
          <span>{generalSettingsSkin.toolLogs.label}</span>
          <p>{generalSettingsSkin.toolLogs.description}</p>
        </div>
        <SettingsToggle
          checked={showToolLogs}
          onChange={handleShowToolLogsChange}
          ariaLabel={generalSettingsSkin.toolLogs.label}
        />
      </div>

      <div className="settings-surface-row settings-surface-row-rich">
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
          {shortcutStatusPresentation.showFallbackNotice ? (
            <p className="settings-surface-inline-warning">
              {generalSettingsSkin.globalStopShortcut.fallbackPrefix}
              {' '}
              <strong>
                {shortcutStatusPresentation.fallbackLabel}
              </strong>
              {' '}
              {generalSettingsSkin.globalStopShortcut.fallbackSuffix}
            </p>
          ) : null}
          {shortcutStatusPresentation.showRegistrationFailure ? (
            <p className="settings-surface-inline-warning">
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
          className="settings-surface-select-shortcut"
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
