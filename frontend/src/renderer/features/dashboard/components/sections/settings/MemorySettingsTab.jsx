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
          <span>Delete saved memories</span>
          <p>Deletes saved episodic interaction memories and semantic memories. Chat transcripts remain.</p>
        </div>
        <button
          type="button"
          className="clone-settings-danger-button"
          onClick={() => {
            void clearLocalMemory();
          }}
          disabled={pendingAction !== null}
        >
          {pendingAction === 'memory' ? 'Deleting...' : 'Delete memories'}
        </button>
      </div>

      <div className="clone-settings-row clone-settings-row-rich clone-settings-row-action">
        <div>
          <span>Delete chat history</span>
          <p>Deletes saved chat transcripts, revisions, and titles. Memories remain.</p>
        </div>
        <button
          type="button"
          className="clone-settings-danger-button"
          onClick={() => {
            void clearChatHistory(onChatsCleared);
          }}
          disabled={pendingAction !== null}
        >
          {pendingAction === 'chats' ? 'Deleting...' : 'Delete chats'}
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
