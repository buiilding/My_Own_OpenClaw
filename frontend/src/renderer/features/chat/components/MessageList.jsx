import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import ThinkingDisplay from './ThinkingDisplay';
import MessageContent from './MessageContent';
import MessageTransparencySections from './MessageTransparencySections';
import '../../../styles/ThinkingDisplay.css';

function MessageList({ messages, thinkingStatus }) {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinkingStatus]);

  return (
    <div className="message-list">
      {messages.map((msg) => {
        const messageClass = `message message-${msg.sender} ${
          msg.sender === 'assistant' && msg.isComplete === false ? 'message-streaming' : ''
        } ${msg.type ? `message-type-${msg.type}` : ''} ${msg.screenshot ? 'message-has-screenshot' : ''}`;
        return (
          <div key={msg.id} className={messageClass}>
            <MessageContent message={msg} />
            <MessageTransparencySections message={msg} />
          </div>
        );
      })}
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
    })
  ).isRequired,
  thinkingStatus: PropTypes.string,
};

export default MessageList;
