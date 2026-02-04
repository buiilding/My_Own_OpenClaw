import { useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useTranscription } from '../hooks/useTranscription';
import { useVoiceMode } from '../../voice/hooks/useVoiceMode';
import VoiceStatus from '../../voice/components/VoiceStatus';

function MessageInput({ onSendMessage, isSending, voiceModeEnabled }) {
  const inputRef = useRef(null);
  const inputValueRef = useRef('');
  
  const { 
    inputValue, 
    setInputValue, 
    updateTranscription, 
    resetTranscription, 
    handleInputChange, 
    handlePaste 
  } = useTranscription();

  // Keep inputValueRef in sync with inputValue for utterance end handler
  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  const handleTranscriptionUpdate = useCallback((text) => {
    updateTranscription(text);
  }, [updateTranscription]);

  const handleUtteranceEnd = useCallback(() => {
    const currentValue = inputValueRef.current;
    if (currentValue.trim() && !isSending) {
      onSendMessage(currentValue.trim());
      setInputValue('');
      resetTranscription();
    }
  }, [isSending, onSendMessage, resetTranscription, setInputValue]);

  const voiceMode = useVoiceMode(
    voiceModeEnabled,
    handleTranscriptionUpdate,
    handleUtteranceEnd
  );

  // Reset transcription state when voice mode is disabled
  useEffect(() => {
    if (!voiceModeEnabled) {
      resetTranscription();
    }
  }, [voiceModeEnabled, resetTranscription]);

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
      <VoiceStatus 
        error={voiceMode.error} 
        isRecording={voiceMode.isRecording} 
        isConnected={voiceMode.isConnected} 
      />
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
          placeholder={voiceModeEnabled ? "Type your message or speak..." : "Type your message..."}
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
