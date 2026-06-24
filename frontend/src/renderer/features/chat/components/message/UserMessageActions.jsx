/**
 * Provides the user message actions module for the renderer UI.
 */

import PropTypes from 'prop-types';
import { Check, Copy, Pencil } from 'lucide-react';
import { useCopyMessageAction } from '../../hooks/useCopyMessageAction';

function UserMessageActions({
  messageId,
  messageText = '',
  canEdit = true,
  onEdit = null,
}) {
  const { copySuccess, handleCopy } = useCopyMessageAction({
    messageText,
    warningPrefix: 'UserMessageActions',
  });

  const handleEdit = () => {
    if (!canEdit || typeof onEdit !== 'function') {
      return;
    }
    onEdit(messageId, messageText);
  };

  return (
    <div className="user-message-actions" role="group" aria-label="User message actions">
      <button
        type="button"
        className={`user-action-btn${copySuccess ? ' is-active' : ''}`}
        onClick={handleCopy}
        aria-label="Copy user message"
        title={copySuccess ? 'Copied' : 'Copy'}
      >
        {copySuccess ? <Check size={16} /> : <Copy size={16} />}
      </button>
      {canEdit ? (
        <button
          type="button"
          className="user-action-btn"
          onClick={handleEdit}
          aria-label="Edit and resend"
          title="Edit and resend"
        >
          <Pencil size={16} />
        </button>
      ) : null}
    </div>
  );
}

UserMessageActions.propTypes = {
  messageId: PropTypes.string.isRequired,
  messageText: PropTypes.string,
  canEdit: PropTypes.bool,
  onEdit: PropTypes.func,
};

export default UserMessageActions;
