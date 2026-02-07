import { memo, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import ThinkingDisplay from './ThinkingDisplay';
import MessageContent from './MessageContent';
import MessageTransparencySections from './MessageTransparencySections';
import '../../../styles/ThinkingDisplay.css';

const MessageItem = memo(function MessageItem({ message }) {
  const hasScreenshot = Boolean(message.screenshotUrl || message.screenshotRef || message.screenshot);
  const messageClass = `message message-${message.sender} ${
    message.sender === 'assistant' && message.isComplete === false ? 'message-streaming' : ''
  } ${message.type ? `message-type-${message.type}` : ''} ${hasScreenshot ? 'message-has-screenshot' : ''}`;

  return (
    <div className={messageClass}>
      <MessageContent message={message} />
      <MessageTransparencySections message={message} />
    </div>
  );
});

MessageItem.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired,
    sender: PropTypes.oneOf(['user', 'assistant']).isRequired,
    isComplete: PropTypes.bool,
    type: PropTypes.string,
    screenshot: PropTypes.string,
    screenshotRef: PropTypes.string,
    screenshotUrl: PropTypes.string,
  }).isRequired,
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
      <div ref={messagesEndRef} />
      <ThinkingDisplay status={thinkingStatus} />
    </div>
  );
}

MessageList.propTypes = {
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      text: PropTypes.string.isRequired,
      sender: PropTypes.oneOf(['user', 'assistant']).isRequired,
      isComplete: PropTypes.bool,
      type: PropTypes.string,
      screenshot: PropTypes.string,
      screenshotRef: PropTypes.string,
      screenshotUrl: PropTypes.string,
    })
  ).isRequired,
  thinkingStatus: PropTypes.string,
};

export default MessageList;
