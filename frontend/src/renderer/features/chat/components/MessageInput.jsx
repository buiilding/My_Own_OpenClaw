import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ArrowUp, ChevronDown, Mic, Plus, Sparkles, Square, X } from 'lucide-react';
import { useTranscription } from '../hooks/useTranscription';
import { buildOutgoingMessage } from '../utils/messageInput';
import { useVoiceMode } from '../../voice/hooks/useVoiceMode';
import VoiceStatus from '../../voice/components/VoiceStatus';

function MessageInput({
  onSendMessage,
  isSending,
  voiceModeEnabled = false,
  onStopResponse = undefined,
  isCentered = false,
}) {
  const textareaRef = useRef(null);
  const [thinkingVisible, setThinkingVisible] = useState(true);
  const {
    inputValue,
    setInputValue,
    getInputValue,
    updateTranscription,
    resetTranscription,
    handleInputChange,
    handlePaste,
  } = useTranscription();

  const submitMessageValue = (nextInputValue) => {
    const outgoingMessage = buildOutgoingMessage(nextInputValue, isSending);
    if (outgoingMessage) {
      onSendMessage(outgoingMessage);
      setInputValue('');
      resetTranscription();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submitMessageValue(inputValue);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitMessageValue(inputValue);
    }
  };

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
  }, [inputValue]);

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
      <div className={`message-input-container${isCentered ? ' message-input-centered' : ''}`}>
        <form onSubmit={handleSubmit} className="message-input-form" data-testid="composer-container">
          <div className="message-input-top-row">
            <label htmlFor="chat-input" className="visually-hidden">Type your message</label>
            <textarea
              ref={textareaRef}
              id="chat-input"
              value={inputValue}
              onChange={handleInputChange}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything"
              disabled={isSending}
              className="message-input"
              rows={1}
              style={{ minHeight: '24px', maxHeight: '200px' }}
              aria-label="Type your message"
            />
          </div>

          <div className="message-input-bottom-row">
            <div className="message-input-left-actions">
              <button type="button" className="message-icon-btn" aria-label="Add attachment" data-testid="plus-btn">
                <Plus size={18} />
              </button>

              {thinkingVisible ? (
                <div className="message-thinking-pill-wrap">
                  <button
                    type="button"
                    className="message-close-thinking"
                    onClick={() => setThinkingVisible(false)}
                    aria-label="Close thinking mode"
                  >
                    <X size={14} />
                  </button>
                  <button type="button" className="message-thinking-pill" data-testid="thinking-mode-btn" aria-label="Thinking mode">
                    <Sparkles size={15} />
                    <span>Thinking</span>
                    <ChevronDown size={14} />
                  </button>
                </div>
              ) : null}
            </div>

            <div className="message-input-right-actions">
              <button type="button" className="message-icon-btn" aria-label="Voice input" data-testid="voice-btn">
                <Mic size={18} />
              </button>
              {isSending ? (
                <button
                  type="button"
                  className="message-send-btn message-stop-btn"
                  onClick={() => onStopResponse?.()}
                  aria-label="Stop response"
                  data-testid="stop-generating-btn"
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  className="message-send-btn"
                  disabled={!inputValue.trim()}
                  aria-label="Send message"
                  data-testid="send-btn"
                >
                  <ArrowUp size={16} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </form>

        {!isCentered ? (
          <p className="message-input-disclaimer">ChatGPT can make mistakes. Check important info.</p>
        ) : null}
      </div>
    </>
  );
}

MessageInput.propTypes = {
  onSendMessage: PropTypes.func.isRequired,
  isSending: PropTypes.bool,
  voiceModeEnabled: PropTypes.bool,
  onStopResponse: PropTypes.func,
  isCentered: PropTypes.bool,
};

export default MessageInput;
