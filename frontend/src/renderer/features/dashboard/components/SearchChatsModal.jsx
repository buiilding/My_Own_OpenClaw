/**
 * Provides the search chats modal module for the renderer UI.
 */

import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Circle, PenSquare, X } from 'lucide-react';
import { getDashboardConversationGroupDescriptors } from '../../../app/runtime/desktopDashboardConversationGroupRuntime';
import { conversationGroupsPropType } from './shared/conversationGroupPropTypes';

const CONVERSATION_GROUP_DESCRIPTORS = getDashboardConversationGroupDescriptors();

function SearchChatsModal({
  isOpen,
  onClose,
  onStartNewChat,
  onOpenConversation,
  query,
  onQueryChange,
  isSearching,
  searchError,
  recentConversationGroups,
  searchConversationGroups,
  activeConversationRef,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

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

  const normalizedQuery = query.trim();
  const useSearchResults = normalizedQuery.length >= 2;
  const activeGroups = useSearchResults ? searchConversationGroups : recentConversationGroups;
  const hasResults = CONVERSATION_GROUP_DESCRIPTORS.some(
    ({ key }) => (activeGroups[key]?.length || 0) > 0,
  );

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
            onChange={(event) => onQueryChange(event.target.value)}
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

          {useSearchResults && isSearching ? (
            <div className="cg-search-empty">Searching chats...</div>
          ) : useSearchResults && searchError ? (
            <div className="cg-search-empty">{searchError}</div>
          ) : hasResults ? (
            CONVERSATION_GROUP_DESCRIPTORS.map(({ key: groupKey, label }) => {
              const rows = activeGroups[groupKey] || [];
              if (rows.length === 0) {
                return null;
              }

              return (
                <div key={groupKey} className="cg-search-group">
                  <p className="cg-search-group-label">{label}</p>
                  <div className="cg-search-group-items">
                    {rows.map((item) => (
                      (() => {
                        const snippetText = typeof item.snippet === 'string' ? item.snippet : '';
                        const prefix = item.matchedRole ? `${item.matchedRole}: ` : '';
                        const shouldPrefix = Boolean(
                          prefix
                          && snippetText
                          && !snippetText.toLowerCase().startsWith(prefix.toLowerCase()),
                        );
                        return (
                          <button
                            key={`${groupKey}-${item.key}`}
                            type="button"
                            className={`cg-search-chat-item${item.key === activeConversationRef ? ' active' : ''}`}
                            onClick={() => {
                              onClose();
                              onOpenConversation(item.conversation || item);
                            }}
                          >
                            <Circle size={12} strokeWidth={1.8} className="cg-search-chat-icon" />
                            <span className="cg-search-chat-content">
                              <span className="cg-search-chat-title">{item.title}</span>
                              {snippetText ? (
                                <span className="cg-search-chat-snippet">
                                  {shouldPrefix ? prefix : ''}
                                  {snippetText}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })()
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="cg-search-empty">
              {useSearchResults ? 'No matching chats found.' : 'No chats yet.'}
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
  query: PropTypes.string.isRequired,
  onQueryChange: PropTypes.func.isRequired,
  isSearching: PropTypes.bool.isRequired,
  searchError: PropTypes.string.isRequired,
  recentConversationGroups: conversationGroupsPropType,
  searchConversationGroups: conversationGroupsPropType,
  activeConversationRef: PropTypes.string,
};

export default SearchChatsModal;
