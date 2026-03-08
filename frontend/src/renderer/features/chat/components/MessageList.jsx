import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import messageShapePropType from './message/messageShapePropType';
import MessageItem from './message/MessageItem';
import {
  resolveCompactionStatusText,
} from '../utils/message/messageListState';
import { resolveConversationToolSchemas } from '../utils/message/messageTransparency';
import { useMessageListAutoScroll } from '../hooks/useMessageListAutoScroll';


function MessageList({
  messages,
  conversationRef = null,
  thinkingStatus = null,
  thinkingSourceEventType = null,
  awaitingDotTargetMessageId = null,
  enableAgentLoopAutoScroll = false,
  enableAssistantActions = false,
  enableUserActions = false,
  disableAssistantActions = false,
  onAssistantFeedbackChange,
  onAssistantTryAgain,
  onUserEdit,
}) {
  const [editingUserMessageId, setEditingUserMessageId] = useState(null);
  const [editingUserDraft, setEditingUserDraft] = useState('');
  const messagesEndRef = useRef(null);
  const {
    messageListRef,
    handleMessageListScroll,
  } = useMessageListAutoScroll({
    messages,
    conversationRef,
    awaitingDotTargetMessageId,
    enableAgentLoopAutoScroll,
  });

  const handleStartUserEdit = useCallback((messageId, messageText) => {
    setEditingUserMessageId(messageId);
    setEditingUserDraft(messageText || '');
  }, []);

  const handleCancelUserEdit = useCallback(() => {
    setEditingUserMessageId(null);
    setEditingUserDraft('');
  }, []);

  const handleSubmitUserEdit = useCallback(() => {
    if (!editingUserMessageId || typeof onUserEdit !== 'function') {
      return;
    }
    const normalizedText = editingUserDraft.trim();
    if (!normalizedText) {
      return;
    }
    onUserEdit(editingUserMessageId, normalizedText);
    setEditingUserMessageId(null);
    setEditingUserDraft('');
  }, [editingUserDraft, editingUserMessageId, onUserEdit]);

  useEffect(() => {
    if (!editingUserMessageId) {
      return;
    }
    const stillExists = messages.some((message) => message.id === editingUserMessageId);
    if (!stillExists) {
      setEditingUserMessageId(null);
      setEditingUserDraft('');
    }
  }, [editingUserMessageId, messages]);

  const conversationToolSchemas = useMemo(() => resolveConversationToolSchemas(messages), [messages]);

  const renderedMessages = useMemo(
    () => messages.flatMap((msg) => {
      const nodes = [
        (
          <MessageItem
            key={msg.id}
            message={msg}
            conversationToolSchemas={conversationToolSchemas}
            enableAssistantActions={enableAssistantActions}
            enableUserActions={enableUserActions}
            disableAssistantActions={disableAssistantActions}
            onAssistantFeedbackChange={onAssistantFeedbackChange}
            onAssistantTryAgain={onAssistantTryAgain}
            isUserEditing={editingUserMessageId === msg.id}
            userEditDraft={editingUserDraft}
            onUserEditDraftChange={setEditingUserDraft}
            onStartUserEdit={handleStartUserEdit}
            onCancelUserEdit={handleCancelUserEdit}
            onSubmitUserEdit={handleSubmitUserEdit}
          />
        ),
      ];

      if (awaitingDotTargetMessageId && msg.id === awaitingDotTargetMessageId) {
        nodes.push(
          <div
            key={`${msg.id}__awaiting`}
            className="message-list-awaiting-dot message-list-awaiting-dot-inline"
            role="status"
            aria-live="polite"
            aria-label="Assistant is preparing response"
          >
            <span className="message-list-awaiting-dot-indicator" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>,
        );
      }

      return nodes;
    }),
    [
      messages,
      conversationToolSchemas,
      awaitingDotTargetMessageId,
      enableAssistantActions,
      enableUserActions,
      disableAssistantActions,
      onAssistantFeedbackChange,
      onAssistantTryAgain,
      editingUserMessageId,
      editingUserDraft,
      handleStartUserEdit,
      handleCancelUserEdit,
      handleSubmitUserEdit,
    ]
  );

  const compactionStatusText = useMemo(() => {
    return resolveCompactionStatusText(thinkingStatus, thinkingSourceEventType);
  }, [thinkingSourceEventType, thinkingStatus]);

  return (
    <div
      className="message-list"
      ref={messageListRef}
      onScroll={handleMessageListScroll}
    >
      {renderedMessages}
      {compactionStatusText ? (
        <div
          className={`message-list-compaction-status compaction-state-${compactionStatusText.state}`}
          role="status"
          aria-live="polite"
          aria-label={compactionStatusText.ariaLabel}
        >
          <span
            className={`message-list-compaction-indicator compaction-state-${compactionStatusText.state}`}
            aria-hidden="true"
          />
          <span className={`message-list-compaction-text compaction-state-${compactionStatusText.state}`}>
            {compactionStatusText.text}
          </span>
        </div>
      ) : null}
      <div ref={messagesEndRef} data-testid="message-list-end" />
    </div>
  );
}

MessageList.propTypes = {
  messages: PropTypes.arrayOf(messageShapePropType).isRequired,
  conversationRef: PropTypes.string,
  thinkingStatus: PropTypes.string,
  thinkingSourceEventType: PropTypes.string,
  awaitingDotTargetMessageId: PropTypes.string,
  enableAgentLoopAutoScroll: PropTypes.bool,
  enableAssistantActions: PropTypes.bool,
  enableUserActions: PropTypes.bool,
  disableAssistantActions: PropTypes.bool,
  onAssistantFeedbackChange: PropTypes.func,
  onAssistantTryAgain: PropTypes.func,
  onUserEdit: PropTypes.func,
};

export default MessageList;
