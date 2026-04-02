import { useCallback, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  ArrowUp,
  Mic,
  Plus,
  Square,
  Image,
} from 'lucide-react';
import { useChatComposerDraft } from '../hooks/useChatComposerDraft';
import { useVoiceMode } from '../../voice/hooks/useVoiceMode';
import VoiceStatus from '../../voice/components/VoiceStatus';
import {
  useClosePlusMenuOnSending,
  useComposerFocusRequest,
  useDismissPlusMenu,
} from '../hooks/useMessageInputUiBindings';
import ChatComposerSurface from './ChatComposerSurface';

function MessageInput({
  onSendMessage,
  isSending,
  voiceModeEnabled = false,
  onToggleVoiceMode = undefined,
  onStopResponse = undefined,
  isCentered = false,
  focusRequestToken = 0,
}) {
  const textareaRef = useRef(null);
  const lastHandledFocusRequestRef = useRef(focusRequestToken);
  const plusMenuRef = useRef(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const {
    attachmentInputRef,
    clipboardImages,
    selectedReadableFiles,
    inputValue,
    getInputValue,
    updateTranscription,
    handleInputChange,
    submitMessageValue,
    setClipboardImages,
    setSelectedReadableFiles,
    handleComposerPaste,
    handleAttachmentSelection,
  } = useChatComposerDraft({
    isSubmitBlocked: isSending,
    onSendMessage,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    void submitMessageValue(inputValue);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitMessageValue(inputValue);
    }
  };

  const handleFocusRequest = useCallback((nextFocusRequestToken) => {
    if (nextFocusRequestToken === lastHandledFocusRequestRef.current) {
      return;
    }
    lastHandledFocusRequestRef.current = nextFocusRequestToken;
    if (!textareaRef.current || isSending) {
      return;
    }
    textareaRef.current.focus();
    const textLength = textareaRef.current.value.length;
    textareaRef.current.setSelectionRange(textLength, textLength);
  }, [isSending]);

  useDismissPlusMenu(plusMenuRef, setPlusMenuOpen);
  useClosePlusMenuOnSending(isSending, setPlusMenuOpen);
  useComposerFocusRequest({
    focusRequestToken,
    handleFocusRequest,
  });

  const { isConnected, isRecording, error } = useVoiceMode(
    voiceModeEnabled,
    (text) => {
      updateTranscription(text);
    },
    () => {
      void submitMessageValue(getInputValue());
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
        <ChatComposerSurface
          textareaRef={textareaRef}
          attachmentInputRef={attachmentInputRef}
          attachmentInputTestId="attachment-input"
          onAttachmentSelection={(event) => {
            void handleAttachmentSelection(event);
          }}
          onSubmit={handleSubmit}
          inputValue={inputValue}
          onInputChange={handleInputChange}
          onPaste={handleComposerPaste}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything"
          inputAriaLabel="Type your message"
          disabled={isSending}
          clipboardImages={clipboardImages}
          readableFiles={selectedReadableFiles}
          onRemoveImage={(id) => {
            setClipboardImages((previous) => (
              previous.filter((image) => image.id !== id)
            ));
          }}
          onRemoveFile={(id) => {
            setSelectedReadableFiles((previous) => (
              previous.filter((entry) => entry.id !== id)
            ));
          }}
          leadingActions={(
            <div className="message-action-dropdown" ref={plusMenuRef}>
              <button
                type="button"
                className="message-icon-btn"
                aria-label="Add attachment"
                data-testid="plus-btn"
                aria-expanded={plusMenuOpen}
                disabled={isSending}
                onClick={() => {
                  setPlusMenuOpen((current) => !current);
                }}
              >
                <Plus size={18} />
              </button>
              {plusMenuOpen && !isSending ? (
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
          )}
          trailingActions={(
            <>
              <button
                type="button"
                className={`message-icon-btn${voiceModeEnabled ? ' is-enabled' : ''}`}
                aria-label={voiceModeEnabled ? 'Disable voice input' : 'Enable voice input'}
                aria-pressed={voiceModeEnabled}
                data-testid="voice-btn"
                disabled={isSending || typeof onToggleVoiceMode !== 'function'}
                onClick={() => onToggleVoiceMode?.()}
              >
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
            </>
          )}
          formTestId="composer-container"
          maxTextareaHeight={200}
        />

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
  onToggleVoiceMode: PropTypes.func,
  onStopResponse: PropTypes.func,
  isCentered: PropTypes.bool,
  focusRequestToken: PropTypes.number,
};

export default MessageInput;
