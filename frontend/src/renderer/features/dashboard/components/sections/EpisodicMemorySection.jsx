import PropTypes from 'prop-types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import MessageList from '../../../chat/components/MessageList';
import { useChatStore } from '../../../chat/stores/chatStore';
import { ApiClient } from '../../../../infrastructure/api/client';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import {
  getTranscriptSessionInfo,
  setActiveConversationRef,
  updateTranscriptSession,
} from '../../../../infrastructure/transcript/TranscriptWriter';
import {
  buildConversationKey,
  DEFAULT_USER_ID,
  formatModelLabel,
  formatTimestamp,
  parseMemoriesToMessages,
  toTimestampValue,
} from '../../utils/episodicMemoryUtils';
import '../../../../styles/SettingsPanel.css';
import '../../../../styles/ChatInterface.css';

function looksLikeInlineImageData(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }
  if (value.startsWith('data:image/')) {
    return true;
  }
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length >= 128;
}

function toRehydrateMessage(memory) {
  const metadata = memory?.metadata || {};
  const role = memory?.role || metadata?.role || 'assistant';
  const messageType = memory?.message_type || metadata?.message_type || null;
  const rawScreenshot = memory?.screenshot || metadata?.screenshot || null;
  const screenshotInline = looksLikeInlineImageData(rawScreenshot);
  const screenshotRef = memory?.screenshot_ref
    || metadata?.screenshot_ref
    || (!screenshotInline && typeof rawScreenshot === 'string' ? rawScreenshot : null);

  return {
    role,
    content: memory?.content || '',
    message_type: messageType,
    tool_name: memory?.tool_name || metadata?.tool_name || null,
    correlation_id: memory?.correlation_id || metadata?.correlation_id || null,
    timestamp: memory?.timestamp || null,
    screenshot_ref: screenshotRef,
    screenshot: screenshotInline ? rawScreenshot : null,
  };
}

function EpisodicMemorySection({ onSelectSection }) {
  const [conversations, setConversations] = useState([]);
  const [selectedConversationKey, setSelectedConversationKey] = useState(null);
  const [messages, setMessages] = useState([]);
  const [rawConversationMemories, setRawConversationMemories] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [listError, setListError] = useState(null);
  const [conversationError, setConversationError] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResumingConversation, setIsResumingConversation] = useState(false);

  const [sessionInfo, setSessionInfo] = useState(() => getTranscriptSessionInfo());
  const setChatMessages = useChatStore((state) => state.setMessages);
  const setChatIsSending = useChatStore((state) => state.setIsSending);
  const setChatThinkingStatus = useChatStore((state) => state.setThinkingStatus);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const activeConversation = useMemo(() => {
    if (!selectedConversationKey) {
      return null;
    }
    return conversations.find((conversation) => buildConversationKey(conversation) === selectedConversationKey);
  }, [conversations, selectedConversationKey]);

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      return toTimestampValue(b.last_timestamp) - toTimestampValue(a.last_timestamp);
    });
  }, [conversations]);

  const activeConversationIndex = useMemo(() => {
    if (!selectedConversationKey) {
      return -1;
    }
    return sortedConversations.findIndex((conversation) => buildConversationKey(conversation) === selectedConversationKey);
  }, [sortedConversations, selectedConversationKey]);

  const loadConversations = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);

    try {
      const userId = sessionInfo.userId || DEFAULT_USER_ID;
      const result = await IpcBridge.invoke(INVOKE_CHANNELS.LIST_CONVERSATIONS, {
        userId,
        limit: 200,
        recordKind: 'transcript',
      });

      if (!result || result.success === false) {
        throw new Error(result?.error || 'Failed to load conversations');
      }

      const list = result?.data?.conversations ?? [];
      setConversations(list);

      const hasSelection = selectedConversationKey
        && list.some((conversation) => buildConversationKey(conversation) === selectedConversationKey);
      if (!hasSelection && selectedConversationKey) {
        setSelectedConversationKey(null);
      }
    } catch (error) {
      setListError(error.message || 'Failed to load conversations');
    } finally {
      setIsLoadingList(false);
    }
  }, [selectedConversationKey, sessionInfo.userId]);

  const deleteConversation = useCallback(async (conversation) => {
    if (!conversation) {
      return;
    }

    const recordKind = conversation?.record_kind || 'transcript';
    const displayTitle = conversation?.conversation_id ? 'this conversation' : 'this unassigned conversation';
    const shouldDelete = window.confirm(`Delete ${displayTitle}? This cannot be undone.`);
    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    setListError(null);

    try {
      const userId = sessionInfo.userId || DEFAULT_USER_ID;
      const result = await IpcBridge.invoke(INVOKE_CHANNELS.DELETE_CONVERSATION, {
        userId,
        conversationId: conversation?.conversation_id ?? null,
        recordKind,
      });

      if (!result || result.success === false) {
        throw new Error(result?.error || 'Failed to delete conversation');
      }

      closeContextMenu();
      await loadConversations();
    } catch (error) {
      setListError(error.message || 'Failed to delete conversation');
    } finally {
      setIsDeleting(false);
    }
  }, [closeContextMenu, loadConversations, sessionInfo.userId]);

  const loadConversation = useCallback(async (conversationKey) => {
    setIsLoadingConversation(true);
    setConversationError(null);
    setMessages([]);
    setRawConversationMemories([]);

    const conversation = conversations.find((item) => buildConversationKey(item) === conversationKey);
    const conversationId = conversation?.conversation_id ?? null;
    const recordKind = conversation?.record_kind || 'transcript';

    try {
      const userId = sessionInfo.userId || DEFAULT_USER_ID;
      const result = await IpcBridge.invoke(INVOKE_CHANNELS.GET_CONVERSATION, {
        userId,
        conversationId,
        limit: 1000,
        recordKind,
      });

      if (!result || result.success === false) {
        throw new Error(result?.error || 'Failed to load conversation');
      }

      const memories = result?.data?.memories ?? [];
      const parsedMessages = parseMemoriesToMessages(memories);

      setRawConversationMemories(memories);
      setMessages(parsedMessages);
    } catch (error) {
      setConversationError(error.message || 'Failed to load conversation');
    } finally {
      setIsLoadingConversation(false);
    }
  }, [conversations, sessionInfo.userId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!contextMenu) {
      return () => undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeContextMenu();
        return;
      }
      if (event.key === 'Delete' && contextMenu?.conversation) {
        deleteConversation(contextMenu.conversation);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeContextMenu, contextMenu, deleteConversation]);

  useEffect(() => {
    if (!selectedConversationKey) {
      setMessages([]);
      setRawConversationMemories([]);
      return;
    }
    loadConversation(selectedConversationKey);
  }, [loadConversation, selectedConversationKey]);

  useEffect(() => {
    const handleSessionUpdate = (event) => {
      if (event?.detail) {
        setSessionInfo({
          conversationRef: event.detail.conversationRef || null,
          userId: event.detail.userId || null,
        });
      }
    };
    window.addEventListener('transcript-session-update', handleSessionUpdate);
    return () => window.removeEventListener('transcript-session-update', handleSessionUpdate);
  }, []);

  const conversationCountLabel = conversations.length === 1
    ? '1 conversation'
    : `${conversations.length} conversations`;

  const conversationTitle = activeConversationIndex >= 0
    ? `Conversation ${activeConversationIndex + 1}`
    : 'Conversation';

  const conversationSubtitle = activeConversation
    ? `Last updated ${formatTimestamp(activeConversation.last_timestamp)}`
    : 'Select a conversation';

  const activeConversationCount = activeConversation?.entry_count || 0;
  const activeConversationModel = formatModelLabel(activeConversation);
  const isLegacyConversation = Boolean(activeConversation && !activeConversation?.is_resumable);
  const canContinueConversation = Boolean(
    activeConversation?.conversation_id
    && activeConversation?.is_resumable
    && !isLoadingConversation
    && !isResumingConversation,
  );

  const continueConversation = useCallback(async () => {
    const conversationRef = activeConversation?.conversation_id;
    if (!conversationRef || !activeConversation?.is_resumable) {
      return;
    }

    setIsResumingConversation(true);
    setConversationError(null);

    try {
      await ApiClient.sendRehydrateConversation(
        conversationRef,
        rawConversationMemories.map(toRehydrateMessage),
      );
      setActiveConversationRef(conversationRef);
      updateTranscriptSession(conversationRef, sessionInfo.userId || null);
      setChatMessages(messages);
      setChatIsSending(false);
      setChatThinkingStatus(null);
      if (typeof onSelectSection === 'function') {
        onSelectSection('chat');
      }
    } catch (error) {
      setConversationError(error?.message || 'Failed to continue conversation');
    } finally {
      setIsResumingConversation(false);
    }
  }, [
    activeConversation,
    rawConversationMemories,
    sessionInfo.userId,
    setChatMessages,
    setChatIsSending,
    setChatThinkingStatus,
    messages,
    onSelectSection,
  ]);

  return (
    <div className="settings-panel memory-panel">
      <div className="settings-header">
        <div>
          <h2>Episodic Memory</h2>
          <p>Conversation summaries and short-term recall.</p>
        </div>
      </div>
      {!selectedConversationKey ? (
        <section className="settings-section memory-section memory-list-section">
          <div className="memory-list-header">
            <h3>Conversations</h3>
            <span className="memory-count">{conversationCountLabel}</span>
          </div>
          {isLoadingList ? (
            <div className="memory-muted">Loading conversations...</div>
          ) : isDeleting ? (
            <div className="memory-muted">Deleting conversation...</div>
          ) : listError ? (
            <div className="memory-error">{listError}</div>
          ) : sortedConversations.length === 0 ? (
            <div className="memory-muted">No conversations yet.</div>
          ) : (
            <div className="memory-list-grid">
              {sortedConversations.map((conversation, index) => {
                const key = buildConversationKey(conversation);
                const displayTitle = conversation.conversation_id
                  ? `Conversation ${index + 1}`
                  : 'Unassigned Conversation';
                const modelLabel = formatModelLabel(conversation);

                return (
                  <button
                    key={`${key}-${index}`}
                    type="button"
                    className="memory-card"
                    onClick={() => setSelectedConversationKey(key)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setContextMenu({
                        x: event.clientX,
                        y: event.clientY,
                        conversation,
                        index,
                        key,
                      });
                    }}
                  >
                    <div className="memory-card-title">{displayTitle}</div>
                    <div className="memory-card-meta">
                      <div className="memory-card-row">Last updated: {formatTimestamp(conversation.last_timestamp)}</div>
                      <div className="memory-card-row">Messages: {conversation.entry_count || 0}</div>
                      <div className="memory-card-row">Model: {modelLabel}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="settings-section memory-section memory-chat-section">
          <div className="chat-container memory-chat-container">
            <header className="chat-header memory-chat-header">
              <div className="chat-title-block">
                <button
                  type="button"
                  className="memory-back-button"
                  onClick={() => setSelectedConversationKey(null)}
                >
                  All conversations
                </button>
                <div className="chat-title">{conversationTitle}</div>
                <div className="chat-subtitle">{conversationSubtitle}</div>
              </div>
              <div className="chat-meta">
                <div className="memory-meta-pill">Model: {activeConversationModel}</div>
                <div className="memory-meta-pill">Messages: {activeConversationCount}</div>
                {canContinueConversation ? (
                  <button
                    type="button"
                    className="memory-back-button memory-continue-button"
                    onClick={continueConversation}
                    disabled={isResumingConversation}
                  >
                    {isResumingConversation ? 'Preparing conversation...' : 'Continue conversation'}
                  </button>
                ) : null}
                {isLegacyConversation ? (
                  <div className="memory-meta-pill">Legacy conversation (view-only)</div>
                ) : null}
              </div>
            </header>
            {isLoadingConversation ? (
              <div className="memory-muted">Loading conversation...</div>
            ) : conversationError ? (
              <div className="memory-error">{conversationError}</div>
            ) : messages.length === 0 ? (
              <div className="settings-card">
                <div className="settings-card-title">No messages</div>
                <div className="settings-card-desc">This conversation does not have stored messages yet.</div>
              </div>
            ) : (
              <MessageList messages={messages} thinkingStatus={null} />
            )}
          </div>
        </section>
      )}
      {contextMenu ? (
        <div
          className="memory-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onMouseDown={(event) => {
            // Prevent closing when clicking inside menu.
            event.stopPropagation();
          }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            className="danger"
            disabled={isDeleting}
            onClick={() => deleteConversation(contextMenu.conversation)}
          >
            Delete
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={closeContextMenu}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {contextMenu ? (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
          }}
          onMouseDown={closeContextMenu}
          onContextMenu={(event) => {
            event.preventDefault();
            closeContextMenu();
          }}
        />
      ) : null}
    </div>
  );
}

EpisodicMemorySection.propTypes = {
  onSelectSection: PropTypes.func,
};

export default EpisodicMemorySection;
