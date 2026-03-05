import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import MessageContent from './MessageContent';
import MessageTransparencySections from './MessageTransparencySections';
import AssistantMessageActions from './AssistantMessageActions';
import UserMessageActions from './UserMessageActions';
import MessageSourceBadge from './MessageSourceBadge';
import { buildMessageClassName } from '../utils/messageListClasses';
import {
  findAwaitingDotTargetMessageId,
  isNearBottom,
  resolveCompactionStatusText,
  scrollToConversationSwitchTarget,
  shouldRenderAssistantActions,
  shouldRenderUserActions,
} from '../utils/messageListState';

const messageShapePropType = PropTypes.shape({
  id: PropTypes.string.isRequired,
  text: PropTypes.string.isRequired,
  sender: PropTypes.oneOf(['user', 'assistant']).isRequired,
  isComplete: PropTypes.bool,
  type: PropTypes.string,
  feedback: PropTypes.oneOf(['like', 'dislike', null]),
  screenshot: PropTypes.string,
  screenshotRef: PropTypes.string,
  screenshotUrl: PropTypes.string,
  sourceEventType: PropTypes.string,
  sourceChannel: PropTypes.string,
  thinkingText: PropTypes.string,
  thinkingSourceEventType: PropTypes.string,
});

function UserMessageEditComposer({
  value,
  onChange,
  onCancel,
  onSubmit,
}) {
  return (
    <div className="user-message-editor" role="group" aria-label="Edit user message">
      <textarea
        className="user-message-editor-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        rows={3}
        autoFocus
      />
      <div className="user-message-editor-actions">
        <button
          type="button"
          className="user-message-editor-btn"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="user-message-editor-btn primary"
          onClick={onSubmit}
        >
          Send
        </button>
      </div>
    </div>
  );
}

UserMessageEditComposer.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};

const MessageItem = memo(function MessageItem({
  message,
  enableAssistantActions,
  enableUserActions,
  disableAssistantActions,
  onAssistantFeedbackChange,
  onAssistantTryAgain,
  isUserEditing,
  userEditDraft,
  onUserEditDraftChange,
  onStartUserEdit,
  onCancelUserEdit,
  onSubmitUserEdit,
}) {
  const messageClass = buildMessageClassName(message);
  const showUserEditComposer = shouldRenderUserActions(message, enableUserActions) && isUserEditing;

  return (
    <div className={messageClass}>
      {showUserEditComposer ? (
        <UserMessageEditComposer
          value={userEditDraft}
          onChange={onUserEditDraftChange}
          onCancel={onCancelUserEdit}
          onSubmit={onSubmitUserEdit}
        />
      ) : (
        <MessageContent message={message} />
      )}
      <MessageSourceBadge message={message} />
      {shouldRenderAssistantActions(message, enableAssistantActions) ? (
        <AssistantMessageActions
          messageId={message.id}
          messageText={message.text}
          feedback={message.feedback ?? null}
          disabled={disableAssistantActions}
          onFeedbackChange={onAssistantFeedbackChange}
          onTryAgain={onAssistantTryAgain}
        />
      ) : null}
      {shouldRenderUserActions(message, enableUserActions) && !showUserEditComposer ? (
        <UserMessageActions
          messageId={message.id}
          messageText={message.text}
          onEdit={onStartUserEdit}
        />
      ) : null}
      <MessageTransparencySections message={message} />
    </div>
  );
});

MessageItem.propTypes = {
  message: messageShapePropType.isRequired,
  enableAssistantActions: PropTypes.bool,
  enableUserActions: PropTypes.bool,
  disableAssistantActions: PropTypes.bool,
  onAssistantFeedbackChange: PropTypes.func,
  onAssistantTryAgain: PropTypes.func,
  isUserEditing: PropTypes.bool,
  userEditDraft: PropTypes.string,
  onUserEditDraftChange: PropTypes.func,
  onStartUserEdit: PropTypes.func,
  onCancelUserEdit: PropTypes.func,
  onSubmitUserEdit: PropTypes.func,
};

function MessageList({
  messages,
  conversationRef = null,
  thinkingStatus = null,
  thinkingSourceEventType = null,
  showAssistantAwaitingDot = false,
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

  const awaitingDotTargetMessageId = useMemo(() => {
    return findAwaitingDotTargetMessageId(messages, showAssistantAwaitingDot);
  }, [messages, showAssistantAwaitingDot]);

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
  showAssistantAwaitingDot: PropTypes.bool,
  enableAssistantActions: PropTypes.bool,
  enableUserActions: PropTypes.bool,
  disableAssistantActions: PropTypes.bool,
  onAssistantFeedbackChange: PropTypes.func,
  onAssistantTryAgain: PropTypes.func,
  onUserEdit: PropTypes.func,
};

export default MessageList;
