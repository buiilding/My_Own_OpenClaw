import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import ThinkingDisplay from '../ThinkingDisplay';

export default function AssistantThinkingSection({ thinkingText, sourceEventType = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const normalizedThinkingText = useMemo(
    () => (typeof thinkingText === 'string' ? thinkingText.trim() : ''),
    [thinkingText],
  );

  if (!normalizedThinkingText) {
    return null;
  }

  return (
    <div className="assistant-thinking-section">
      <button
        type="button"
        className="assistant-thinking-toggle"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((previous) => !previous)}
      >
        <span>Show thinking</span>
        <span className={`assistant-thinking-caret${isOpen ? ' is-open' : ''}`} aria-hidden="true">▾</span>
      </button>
      {isOpen ? (
        <div className="assistant-thinking-panel" aria-label="Assistant reasoning details">
          <ThinkingDisplay
            status={normalizedThinkingText}
            sourceEventType={sourceEventType || null}
          />
        </div>
      ) : null}
    </div>
  );
}

AssistantThinkingSection.propTypes = {
  thinkingText: PropTypes.string,
  sourceEventType: PropTypes.string,
};
