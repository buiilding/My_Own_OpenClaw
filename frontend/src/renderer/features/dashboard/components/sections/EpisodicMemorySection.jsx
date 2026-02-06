import { useEffect, useMemo, useState } from 'react';
import MessageList from '../../../chat/components/MessageList';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import { getTranscriptSessionInfo } from '../../../../infrastructure/transcript/TranscriptWriter';
import '../../../../styles/SettingsPanel.css';
import '../../../../styles/ChatInterface.css';

const DEFAULT_USER_ID = 'default_user';
const UNASSIGNED_CONVERSATION_KEY = '__unassigned_conversation__';

const formatTimestamp = (timestamp) => {
  if (!timestamp) {
    return 'Unknown time';
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }
  return parsed.toLocaleString();
};

const parseMemoryContent = (memory) => {
  if (!memory) {
    return [];
  }

  const rawContent = memory.content || '';
  const role = memory.role || memory.metadata?.role;
  const messageType = memory.message_type || memory.metadata?.message_type;

  if (role) {
    const sender = role === 'user' ? 'user' : 'assistant';
    const normalizedType = messageType || (role === 'tool' ? 'tool-output' : 'llm-text');
    return [{
      sender,
      text: rawContent || '(empty)',
      type: normalizedType,
    }];
  }

  const content = rawContent.replace(/\r\n/g, '\n').trim();
  if (!content) {
    return [];
  }

  const userPrefix = 'User:';
  const assistantMarker = '\nAssistant:';

  if (content.startsWith(userPrefix) && content.includes(assistantMarker)) {
    const assistantIndex = content.indexOf(assistantMarker);
    const userText = content.slice(userPrefix.length, assistantIndex).trim();
    const assistantText = content.slice(assistantIndex + assistantMarker.length).trim();

    return [
      { sender: 'user', text: userText || '(empty)', type: 'user' },
      { sender: 'assistant', text: assistantText || '(empty)', type: 'llm-text' },
    ];
  }

  return [{ sender: 'assistant', text: content, type: 'llm-text' }];
};

const buildConversationKey = (conversation) => {
  const recordKind = conversation?.record_kind || 'memory';
  const conversationId = conversation?.conversation_id ?? UNASSIGNED_CONVERSATION_KEY;
  return `${recordKind}::${conversationId}`;
};

const toTimestampValue = (timestamp) => {
  if (!timestamp) {
    return 0;
  }
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatModelLabel = (conversation) => {
  if (!conversation) {
    return 'Unknown model';
  }
  const modelId = conversation.model_id || conversation.modelId || '';
  const modelProvider = conversation.model_provider || conversation.modelProvider || '';
  if (modelId && modelProvider) {
    return `${modelProvider}/${modelId}`;
  }
  return modelId || modelProvider || 'Unknown model';
};

function EpisodicMemorySection() {
  const [conversations, setConversations] = useState([]);
  const [selectedConversationKey, setSelectedConversationKey] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [listError, setListError] = useState(null);
  const [conversationError, setConversationError] = useState(null);

  const [sessionInfo, setSessionInfo] = useState(() => getTranscriptSessionInfo());

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

  const loadConversations = async () => {
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
  };

  const loadConversation = async (conversationKey) => {
    setIsLoadingConversation(true);
    setConversationError(null);
    setMessages([]);

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
      const parsedMessages = memories.flatMap((memory, index) => {
        const parts = parseMemoryContent(memory);
        return parts.map((part, partIndex) => ({
          id: `${memory.id || index}-${partIndex}`,
          text: part.text,
          sender: part.sender,
          type: part.type,
          isComplete: true,
        }));
      });

      setMessages(parsedMessages);
    } catch (error) {
      setConversationError(error.message || 'Failed to load conversation');
    } finally {
      setIsLoadingConversation(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [sessionInfo.userId]);

  useEffect(() => {
    if (!selectedConversationKey) {
      setMessages([]);
      return;
    }
    loadConversation(selectedConversationKey);
  }, [selectedConversationKey, conversations, sessionInfo.userId]);

  useEffect(() => {
    const handleSessionUpdate = (event) => {
      if (event?.detail) {
        setSessionInfo({
          sessionId: event.detail.sessionId || null,
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
    </div>
  );
}

export default EpisodicMemorySection;
