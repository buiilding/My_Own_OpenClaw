import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import ThinkingDisplay from './ThinkingDisplay';
import '../styles/ThinkingDisplay.css';

/**
 * A clean and simple chat interface component.
 * It displays messages and provides an input field for sending new ones.
 *
 * @param {object} props - The component's props.
 * @param {Array<object>} props.messages - An array of message objects to display.
 * @param {Function} props.onSendMessage - A callback function to be invoked when a message is sent.
 * @param {boolean} props.isSending - A flag to indicate if a message is currently being sent.
 * @param {string|null} props.thinkingStatus - The current status message from the agent.
 */
function ChatInterface({
  messages,
  onSendMessage,
  isSending = false,
  thinkingStatus,
}) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinkingStatus]);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (inputValue.trim() && !isSending) {
        onSendMessage(inputValue.trim());
        setInputValue('');
      }
    },
    [inputValue, isSending, onSendMessage]
  );

  return (
    <div className="chat-container">
      <div className="message-list">
        {messages.map((msg, index) => {
          const messageClass = `message message-${msg.sender} ${
            msg.sender === 'assistant' && !msg.isComplete ? 'message-streaming' : ''
          }`;
          return (
            <div key={index} className={messageClass}>
              <div className="message-content">{msg.text}</div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <ThinkingDisplay status={thinkingStatus} />
      <form onSubmit={handleSubmit} className="message-input-form">
        <label htmlFor="chat-input" className="visually-hidden">
          Type your message
        </label>
        <input
          id="chat-input"
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="Type your message..."
          disabled={isSending}
          className="message-input"
        />
        <button type="submit" disabled={isSending} className="send-button">
          {isSending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

ChatInterface.propTypes = {
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      text: PropTypes.string.isRequired,
      sender: PropTypes.oneOf(['user', 'assistant']).isRequired,
    })
  ).isRequired,
  onSendMessage: PropTypes.func.isRequired,
  isSending: PropTypes.bool,
  thinkingStatus: PropTypes.string,
};

export default ChatInterface;
