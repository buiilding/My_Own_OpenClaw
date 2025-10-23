import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * A clean and simple chat interface component.
 * It displays messages and provides an input field for sending new ones.
 *
 * @param {object} props - The component's props.
 * @param {Array<object>} props.messages - An array of message objects to display.
 * @param {Function} props.onSendMessage - A callback function to be invoked when a message is sent.
 * @param {boolean} props.isSending - A flag to indicate if a message is currently being sent.
 */
function ChatInterface({ messages, onSendMessage, isSending = false }) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
        {messages.map((msg, index) => (
          <div key={index} className={`message message-${msg.sender}`}>
            <div className="message-content">{msg.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
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
};



export default ChatInterface;
