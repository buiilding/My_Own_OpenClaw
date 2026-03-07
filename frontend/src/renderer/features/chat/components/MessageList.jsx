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
  isNearBottom,
  resolveCompactionStatusText,
  scrollToConversationSwitchTarget,
} from '../utils/message/messageListState';


function MessageList({
  messages,
  conversationRef = null,
  thinkingStatus = null,
  thinkingSourceEventType = null,
  awaitingDotTargetMessageId = null,
  enableAssistantActions = false,
  enableUserActions = false,
  disableAssistantActions = false,
  onAssistantFeedbackChange,
  onAssistantTryAgain,
  onUserEdit,
}) {
  const [editingUserMessageId, setEditingUserMessageId] = useState(null);
  const [editingUserDraft, setEditingUserDraft] = useState('');
  const messageListRef = useRef(null);
  const messagesEndRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const forceInstantAutoScrollRef = useRef(false);
  const skipNextMessagesAutoScrollRef = useRef(false);

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

  const renderedMessages = useMemo(
    () => messages.flatMap((msg) => {
      const nodes = [
        (
          <MessageItem
            key={msg.id}
            message={msg}
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

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const element = messageListRef.current;
    if (!element) {
      return;
    }
    const targetTop = Number(element.scrollHeight) || 0;
    if (typeof element.scrollTo === 'function') {
      element.scrollTo({ top: targetTop, behavior });
      return;
    }
    element.scrollTop = targetTop;
  }, []);

  useEffect(() => {
    if (conversationRef === undefined) {
      return;
    }
    // Conversation switches should land near latest message without animation.
    shouldAutoScrollRef.current = true;
    skipNextMessagesAutoScrollRef.current = true;
    forceInstantAutoScrollRef.current = true;
    scrollToConversationSwitchTarget(messageListRef.current, 'auto');
  }, [conversationRef]);

  const handleMessageListScroll = useCallback(() => {
    shouldAutoScrollRef.current = isNearBottom(messageListRef.current);
  }, []);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      return;
    }
    if (skipNextMessagesAutoScrollRef.current) {
      skipNextMessagesAutoScrollRef.current = false;
      forceInstantAutoScrollRef.current = false;
      return;
    }
    const behavior = forceInstantAutoScrollRef.current ? 'auto' : 'smooth';
    forceInstantAutoScrollRef.current = false;
    scrollToBottom(behavior);
  }, [messages, scrollToBottom]);

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
  enableAssistantActions: PropTypes.bool,
  enableUserActions: PropTypes.bool,
  disableAssistantActions: PropTypes.bool,
  onAssistantFeedbackChange: PropTypes.func,
  onAssistantTryAgain: PropTypes.func,
  onUserEdit: PropTypes.func,
};

export default MessageList;
