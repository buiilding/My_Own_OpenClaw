/**
 * Provides the assistant message actions module for the renderer UI.
 */

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Check, Copy, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useCopyMessageAction } from '../../hooks/useCopyMessageAction';

const ACTION_REVEAL_DELAY_MS = 2000;

function AssistantMessageActions({
  messageId,
  messageText,
  feedback = null,
  disabled = false,
  visible = true,
  onFeedbackChange,
  onTryAgain,
}) {
  const { copySuccess, handleCopy } = useCopyMessageAction({
    messageText,
    warningPrefix: 'AssistantMessageActions',
  });
  const revealTimerRef = useRef(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    if (!visible) {
      setIsRevealed(false);
      return undefined;
    }

    setIsRevealed(false);
    revealTimerRef.current = window.setTimeout(() => {
      setIsRevealed(true);
      revealTimerRef.current = null;
    }, ACTION_REVEAL_DELAY_MS);

    return () => {
      if (revealTimerRef.current) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [messageId, visible]);

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
    <div
      className={`assistant-message-actions${isRevealed ? ' assistant-message-actions-enter' : ' assistant-message-actions-placeholder'}`}
      role={isRevealed ? 'group' : undefined}
      aria-label={isRevealed ? 'Assistant message actions' : undefined}
      aria-hidden={isRevealed ? undefined : 'true'}
      data-testid={isRevealed ? undefined : 'assistant-message-actions-placeholder'}
    >
      {isRevealed ? (
        <>
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
        </>
      ) : null}
    </div>
  );
}

AssistantMessageActions.propTypes = {
  messageId: PropTypes.string.isRequired,
  messageText: PropTypes.string,
  feedback: PropTypes.oneOf(['like', 'dislike', null]),
  disabled: PropTypes.bool,
  visible: PropTypes.bool,
  onFeedbackChange: PropTypes.func,
  onTryAgain: PropTypes.func,
};

export default AssistantMessageActions;
