import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  ArrowUp,
  ChevronDown,
  Globe,
  Image,
  Mic,
  MoreHorizontal,
  Plus,
  ShoppingBag,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
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
  const plusMenuRef = useRef(null);
  const thinkingMenuRef = useRef(null);
  const [thinkingVisible, setThinkingVisible] = useState(true);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const [thinkingMode, setThinkingMode] = useState('Thinking');
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

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;
      if (plusMenuRef.current && !plusMenuRef.current.contains(target)) {
        setPlusMenuOpen(false);
      }
      if (thinkingMenuRef.current && !thinkingMenuRef.current.contains(target)) {
        setThinkingMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

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
              <div className="message-action-dropdown" ref={plusMenuRef}>
                <button
                  type="button"
                  className="message-icon-btn"
                  aria-label="Add attachment"
                  data-testid="plus-btn"
                  aria-expanded={plusMenuOpen}
                  onClick={() => {
                    setPlusMenuOpen((current) => !current);
                  }}
                >
                  <Plus size={18} />
                </button>
                {plusMenuOpen ? (
                  <div className="message-dropdown-menu" role="menu">
                    <button type="button" className="message-dropdown-item" role="menuitem">
                      <Image size={16} />
                      <span>Add photos & files</span>
                    </button>
                    <button type="button" className="message-dropdown-item" role="menuitem">
                      <Sparkles size={16} />
                      <span>Create image</span>
                    </button>
                    <button type="button" className="message-dropdown-item" role="menuitem">
                      <Sparkles size={16} />
                      <span>Deep research</span>
                    </button>
                    <button type="button" className="message-dropdown-item" role="menuitem">
                      <ShoppingBag size={16} />
                      <span>Shopping research</span>
                    </button>
                    <button type="button" className="message-dropdown-item" role="menuitem">
                      <Globe size={16} />
                      <span>Web search</span>
                    </button>
                    <button type="button" className="message-dropdown-item" role="menuitem">
                      <MoreHorizontal size={16} />
                      <span>More</span>
                    </button>
                  </div>
                ) : null}
              </div>

              {thinkingVisible ? (
                <div className="message-thinking-pill-wrap" ref={thinkingMenuRef}>
                  <button
                    type="button"
                    className="message-close-thinking"
                    onClick={() => setThinkingVisible(false)}
                    aria-label="Close thinking mode"
                  >
                    <X size={14} />
                  </button>
                  <button
                    type="button"
                    className="message-thinking-pill"
                    data-testid="thinking-mode-btn"
                    aria-label="Thinking mode"
                    aria-expanded={thinkingMenuOpen}
                    onClick={() => {
                      setThinkingMenuOpen((current) => !current);
                    }}
                  >
                    <Sparkles size={15} />
                    <span>{thinkingMode}</span>
                    <ChevronDown size={14} />
                  </button>
                  {thinkingMenuOpen ? (
                    <div className="message-dropdown-menu message-thinking-menu" role="menu">
                      {['Thinking', 'Search', 'Reason'].map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className="message-dropdown-item"
                          role="menuitem"
                          onClick={() => {
                            setThinkingMode(mode);
                            setThinkingMenuOpen(false);
                          }}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  ) : null}
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
