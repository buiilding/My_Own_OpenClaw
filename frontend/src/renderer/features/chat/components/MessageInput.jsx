import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  ArrowUp,
  Image,
  Mic,
  Plus,
  Square,
  X,
} from 'lucide-react';
import { useTranscription } from '../hooks/useTranscription';
import { buildOutgoingMessage } from '../utils/messageInput';
import { useVoiceMode } from '../../voice/hooks/useVoiceMode';
import VoiceStatus from '../../voice/components/VoiceStatus';
import { parseClipboardImageItems } from '../utils/clipboardImageUtils';
import { parseSelectedComposerFiles } from '../utils/fileAttachmentUtils';

function MessageInput({
  onSendMessage,
  isSending,
  voiceModeEnabled = false,
  onStopResponse = undefined,
  isCentered = false,
  focusRequestToken = 0,
}) {
  const textareaRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const lastHandledFocusRequestRef = useRef(focusRequestToken);
  const plusMenuRef = useRef(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [clipboardImages, setClipboardImages] = useState([]);
  const [selectedReadableFiles, setSelectedReadableFiles] = useState([]);
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
    const outgoingMessage = buildOutgoingMessage(
      nextInputValue,
      isSending,
      clipboardImages,
      selectedReadableFiles,
    );
    if (outgoingMessage) {
      onSendMessage(outgoingMessage);
      setInputValue('');
      resetTranscription();
      setClipboardImages([]);
      setSelectedReadableFiles([]);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = '';
      }
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
    const clipboardItems = event.clipboardData?.items || [];
    const hasImageItems = Array.from(clipboardItems).some((item) => item?.type?.startsWith('image/'));
    if (!hasImageItems) {
      handlePaste(event);
      return;
    }

    event.preventDefault();
    try {
      const parsedImages = await parseClipboardImageItems(clipboardItems);
      if (parsedImages.length > 0) {
        setClipboardImages((previous) => [...previous, ...parsedImages]);
      }
    } catch (error) {
      console.warn('[MessageInput] Failed to parse pasted image:', error);
    }
  }, [handlePaste]);

  const handleAttachmentSelection = useCallback(async (event) => {
    const fileList = event?.target?.files || [];
    if (!fileList || fileList.length === 0) {
      return;
    }

    try {
      const parsedAttachments = await parseSelectedComposerFiles(fileList);
      if (parsedAttachments.imageAttachments.length > 0) {
        setClipboardImages((previous) => [...previous, ...parsedAttachments.imageAttachments]);
      }
      if (parsedAttachments.readableFiles.length > 0) {
        setSelectedReadableFiles((previous) => [...previous, ...parsedAttachments.readableFiles]);
      }
    } catch (error) {
      console.warn('[MessageInput] Failed to parse selected attachments:', error);
    } finally {
      if (event?.target) {
        event.target.value = '';
      }
    }
  }, []);

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
          {selectedReadableFiles.length > 0 ? (
            <div className="message-file-preview-row">
              {selectedReadableFiles.map((file, index) => (
                <div className="message-file-preview-pill" key={file.id || `${file.filename}-${index}`}>
                  <span className="message-file-preview-name">{file.filename}</span>
                  <button
                    type="button"
                    className="message-file-preview-remove"
                    aria-label={`Remove attached file ${index + 1}`}
                    onClick={() => {
                      setSelectedReadableFiles((previous) => (
                        previous.filter((entry) => entry.id !== file.id)
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

          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            data-testid="attachment-input"
            style={{ display: 'none' }}
            onChange={(event) => {
              void handleAttachmentSelection(event);
            }}
          />

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
                  <div className="message-dropdown-menu message-add-photos-under-pill" role="menu">
                    <button
                      type="button"
                      className="message-dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        attachmentInputRef.current?.click();
                      }}
                    >
                      <Image size={16} />
                      <span>Add photos & files</span>
                    </button>
                  </div>
                ) : null}
              </div>
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
                  disabled={(
                    !inputValue.trim()
                    && clipboardImages.length === 0
                    && selectedReadableFiles.length === 0
                  )}
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
