import { useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranscription } from '../hooks/useTranscription';
import { normalizeMessageForSend } from '../utils/messageInput';

function MessageInput({ onSendMessage, isSending }) {
  const inputRef = useRef(null);
  const { 
    inputValue, 
    setInputValue, 
    resetTranscription, 
    handleInputChange, 
    handlePaste 
  } = useTranscription();

  const handleSubmit = (e) => {
    e.preventDefault();
    const outgoingMessage = normalizeMessageForSend(inputValue);
    if (outgoingMessage && !isSending) {
      onSendMessage(outgoingMessage);
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
