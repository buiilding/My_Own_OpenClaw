import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  normalizeArtifactImageContentType,
  resolveArtifactImageExtension,
} from '../../../infrastructure/services/ArtifactImageUtils';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to load pasted image data.'));
    };
    reader.onerror = () => {
      reject(reader.error || new Error('Failed to read pasted image.'));
    };
    reader.readAsDataURL(file);
  });
}

function parseDataUrlImage(dataUrl, fallbackContentType = null) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    return null;
  }
  const contentType = normalizeArtifactImageContentType(match[1] || fallbackContentType);
  const extension = resolveArtifactImageExtension(contentType);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    base64: match[2],
    contentType,
    filename: `clipboard-image.${extension}`,
    previewUrl: dataUrl,
  };
}

function MessageInput({
  onSendMessage,
  isSending,
  voiceModeEnabled = false,
  onStopResponse = undefined,
  isCentered = false,
  focusRequestToken = 0,
}) {
  const textareaRef = useRef(null);
  const lastHandledFocusRequestRef = useRef(focusRequestToken);
  const plusMenuRef = useRef(null);
  const thinkingMenuRef = useRef(null);
  const [thinkingVisible, setThinkingVisible] = useState(true);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const [thinkingMode, setThinkingMode] = useState('Thinking');
  const [clipboardImages, setClipboardImages] = useState([]);
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
    const outgoingMessage = buildOutgoingMessage(nextInputValue, isSending, clipboardImages);
    if (outgoingMessage) {
      onSendMessage(outgoingMessage);
      setInputValue('');
      resetTranscription();
      setClipboardImages([]);
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

  const handleComposerPaste = useCallback(async (event) => {
    const clipboardItems = Array.from(event.clipboardData?.items || []);
    const imageItems = clipboardItems.filter((item) => item.type?.startsWith('image/'));
    if (imageItems.length === 0) {
      handlePaste(event);
      return;
    }

    event.preventDefault();
    try {
      const parsedImages = (await Promise.all(
        imageItems.map(async (imageItem) => {
          const imageFile = imageItem.getAsFile();
          if (!imageFile) {
            return null;
          }
          const dataUrl = await readFileAsDataUrl(imageFile);
          return parseDataUrlImage(dataUrl, imageItem.type || imageFile.type || null);
        }),
      )).filter(Boolean);
      if (parsedImages.length > 0) {
        setClipboardImages((previous) => [...previous, ...parsedImages]);
      }
    } catch (error) {
      console.warn('[MessageInput] Failed to parse pasted image:', error);
    }
  }, [handlePaste]);

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

  useEffect(() => {
    if (focusRequestToken === lastHandledFocusRequestRef.current) {
      return;
    }
    lastHandledFocusRequestRef.current = focusRequestToken;
    if (!textareaRef.current || isSending) {
      return;
    }
    textareaRef.current.focus();
    const textLength = textareaRef.current.value.length;
    textareaRef.current.setSelectionRange(textLength, textLength);
  }, [focusRequestToken, isSending]);

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
          {clipboardImages.length > 0 ? (
            <div className="message-image-preview-row">
              {clipboardImages.map((clipboardImage, index) => (
                <div className="message-image-preview-card" key={clipboardImage.id || index}>
                  <img
                    src={clipboardImage.previewUrl}
                    alt={`Pasted image preview ${index + 1}`}
                    className="message-image-preview-thumb"
                  />
                  <button
                    type="button"
                    className="message-image-preview-remove"
                    aria-label={`Remove pasted image ${index + 1}`}
                    onClick={() => {
                      setClipboardImages((previous) => (
                        previous.filter((image) => image.id !== clipboardImage.id)
                      ));
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="message-input-top-row">
            <label htmlFor="chat-input" className="visually-hidden">Type your message</label>
            <textarea
              ref={textareaRef}
              id="chat-input"
              value={inputValue}
              onChange={handleInputChange}
              onPaste={handleComposerPaste}
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
                    aria-label={`${thinkingMode} mode`}
                    title={`${thinkingMode} mode`}
                    aria-expanded={thinkingMenuOpen}
                    onClick={() => {
                      setThinkingMenuOpen((current) => !current);
                    }}
                  >
                    <Sparkles size={15} />
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
          <p className="message-input-disclaimer">WindieOS can make mistakes. Check important info.</p>
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
  focusRequestToken: PropTypes.number,
};

export default MessageInput;
