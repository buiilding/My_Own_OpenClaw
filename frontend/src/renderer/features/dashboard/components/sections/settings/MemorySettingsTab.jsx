/**
 * Defines memory settings tab configuration for the renderer UI.
 */

import PropTypes from 'prop-types';
import { DesktopRuntimeSkin } from '../../../../../app/skin/desktopRuntimeSkin';
import { useMemorySettingsActions } from './useMemorySettingsActions';

const memorySettingsSkin = DesktopRuntimeSkin.desktopRuntimeSkin.settings.memory;

function MemorySettingsTab({ onChatsCleared }) {
  const {
    clearLocalMemory,
    clearChatHistory,
    pendingAction,
    status,
  } = useMemorySettingsActions();

  return (
    <div className="settings-surface-memory">
      <h2>{memorySettingsSkin.title}</h2>

      <div className="settings-surface-row settings-surface-row-rich settings-surface-row-action">
        <div>
          <span>{memorySettingsSkin.deleteMemories.label}</span>
          <p>{memorySettingsSkin.deleteMemories.description}</p>
        </div>
        <button
          type="button"
          className="settings-surface-danger-button"
          onClick={() => {
            void clearLocalMemory();
          }}
          disabled={pendingAction !== null}
        >
          {pendingAction === 'memory'
            ? memorySettingsSkin.deleteMemories.pendingLabel
            : memorySettingsSkin.deleteMemories.actionLabel}
        </button>
      </div>

      <div className="settings-surface-row settings-surface-row-rich settings-surface-row-action">
        <div>
          <span>{memorySettingsSkin.deleteChats.label}</span>
          <p>{memorySettingsSkin.deleteChats.description}</p>
        </div>
        <button
          type="button"
          className="settings-surface-danger-button"
          onClick={() => {
            void clearChatHistory(onChatsCleared);
          }}
          disabled={pendingAction !== null}
        >
          {pendingAction === 'chats'
            ? memorySettingsSkin.deleteChats.pendingLabel
            : memorySettingsSkin.deleteChats.actionLabel}
        </button>
      </div>

      {status.message ? (
        <p className={`settings-surface-action-status settings-surface-action-status-${status.tone}`}>
          {status.message}
        </p>
      ) : null}
    </div>
  );
}

MemorySettingsTab.propTypes = {
  onChatsCleared: PropTypes.func,
};

export default MemorySettingsTab;
