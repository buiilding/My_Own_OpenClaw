import { ChevronDown, ChevronUp, X } from 'lucide-react';
import PropTypes from 'prop-types';

function buildFindResultLabel(query, totalMatches, activeMatchIndex) {
  if (!query.trim()) {
    return 'Type to search';
  }

  if (totalMatches === 0) {
    return 'No results';
  }

  return `${activeMatchIndex + 1}/${totalMatches}`;
}

export default function ChatFindBar({
  query,
  totalMatches,
  activeMatchIndex,
  inputRef,
  onQueryChange,
  onPreviousMatch,
  onNextMatch,
  onClose,
}) {
  const hasResults = totalMatches > 0;

  return (
    <div className="chat-find-bar" role="search" aria-label="Find in conversation">
      <input
        ref={inputRef}
        className="chat-find-input"
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (event.shiftKey) {
              onPreviousMatch();
              return;
            }
            onNextMatch();
            return;
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder="Find in conversation"
        aria-label="Find in conversation input"
      />
      <div className="chat-find-status" aria-live="polite">
        {buildFindResultLabel(query, totalMatches, activeMatchIndex)}
      </div>
      <div className="chat-find-actions">
        <button
          type="button"
          className="chat-find-icon-btn"
          aria-label="Previous match"
          title="Previous match"
          onClick={onPreviousMatch}
          disabled={!hasResults}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="button"
          className="chat-find-icon-btn"
          aria-label="Next match"
          title="Next match"
          onClick={onNextMatch}
          disabled={!hasResults}
        >
          <ChevronDown size={16} />
        </button>
        <button
          type="button"
          className="chat-find-icon-btn"
          aria-label="Close find in conversation"
          title="Close find"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

ChatFindBar.propTypes = {
  query: PropTypes.string.isRequired,
  totalMatches: PropTypes.number.isRequired,
  activeMatchIndex: PropTypes.number.isRequired,
  inputRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  onQueryChange: PropTypes.func.isRequired,
  onPreviousMatch: PropTypes.func.isRequired,
  onNextMatch: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
