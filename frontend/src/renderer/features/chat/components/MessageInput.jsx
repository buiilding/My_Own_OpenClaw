import { useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranscription } from '../hooks/useTranscription';
import { buildOutgoingMessage } from '../utils/messageInput';
import { useVoiceMode } from '../../voice/hooks/useVoiceMode';
import VoiceStatus from '../../voice/components/VoiceStatus';

function MessageInput({ onSendMessage, isSending, voiceModeEnabled = false }) {
  const inputRef = useRef(null);
  const { 
    inputValue, 
    setInputValue, 
    getInputValue,
    updateTranscription,
    resetTranscription, 
    handleInputChange, 
    handlePaste 
  } = useTranscription();

  const submitMessageValue = (nextInputValue) => {
    const outgoingMessage = buildOutgoingMessage(nextInputValue, isSending);
    if (outgoingMessage) {
      onSendMessage(outgoingMessage);
      setInputValue('');
      resetTranscription();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submitMessageValue(inputValue);
  };

  const { isConnected, isRecording, error } = useVoiceMode(
    voiceModeEnabled,
    (text) => {
      updateTranscription(text);
    },
    () => {
      submitMessageValue(getInputValue());
    },
  );

  return (
    <>
      {voiceModeEnabled ? (
        <VoiceStatus
          error={error}
          isRecording={isRecording}
          isConnected={isConnected}
        />
      ) : null}
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
  voiceModeEnabled: PropTypes.bool,
};

export default MessageInput;
