/**
 * Defines memory settings tab configuration for the renderer UI.
 */

import PropTypes from 'prop-types';
import { windieDesktopSkin } from '../../../../../app/skin/windieDesktopSkin';
import { useMemorySettingsActions } from './useMemorySettingsActions';

const memorySettingsSkin = windieDesktopSkin.settings.memory;

function MemorySettingsTab({ onChatsCleared }) {
  const {
    clearLocalMemory,
    clearChatHistory,
    pendingAction,
    status,
  } = useMemorySettingsActions();

  return (
    <div className="clone-settings-memory">
      <h2>{memorySettingsSkin.title}</h2>

      <div className="clone-settings-row clone-settings-row-rich clone-settings-row-action">
        <div>
          <span>{memorySettingsSkin.deleteMemories.label}</span>
          <p>{memorySettingsSkin.deleteMemories.description}</p>
        </div>
        <button
          type="button"
          className="clone-settings-danger-button"
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

      <div className="clone-settings-row clone-settings-row-rich clone-settings-row-action">
        <div>
          <span>{memorySettingsSkin.deleteChats.label}</span>
          <p>{memorySettingsSkin.deleteChats.description}</p>
        </div>
        <button
          type="button"
          className="clone-settings-danger-button"
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
        <p className={`clone-settings-action-status clone-settings-action-status-${status.tone}`}>
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
