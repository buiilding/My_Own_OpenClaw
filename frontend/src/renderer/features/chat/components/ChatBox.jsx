import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { useCurrentTurnPresentationState } from '../hooks/useCurrentTurnPresentationState';
import { useResponseOverlayPhase } from '../hooks/useResponseOverlayPhase';
import { useTranscription } from '../hooks/useTranscription';
import { IpcBridge, INVOKE_CHANNELS, SEND_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  useChatboxDragWindowBindings,
  useChatboxFocusBindings,
  useChatboxVisualAnchorBindings,
  useChatboxWakewordSttTriggerBinding,
} from '../hooks/useChatBoxBindings';
import { useTextareaAutoResize } from '../hooks/useMessageInputUiBindings';
import { useVoiceMode } from '../../voice/hooks/useVoiceMode';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { ApiClient } from '../../../infrastructure/api/client';
import { isDevUiEnabled } from '../utils/devUiFlag';
import {
  buildChatboxPillClipPath,
  createChatboxDragState,
  getChatboxDragTarget,
  getChatboxPillClipHeight,
  startChatboxDrag,
  stopChatboxDrag,
} from '../utils/chatbox/chatboxPillLayout';
import { buildOutgoingMessage } from '../utils/message/messageInput';
import { parseClipboardImageItems } from '../utils/clipboardImageUtils';
import { parseSelectedComposerFiles } from '../utils/fileAttachmentUtils';
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
import ChatBoxImagePreviewRow from './chatbox/ChatBoxImagePreviewRow';

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
  const [clipboardImages, setClipboardImages] = useState([]);
  const [selectedReadableFiles, setSelectedReadableFiles] = useState([]);
  const inputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const pillRef = useRef(null);
  const sendButtonRef = useRef(null);
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
    inputValue,
    setInputValue,
    getInputValue,
    updateTranscription,
    resetTranscription,
    handleInputChange,
    handlePaste,
  } = useTranscription();

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

  const resizeComposer = useCallback(() => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.style.height = 'auto';
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 128)}px`;
  }, []);

  useTextareaAutoResize(inputValue, resizeComposer);

  const syncCloseButtonAnchor = useCallback(() => {
    const pillElement = pillRef.current;
    const sendButtonElement = sendButtonRef.current;
    if (!pillElement || !sendButtonElement) {
      return;
    }

    const pillRect = pillElement.getBoundingClientRect();
    const sendRect = sendButtonElement.getBoundingClientRect();
    if (pillRect.width <= 0 || sendRect.width <= 0) {
      return;
    }

    const pillWidth = Math.max(
      Math.round(Number(pillElement.offsetWidth) || 0),
      Math.round(Number(pillRect.width) || 0),
    );
    const pillHeight = Math.max(
      Math.round(Number(pillElement.offsetHeight) || 0),
      Math.round(Number(pillRect.height) || 0),
    );
    if (pillWidth <= 0 || pillHeight <= 0) {
      return;
    }

    const centerX = Math.round((sendRect.left - pillRect.left) + (sendRect.width / 2));
    pillElement.style.setProperty('--chatbox-close-center-x', `${centerX}px`);
    const clipPath = buildChatboxPillClipPath({
      width: pillWidth,
      height: getChatboxPillClipHeight(pillHeight),
      centerX,
    });
    pillElement.style.setProperty('--chatbox-pill-clip-path', clipPath);
  }, []);

  useLayoutEffect(() => {
    syncCloseButtonAnchor();

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', syncCloseButtonAnchor);
    }

    let resizeObserver = null;
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => {
        syncCloseButtonAnchor();
      });
      if (pillRef.current) {
        resizeObserver.observe(pillRef.current);
      }
      if (sendButtonRef.current) {
        resizeObserver.observe(sendButtonRef.current);
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', syncCloseButtonAnchor);
      }
      resizeObserver?.disconnect();
    };
  }, [syncCloseButtonAnchor, devUiEnabled]);

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

  const handleSend = useCallback(async () => {
    const outgoingMessage = buildOutgoingMessage(
      getInputValue(),
      loopInteractionLocked,
      clipboardImages,
      selectedReadableFiles,
    );
    if (!outgoingMessage) {
      return;
    }
    setWakewordSttSessionActive(false);
    resetTranscription();
    setInputValue('');
    setClipboardImages([]);
    setSelectedReadableFiles([]);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    await sendMessage(outgoingMessage);
  }, [
    clipboardImages,
    getInputValue,
    loopInteractionLocked,
    resetTranscription,
    selectedReadableFiles,
    sendMessage,
    setInputValue,
  ]);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    void handleSend();
  }, [handleSend]);

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

  const handleComposerPaste = useCallback(async (event) => {
    if (loopInteractionLocked) {
      return;
    }
    const clipboardItems = event.clipboardData?.items || [];
    const hasImageItems = Array.from(clipboardItems).some((item) => item?.type?.startsWith('image/'));
    if (!hasImageItems) {
      handlePaste(event);
      return;
    }
    try {
      const parsedImages = await parseClipboardImageItems(clipboardItems);
      if (parsedImages.length === 0) {
        return;
      }
      event.preventDefault();
      setClipboardImages((previous) => [...previous, ...parsedImages]);
    } catch (error) {
      console.warn('[ChatBox] Failed to parse pasted image:', error);
    }
  }, [handlePaste, loopInteractionLocked]);

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
      console.warn('[ChatBox] Failed to parse selected attachments:', error);
    } finally {
      if (event?.target) {
        event.target.value = '';
      }
    }
  }, []);

  const handleComposerKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

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

  const handlePillClickCapture = useCallback((event) => {
    if (!dragStateRef.current.didDrag) {
      return;
    }
    dragStateRef.current.didDrag = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);
  const hasAttachmentPreview = clipboardImages.length > 0 || selectedReadableFiles.length > 0;

  useChatboxVisualAnchorBindings(hasAttachmentPreview);

  return (
    <div
      className={`chatbox-shell-wrap chatbox-input-shell-wrap${hasAttachmentPreview ? ' with-preview' : ''}${loopInteractionLocked ? ' loop-active' : ''}`}
    >
      <div className="chatbox-shell">
        <form
          ref={pillRef}
          className={`chatbox-pill${hasAttachmentPreview ? ' with-preview' : ''}`}
          onSubmit={handleSubmit}
          onMouseDown={handlePillMouseDown}
          onClickCapture={handlePillClickCapture}
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
        >
          <button
            type="button"
            className="chatbox-close-badge"
            onClick={handleHideChatbox}
            aria-label="Hide chat pill"
            title="Hide chat pill"
            disabled={loopInteractionLocked}
          >
            <CloseIcon />
          </button>
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            data-testid="chatbox-attachment-input"
            style={{ display: 'none' }}
            onChange={(event) => {
              void handleAttachmentSelection(event);
            }}
          />
          <ChatBoxImagePreviewRow
            clipboardImages={clipboardImages}
            readableFiles={selectedReadableFiles}
            onRemoveImage={(id) => {
              setClipboardImages((previous) => previous.filter((image) => image.id !== id));
            }}
            onRemoveFile={(id) => {
              setSelectedReadableFiles((previous) => previous.filter((file) => file.id !== id));
            }}
          />
          <div className="chatbox-main-row">
            <button
              type="button"
              className="chatbox-icon chatbox-config"
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
                className="chatbox-icon chatbox-dev-compact"
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
              className="chatbox-icon chatbox-attach"
              onClick={() => {
                attachmentInputRef.current?.click();
              }}
              aria-label="Add attachment"
              title="Add attachment"
              disabled={loopInteractionLocked}
            >
              <AttachmentIcon />
            </button>
            <div className="chatbox-input-wrap">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onPaste={handleComposerPaste}
                onKeyDown={handleComposerKeyDown}
                placeholder="Ask me anything..."
                className="chatbox-input"
                disabled={loopInteractionLocked}
                rows={1}
              />
            </div>
            <button
              type="button"
              className={`chatbox-icon chatbox-screenshot${includeQueryScreenshot ? ' is-enabled' : ''}`}
              aria-label="Toggle auto screenshot"
              title={includeQueryScreenshot ? 'Disable auto screenshot' : 'Enable auto screenshot'}
              onClick={handleToggleQueryScreenshot}
              disabled={loopInteractionLocked}
            >
              <ScreenshotIcon />
            </button>
            <button
              type="button"
              className={`chatbox-icon chatbox-tts${speechModeEnabled ? ' is-enabled' : ''}`}
              aria-label="Toggle text-to-speech"
              title={speechModeEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
              onClick={handleToggleSpeechMode}
              disabled={loopInteractionLocked}
            >
              <SoundIcon />
            </button>
            <button
              ref={sendButtonRef}
              type="submit"
              className="chatbox-icon chatbox-send"
              aria-label="Send message"
              title="Send message"
              disabled={(
                loopInteractionLocked
                || (!inputValue.trim() && clipboardImages.length === 0 && selectedReadableFiles.length === 0)
              )}
            >
              <SendIcon />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChatBox;
