import { memo, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import ThinkingDisplay from './ThinkingDisplay';
import MessageContent from './MessageContent';
import MessageTransparencySections from './MessageTransparencySections';
import AssistantMessageActions from './AssistantMessageActions';
import UserMessageActions from './UserMessageActions';
import { buildMessageClassName } from '../utils/messageListClasses';
import '../../../styles/ThinkingDisplay.css';

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
});

function shouldRenderAssistantActions(message, enableAssistantActions) {
  if (!enableAssistantActions) {
    return false;
  }
  if (message.sender !== 'assistant') {
    return false;
  }
  return message.type !== 'tool-call' && message.type !== 'tool-output';
}

function shouldRenderUserActions(message, enableUserActions) {
  if (!enableUserActions) {
    return false;
  }
  return message.sender === 'user';
}

const MessageItem = memo(function MessageItem({
  message,
  enableAssistantActions,
  enableUserActions,
  disableAssistantActions,
  onAssistantFeedbackChange,
  onAssistantTryAgain,
  onUserEdit,
}) {
  const messageClass = buildMessageClassName(message);

  return (
    <div className={messageClass}>
      <MessageContent message={message} />
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
      {shouldRenderUserActions(message, enableUserActions) ? (
        <UserMessageActions
          messageId={message.id}
          messageText={message.text}
          onEdit={onUserEdit}
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
  onUserEdit: PropTypes.func,
};

function MessageList({
  messages,
  thinkingStatus,
  enableAssistantActions = false,
  enableUserActions = false,
  disableAssistantActions = false,
  onAssistantFeedbackChange,
  onAssistantTryAgain,
  onUserEdit,
}) {
  const messagesEndRef = useRef(null);
  const renderedMessages = useMemo(
    () => messages.map((msg) => (
      <MessageItem
        key={msg.id}
        message={msg}
        enableAssistantActions={enableAssistantActions}
        enableUserActions={enableUserActions}
        disableAssistantActions={disableAssistantActions}
        onAssistantFeedbackChange={onAssistantFeedbackChange}
        onAssistantTryAgain={onAssistantTryAgain}
        onUserEdit={onUserEdit}
      />
    )),
    [
      messages,
      enableAssistantActions,
      enableUserActions,
      disableAssistantActions,
      onAssistantFeedbackChange,
      onAssistantTryAgain,
      onUserEdit,
    ]
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinkingStatus]);

  return (
    <div className="message-list">
      {renderedMessages}
      <ThinkingDisplay status={thinkingStatus} />
      <div ref={messagesEndRef} data-testid="message-list-end" />
    </div>
  );
}

MessageList.propTypes = {
  messages: PropTypes.arrayOf(messageShapePropType).isRequired,
  thinkingStatus: PropTypes.string,
  enableAssistantActions: PropTypes.bool,
  enableUserActions: PropTypes.bool,
  disableAssistantActions: PropTypes.bool,
  onAssistantFeedbackChange: PropTypes.func,
  onAssistantTryAgain: PropTypes.func,
  onUserEdit: PropTypes.func,
};

export default MessageList;
