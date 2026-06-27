/**
 * Provides the user message actions module for the renderer UI.
 */

import PropTypes from 'prop-types';
import { Check, Copy, Pencil } from 'lucide-react';
import { useCopyMessageAction } from '../../hooks/useCopyMessageAction';
import { DesktopMessageActionRuntime } from '../../../../app/runtime/desktopMessageActionRuntime';

function UserMessageActions({
  messageId,
  messageText = '',
  canEdit = false,
  editTargetRowId = null,
  onEdit = null,
}) {
  const { copySuccess, handleCopy } = useCopyMessageAction({
    messageText,
    warningPrefix: 'UserMessageActions',
  });
  const resolvedEditTargetRowId = DesktopMessageActionRuntime.resolveReplayTargetRowId(editTargetRowId);
  const canRenderEdit = canEdit && Boolean(resolvedEditTargetRowId);

  const handleEdit = () => {
    if (!canRenderEdit || typeof onEdit !== 'function') {
      return;
    }
    onEdit(messageId, messageText, resolvedEditTargetRowId);
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
      {canRenderEdit ? (
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
  editTargetRowId: PropTypes.string,
  onEdit: PropTypes.func,
};

export default UserMessageActions;
