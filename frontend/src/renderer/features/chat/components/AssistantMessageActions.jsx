import PropTypes from 'prop-types';
import { Check, Copy, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useCopyMessageAction } from '../hooks/useCopyMessageAction';

function AssistantMessageActions({
  messageId,
  messageText,
  feedback = null,
  disabled = false,
  onFeedbackChange,
  onTryAgain,
}) {
  const { copySuccess, handleCopy } = useCopyMessageAction({
    messageText,
    warningPrefix: 'AssistantMessageActions',
  });

  const handleFeedback = (nextFeedback) => {
    if (typeof onFeedbackChange !== 'function') {
      return;
    }
    onFeedbackChange(messageId, feedback === nextFeedback ? null : nextFeedback);
  };

  const handleTryAgain = () => {
    if (disabled || typeof onTryAgain !== 'function') {
      return;
    }
    onTryAgain(messageId);
  };

  return (
    <div className="assistant-message-actions" role="group" aria-label="Assistant message actions">
      <button
        type="button"
        className={`assistant-action-btn${copySuccess ? ' is-active' : ''}`}
        onClick={handleCopy}
        aria-label="Copy assistant message"
        title={copySuccess ? 'Copied' : 'Copy'}
      >
        {copySuccess ? <Check size={16} /> : <Copy size={16} />}
      </button>
      <button
        type="button"
        className={`assistant-action-btn${feedback === 'like' ? ' is-active' : ''}`}
        onClick={() => handleFeedback('like')}
        aria-label="Like response"
        title="Like"
      >
        <ThumbsUp size={16} />
      </button>
      <button
        type="button"
        className={`assistant-action-btn${feedback === 'dislike' ? ' is-active' : ''}`}
        onClick={() => handleFeedback('dislike')}
        aria-label="Dislike response"
        title="Dislike"
      >
        <ThumbsDown size={16} />
      </button>
      <button
        type="button"
        className="assistant-action-btn"
        onClick={handleTryAgain}
        aria-label="Try again"
        title="Try again"
        disabled={disabled}
      >
        <RotateCcw size={16} />
      </button>
    </div>
  );
}

AssistantMessageActions.propTypes = {
  messageId: PropTypes.string.isRequired,
  messageText: PropTypes.string,
  feedback: PropTypes.oneOf(['like', 'dislike', null]),
  disabled: PropTypes.bool,
  onFeedbackChange: PropTypes.func,
  onTryAgain: PropTypes.func,
};

export default AssistantMessageActions;
