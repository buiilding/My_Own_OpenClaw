import { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useTranscription } from '../hooks/useTranscription';

function MessageInput({ onSendMessage, isSending }) {
  const inputRef = useRef(null);
  const { 
    inputValue, 
    setInputValue, 
    resetTranscription, 
    handleInputChange, 
    handlePaste 
  } = useTranscription();

  useEffect(() => {
    resetTranscription();
  }, [resetTranscription]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim() && !isSending) {
      onSendMessage(inputValue.trim());
      setInputValue('');
      resetTranscription();
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="message-input-form">
        <label htmlFor="chat-input" className="visually-hidden">
          Type your message
        </label>
        <input
          ref={inputRef}
          id="chat-input"
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onPaste={handlePaste}
          placeholder="Type your message..."
          disabled={isSending}
          className="message-input"
        />
        <button type="submit" disabled={isSending} className="send-button">
          {isSending ? '...' : 'Send'}
        </button>
      </form>
    </>
  );
}

MessageInput.propTypes = {
  onSendMessage: PropTypes.func.isRequired,
  isSending: PropTypes.bool,
};

export default MessageInput;
