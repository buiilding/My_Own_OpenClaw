import { useEffect, useMemo, useState } from 'react';
import MessageList from '../../../chat/components/MessageList';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import { getTranscriptSessionInfo } from '../../../../infrastructure/transcript/TranscriptWriter';
import '../../../../styles/SettingsPanel.css';

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

      if (list.length > 0) {
        const initialKey = buildConversationKey(list[0]);
        const hasSelection = selectedConversationKey
          && list.some((conversation) => buildConversationKey(conversation) === selectedConversationKey);
        if (!hasSelection) {
          setSelectedConversationKey(initialKey);
        }
      } else if (selectedConversationKey) {
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

  return (
    <div className="settings-panel memory-panel">
      <div className="settings-header">
        <div>
          <h2>Episodic Memory</h2>
          <p>Conversation summaries and short-term recall.</p>
        </div>
      </div>
      <section className="settings-section memory-section">
        <div className="memory-grid">
          <div className="memory-column memory-list">
            <div className="memory-column-header">
              <h3>Conversations</h3>
              <span className="memory-count">{conversationCountLabel}</span>
            </div>
            <div className="memory-list-scroll">
            {isLoadingList ? (
              <div className="memory-muted">Loading conversations...</div>
            ) : listError ? (
              <div className="memory-error">{listError}</div>
            ) : conversations.length === 0 ? (
                <div className="memory-muted">No conversations yet.</div>
              ) : (
                conversations.map((conversation, index) => {
                  const key = buildConversationKey(conversation);
                  const isActive = key === selectedConversationKey;
                  const displayTitle = conversation.conversation_id
                    ? `Conversation ${index + 1}`
                    : 'Unassigned Conversation';
                  const idPreview = conversation.conversation_id
                    ? conversation.conversation_id.slice(0, 8)
                    : 'no session id';

                  return (
                    <button
                      key={`${key}-${index}`}
                      type="button"
                      className={`memory-item ${isActive ? 'active' : ''}`}
                      onClick={() => setSelectedConversationKey(key)}
                    >
                      <div className="memory-item-title">{displayTitle}</div>
                      <div className="memory-item-meta">Last: {formatTimestamp(conversation.last_timestamp)}</div>
                      <div className="memory-item-meta">Turns: {conversation.entry_count || 0}</div>
                      <div className="memory-item-id">{idPreview}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div className="memory-column memory-conversation">
            <div className="memory-column-header">
              <h3>Conversation</h3>
              <span className="memory-count">
                {activeConversation
                  ? formatTimestamp(activeConversation.first_timestamp)
                  : 'Select a conversation'}
              </span>
            </div>
            <div className="memory-conversation-body">
              {isLoadingConversation ? (
                <div className="memory-muted">Loading conversation...</div>
              ) : conversationError ? (
                <div className="memory-error">{conversationError}</div>
              ) : !selectedConversationKey ? (
                <div className="settings-card">
                  <div className="settings-card-title">Select a conversation</div>
                  <div className="settings-card-desc">Choose a conversation on the left to view the full history.</div>
                </div>
              ) : messages.length === 0 ? (
                <div className="settings-card">
                  <div className="settings-card-title">No messages</div>
                  <div className="settings-card-desc">This conversation does not have stored messages yet.</div>
                </div>
              ) : (
                <div className="memory-message-list">
                  <MessageList messages={messages} thinkingStatus={null} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default EpisodicMemorySection;
