import PropTypes from 'prop-types';
import { useMemorySettingsActions } from './useMemorySettingsActions';

function MemorySettingsTab({ onChatsCleared }) {
  const {
    clearLocalMemory,
    clearChatHistory,
    pendingAction,
    status,
  } = useMemorySettingsActions();

  return (
    <div className="clone-settings-memory">
      <h2>Memory</h2>

      <div className="clone-settings-row clone-settings-row-rich clone-settings-row-action">
        <div>
          <span>Nuke memory</span>
          <p>Deletes all local episodic and semantic memory. Past chats stay intact.</p>
        </div>
        <button
          type="button"
          className="clone-settings-danger-button"
          onClick={() => {
            void clearLocalMemory();
          }}
          disabled={pendingAction !== null}
        >
          {pendingAction === 'memory' ? 'Nuking...' : 'Nuke memory'}
        </button>
      </div>

      <div className="clone-settings-row clone-settings-row-rich clone-settings-row-action">
        <div>
          <span>Nuke chats</span>
          <p>Deletes all past chats. Local episodic and semantic memory stay intact.</p>
        </div>
        <button
          type="button"
          className="clone-settings-danger-button"
          onClick={() => {
            void clearChatHistory(onChatsCleared);
          }}
          disabled={pendingAction !== null}
        >
          {pendingAction === 'chats' ? 'Nuking...' : 'Nuke chats'}
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
