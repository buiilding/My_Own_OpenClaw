import { memo, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import ThinkingDisplay from './ThinkingDisplay';
import MessageContent from './MessageContent';
import MessageTransparencySections from './MessageTransparencySections';
import { buildMessageClassName } from '../utils/messageListClasses';
import '../../../styles/ThinkingDisplay.css';

const messageShapePropType = PropTypes.shape({
  id: PropTypes.string.isRequired,
  text: PropTypes.string.isRequired,
  sender: PropTypes.oneOf(['user', 'assistant']).isRequired,
  isComplete: PropTypes.bool,
  type: PropTypes.string,
  screenshot: PropTypes.string,
  screenshotRef: PropTypes.string,
  screenshotUrl: PropTypes.string,
});

const MessageItem = memo(function MessageItem({ message }) {
  const messageClass = buildMessageClassName(message);

  return (
    <div className={messageClass}>
      <MessageContent message={message} />
      <MessageTransparencySections message={message} />
    </div>
  );
});

MessageItem.propTypes = {
  message: messageShapePropType.isRequired,
};

function MessageList({ messages, thinkingStatus }) {
  const messagesEndRef = useRef(null);
  const renderedMessages = useMemo(
    () => messages.map((msg) => <MessageItem key={msg.id} message={msg} />),
    [messages]
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
};

export default MessageList;
