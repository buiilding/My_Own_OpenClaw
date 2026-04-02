import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { useChatComposerDraft } from '../hooks/useChatComposerDraft';
import { useCurrentTurnPresentationState } from '../hooks/useCurrentTurnPresentationState';
import { useResponseOverlayPhase } from '../hooks/useResponseOverlayPhase';
import { IpcBridge, INVOKE_CHANNELS, SEND_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  useChatboxDragWindowBindings,
  useChatboxFocusBindings,
  useChatboxVisualAnchorBindings,
  useChatboxWakewordSttTriggerBinding,
} from '../hooks/useChatBoxBindings';
import { useVoiceMode } from '../../voice/hooks/useVoiceMode';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { ApiClient } from '../../../infrastructure/api/client';
import { isDevUiEnabled } from '../utils/devUiFlag';
import {
  createChatboxDragState,
  getChatboxDragTarget,
  startChatboxDrag,
  stopChatboxDrag,
} from '../utils/chatbox/chatboxPillLayout';
import { COMPACTION_THINKING_STATUS } from '../utils/chatStream/chatStreamThinkingStatus';
import {
  AttachmentIcon,
  CompactIcon,
  CloseIcon,
  ScreenshotIcon,
  SendIcon,
  SettingsIcon,
  SoundIcon,
} from './chatbox/ChatBoxIcons';
import ChatComposerSurface from './ChatComposerSurface';

function applyBooleanConfigUpdate(updateConfig, key, nextValue) {
  if (typeof updateConfig !== 'function') {
    return false;
  }
  updateConfig({
    [key]: nextValue,
  });
  return true;
}

function ChatBox() {
  const { config, updateConfig } = useAppConfigContext();
  const messages = useChatStore((state) => state.messages);
  const isSending = useChatStore((state) => state.isSending);
  const activeConversationRef = useChatStore((state) => state.activeConversationRef);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setThinkingSourceEventType = useChatStore((state) => state.setThinkingSourceEventType);
  const { sendMessage } = useChatMessageSender(undefined, {
    senderSurface: 'overlay-chatbox',
  });
  const overlayPhase = useResponseOverlayPhase();
  const [wakewordSttSessionActive, setWakewordSttSessionActive] = useState(false);
  const [composerSurfaceHeight, setComposerSurfaceHeight] = useState(0);
  const inputRef = useRef(null);
  const pillRef = useRef(null);
  const loopInteractionLockedRef = useRef(false);
  const dragStateRef = useRef(createChatboxDragState());
  const chatboxHitTestActiveRef = useRef(null);
  const wakewordSttEnabled = config?.wakeword_stt_enabled === true;
  const speechModeEnabled = config?.speech_mode_enabled === true;
  const includeQueryScreenshot = config?.include_query_screenshot ?? true;
  const { isBusy: loopInteractionLocked } = useCurrentTurnPresentationState({
    phase: overlayPhase,
    isSending,
    messages,
  });
  const devUiEnabled = isDevUiEnabled();
  const {
    attachmentInputRef,
    clipboardImages,
    selectedReadableFiles,
    inputValue,
    setInputValue,
    updateTranscription,
    resetTranscription,
    handleInputChange,
    handleComposerPaste,
    handleAttachmentSelection,
    submitMessageValue,
    setClipboardImages,
    setSelectedReadableFiles,
    hasAttachments,
  } = useChatComposerDraft({
    isSubmitBlocked: loopInteractionLocked,
    onSendMessage: sendMessage,
    onBeforeSend: () => {
      setWakewordSttSessionActive(false);
    },
  });

  const focusInput = useCallback(() => {
    if (loopInteractionLockedRef.current) {
      inputRef.current?.blur();
      return;
    }
    inputRef.current?.focus();
    const textLength = inputRef.current?.value?.length || 0;
    inputRef.current?.setSelectionRange?.(textLength, textLength);
  }, []);

  useChatboxFocusBindings(focusInput);
  useChatboxWakewordSttTriggerBinding({
    wakewordSttEnabled,
    resetTranscription,
    setInputValue,
    setWakewordSttSessionActive,
    focusInput,
  });

  useEffect(() => {
    if (!wakewordSttEnabled && wakewordSttSessionActive) {
      setWakewordSttSessionActive(false);
    }
  }, [wakewordSttEnabled, wakewordSttSessionActive]);

  useEffect(() => {
    loopInteractionLockedRef.current = loopInteractionLocked;
  }, [loopInteractionLocked]);

  useEffect(() => {
    if (!loopInteractionLocked) {
      return;
    }
    inputRef.current?.blur();
  }, [loopInteractionLocked]);

  const setChatboxHitTestActive = useCallback((active) => {
    const nextActive = active === true;
    if (chatboxHitTestActiveRef.current === nextActive) {
      return;
    }
    chatboxHitTestActiveRef.current = nextActive;
    IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_HIT_TEST_ACTIVE, {
      active: nextActive,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setChatboxHitTestActive(false);
    return () => {
      setChatboxHitTestActive(false);
    };
  }, [setChatboxHitTestActive]);

  useEffect(() => {
    if (loopInteractionLocked) {
      setChatboxHitTestActive(false);
    }
  }, [loopInteractionLocked, setChatboxHitTestActive]);

  useVoiceMode(
    wakewordSttEnabled && wakewordSttSessionActive,
    (text, isFinal) => {
      updateTranscription(text);
      if (isFinal) {
        setWakewordSttSessionActive(false);
      }
    },
    () => {
      setWakewordSttSessionActive(false);
    },
  );

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    void submitMessageValue(inputValue);
  }, [inputValue, submitMessageValue]);

  const handleOpenConfig = useCallback(async () => {
    if (loopInteractionLocked) {
      return;
    }
    try {
      setChatboxHitTestActive(false);
      await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW, {
        maximize: true,
        open: 'chat',
      });
    } catch (error) {
      console.warn('[ChatBox] Failed to show main window:', error);
    }
  }, [loopInteractionLocked, setChatboxHitTestActive]);

  const handleHideChatbox = useCallback(async () => {
    if (loopInteractionLocked) {
      return;
    }
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX);
    } catch (error) {
      console.warn('[ChatBox] Failed to hide chat window:', error);
    }
  }, [loopInteractionLocked]);

  const handleComposerKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitMessageValue(inputValue);
    }
  }, [inputValue, submitMessageValue]);

  const handleConfigToggle = useCallback((key, nextValue, options = {}) => {
    if (loopInteractionLocked) {
      return;
    }
    const didUpdate = applyBooleanConfigUpdate(updateConfig, key, nextValue);
    if (!didUpdate) {
      return;
    }
    if (options.focusInputAfter) {
      focusInput();
    }
  }, [focusInput, loopInteractionLocked, updateConfig]);

  const handleToggleQueryScreenshot = useCallback(() => {
    handleConfigToggle('include_query_screenshot', !includeQueryScreenshot, {
      focusInputAfter: true,
    });
  }, [handleConfigToggle, includeQueryScreenshot]);

  const handleToggleSpeechMode = useCallback(() => {
    handleConfigToggle('speech_mode_enabled', !speechModeEnabled);
  }, [handleConfigToggle, speechModeEnabled]);

  const handleDevAutoCompaction = useCallback(() => {
    if (loopInteractionLocked) {
      return;
    }
    setThinkingStatus(COMPACTION_THINKING_STATUS);
    setThinkingSourceEventType('context-compaction-started');
    ApiClient.compactHistory(true, activeConversationRef || null);
  }, [
    activeConversationRef,
    loopInteractionLocked,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);

  const handleDragMove = useCallback((event) => {
    const nextTarget = getChatboxDragTarget(dragStateRef.current, event);
    if (!nextTarget) {
      return;
    }

    IpcBridge.send(SEND_CHANNELS.MOVE_CHATBOX_TO, nextTarget);
    event.preventDefault();
  }, []);

  const stopDragging = useCallback(() => {
    stopChatboxDrag(dragStateRef.current);
  }, []);

  useChatboxDragWindowBindings(handleDragMove, stopDragging);

  const handlePillMouseDown = useCallback((event) => {
    if (loopInteractionLocked || event.button !== 0) {
      return;
    }
    startChatboxDrag(
      dragStateRef.current,
      event,
      window.screenX,
      window.screenY,
    );
  }, [loopInteractionLocked]);

  const handleSurfaceClickCapture = useCallback((event) => {
    if (!dragStateRef.current.didDrag) {
      return;
    }
    dragStateRef.current.didDrag = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  useChatboxVisualAnchorBindings(composerSurfaceHeight);

  return (
    <div
      className={`chatbox-shell-wrap chatbox-input-shell-wrap${loopInteractionLocked ? ' loop-active' : ''}`}
    >
      <ChatComposerSurface
        surfaceRef={pillRef}
        textareaRef={inputRef}
        attachmentInputRef={attachmentInputRef}
        attachmentInputTestId="chatbox-attachment-input"
        onAttachmentSelection={(event) => {
          void handleAttachmentSelection(event).catch((error) => {
            console.warn('[ChatBox] Failed to parse selected attachments:', error);
          });
        }}
        onSubmit={handleSubmit}
        onMouseDown={handlePillMouseDown}
        onClickCapture={handleSurfaceClickCapture}
        onMouseEnter={() => {
          if (!loopInteractionLockedRef.current) {
            setChatboxHitTestActive(true);
          }
        }}
        onMouseMove={() => {
          if (!loopInteractionLockedRef.current) {
            setChatboxHitTestActive(true);
          }
        }}
        onMouseLeave={() => {
          setChatboxHitTestActive(false);
        }}
        inputValue={inputValue}
        onInputChange={handleInputChange}
        onPaste={(event) => {
          void handleComposerPaste(event).catch((error) => {
            console.warn('[ChatBox] Failed to parse pasted image:', error);
          });
        }}
        onKeyDown={handleComposerKeyDown}
        placeholder="Ask me anything..."
        inputId="chatbox-input"
        inputAriaLabel="Type your message"
        disabled={loopInteractionLocked}
        clipboardImages={clipboardImages}
        readableFiles={selectedReadableFiles}
        onRemoveImage={(id) => {
          setClipboardImages((previous) => previous.filter((image) => image.id !== id));
        }}
        onRemoveFile={(id) => {
          setSelectedReadableFiles((previous) => previous.filter((file) => file.id !== id));
        }}
        leadingActions={(
          <>
            <button
              type="button"
              className="message-icon-btn chatbox-icon chatbox-config"
              onClick={handleOpenConfig}
              aria-label="Open config"
              title="Open config"
              disabled={loopInteractionLocked}
            >
              <SettingsIcon />
            </button>
            {devUiEnabled ? (
              <button
                type="button"
                className="message-icon-btn chatbox-icon chatbox-dev-compact"
                onClick={handleDevAutoCompaction}
                aria-label="Run auto compaction"
                title="Run auto compaction"
                disabled={loopInteractionLocked}
              >
                <CompactIcon />
              </button>
            ) : null}
            <button
              type="button"
              className="message-icon-btn chatbox-icon chatbox-attach"
              onClick={() => {
                attachmentInputRef.current?.click();
              }}
              aria-label="Add attachment"
              title="Add attachment"
              disabled={loopInteractionLocked}
            >
              <AttachmentIcon />
            </button>
          </>
        )}
        trailingActions={(
          <>
            <button
              type="button"
              className={`message-icon-btn chatbox-icon chatbox-screenshot${includeQueryScreenshot ? ' is-enabled' : ''}`}
              aria-label="Toggle auto screenshot"
              title={includeQueryScreenshot ? 'Disable auto screenshot' : 'Enable auto screenshot'}
              onClick={handleToggleQueryScreenshot}
              disabled={loopInteractionLocked}
            >
              <ScreenshotIcon />
            </button>
            <button
              type="button"
              className={`message-icon-btn chatbox-icon chatbox-tts${speechModeEnabled ? ' is-enabled' : ''}`}
              aria-label={speechModeEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
              title={speechModeEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
              onClick={handleToggleSpeechMode}
              disabled={loopInteractionLocked}
            >
              <SoundIcon />
            </button>
            <button
              type="button"
              className="message-icon-btn chatbox-icon chatbox-hide"
              onClick={handleHideChatbox}
              aria-label="Hide chat pill"
              title="Hide chat pill"
              disabled={loopInteractionLocked}
            >
              <CloseIcon />
            </button>
            <button
              type="submit"
              className="message-send-btn chatbox-send"
              aria-label="Send message"
              title="Send message"
              disabled={(
                loopInteractionLocked
                || (!inputValue.trim() && !hasAttachments)
              )}
            >
              <SendIcon />
            </button>
          </>
        )}
        surfaceClassName="chatbox-pill"
        onSurfaceHeightChange={setComposerSurfaceHeight}
        maxTextareaHeight={200}
      />
    </div>
  );
}

export default ChatBox;
