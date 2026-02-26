import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Check, Copy, Pencil } from 'lucide-react';

function UserMessageActions({
  messageId,
  messageText = '',
  onEdit = null,
}) {
  const [copySuccess, setCopySuccess] = useState(false);
  const copyResetTimerRef = useRef(null);

  const scheduleCopyReset = () => {
    if (copyResetTimerRef.current) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopySuccess(false);
      copyResetTimerRef.current = null;
    }, 4000);
  };

  useEffect(() => () => {
    if (copyResetTimerRef.current) {
      window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
  }, []);

  const handleCopy = async () => {
    if (!messageText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(messageText);
      setCopySuccess(true);
      scheduleCopyReset();
    } catch (error) {
      console.warn('[UserMessageActions] Failed to copy user message:', error);
    }
  };

  const handleEdit = () => {
    if (typeof onEdit !== 'function') {
      return;
    }
    onEdit(messageId);
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
      <button
        type="button"
        className="user-action-btn"
        onClick={handleEdit}
        aria-label="Edit and resend"
        title="Edit and resend"
      >
        <Pencil size={16} />
      </button>
    </div>
  );
}

UserMessageActions.propTypes = {
  messageId: PropTypes.string.isRequired,
  messageText: PropTypes.string,
  onEdit: PropTypes.func,
};

export default UserMessageActions;
