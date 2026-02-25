import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Circle, PenSquare, X } from 'lucide-react';

const GROUP_LABELS = Object.freeze({
  today: 'Today',
  yesterday: 'Yesterday',
  previous7Days: 'Previous 7 days',
  older: 'Older',
});

const GROUP_ORDER = Object.freeze(['today', 'yesterday', 'previous7Days', 'older']);

function SearchChatsModal({
  isOpen,
  onClose,
  onStartNewChat,
  onOpenConversation,
  recentConversationGroups,
  activeConversationRef,
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    setQuery('');
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 20);

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return recentConversationGroups;
    }

    return GROUP_ORDER.reduce((acc, key) => {
      const source = recentConversationGroups[key] || [];
      const filtered = source.filter((item) => (
        typeof item?.title === 'string'
        && item.title.toLowerCase().includes(normalized)
      ));
      acc[key] = filtered;
      return acc;
    }, {
      today: [],
      yesterday: [],
      previous7Days: [],
      older: [],
    });
  }, [query, recentConversationGroups]);

  const hasResults = GROUP_ORDER.some((key) => (filteredGroups[key]?.length || 0) > 0);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="cg-search-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="cg-search-modal"
        role="dialog"
        aria-label="Search chats"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="cg-search-header">
          <input
            ref={inputRef}
            className="cg-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats..."
            aria-label="Search chats input"
          />
          <button
            type="button"
            className="cg-search-close"
            onClick={onClose}
            aria-label="Close search chats"
          >
            <X size={16} />
          </button>
        </div>

        <div className="cg-search-results">
          <button
            type="button"
            className="cg-search-new-chat"
            onClick={() => {
              onClose();
              onStartNewChat();
            }}
          >
            <PenSquare size={14} />
            <span>New chat</span>
          </button>

          {hasResults ? (
            GROUP_ORDER.map((groupKey) => {
              const rows = filteredGroups[groupKey] || [];
              if (rows.length === 0) {
                return null;
              }

              return (
                <div key={groupKey} className="cg-search-group">
                  <p className="cg-search-group-label">{GROUP_LABELS[groupKey]}</p>
                  <div className="cg-search-group-items">
                    {rows.map((item) => (
                      <button
                        key={`${groupKey}-${item.key}`}
                        type="button"
                        className={`cg-search-chat-item${item.key === activeConversationRef ? ' active' : ''}`}
                        onClick={() => {
                          onClose();
                          onOpenConversation(item.conversation);
                        }}
                      >
                        <Circle size={12} strokeWidth={1.8} />
                        <span>{item.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="cg-search-empty">
              {query.trim() ? 'No matching chats found.' : 'No chats yet.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

SearchChatsModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onStartNewChat: PropTypes.func.isRequired,
  onOpenConversation: PropTypes.func.isRequired,
  recentConversationGroups: PropTypes.shape({
    today: PropTypes.array.isRequired,
    yesterday: PropTypes.array.isRequired,
    previous7Days: PropTypes.array.isRequired,
    older: PropTypes.array.isRequired,
  }).isRequired,
  activeConversationRef: PropTypes.string,
};

export default SearchChatsModal;
