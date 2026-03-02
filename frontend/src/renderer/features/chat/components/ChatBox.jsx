import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { useResponseOverlayPhase } from '../hooks/useResponseOverlayPhase';
import { useTranscription } from '../hooks/useTranscription';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS, SEND_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { useVoiceMode } from '../../voice/hooks/useVoiceMode';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { ApiClient } from '../../../infrastructure/api/client';
import { isDevUiEnabled } from '../utils/devUiFlag';
import { buildOutgoingMessage } from '../utils/messageInput';
import { parseClipboardImageItems } from '../utils/clipboardImageUtils';
import { COMPACTION_THINKING_STATUS } from '../utils/chatStreamThinkingStatus';
import { extractOSstate } from '../../../infrastructure/services/SystemCapture';
import { isChatboxLoopInteractionLocked } from '../utils/chatboxSurfaceState';
import {
  normalizeArtifactImageContentType,
  resolveArtifactImageExtension,
} from '../../../infrastructure/services/ArtifactImageUtils';
import {
  CompactIcon,
  ScreenshotIcon,
  SendIcon,
  SettingsIcon,
  SoundIcon,
} from './ChatBoxIcons';
import ChatBoxImagePreviewRow from './ChatBoxImagePreviewRow';

const CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT = 64;
const CHATBOX_VISUAL_ANCHOR_HEIGHT_WITH_PREVIEW = 116;

function isDragBlockedTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest(
    'button, a, [role="button"], input, textarea, select, option, label, [role="textbox"], [contenteditable=""], [contenteditable="true"], [contenteditable=true], .chatbox-input-wrap, .chatbox-actions',
  ));
}

function ChatBox() {
  const { config, updateConfig } = useAppConfigContext();
  const isSending = useChatStore((state) => state.isSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setThinkingSourceEventType = useChatStore((state) => state.setThinkingSourceEventType);
  const { sendMessage } = useChatMessageSender(undefined, {
    senderSurface: 'overlay-chatbox',
  });
  const overlayPhase = useResponseOverlayPhase();
  const [wakewordSttSessionActive, setWakewordSttSessionActive] = useState(false);
  const [clipboardImages, setClipboardImages] = useState([]);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const inputRef = useRef(null);
  const dragStateRef = useRef({
    isDragging: false,
    startClientX: 0,
    startClientY: 0,
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    lastTargetX: null,
    lastTargetY: null,
  });
  const wakewordSttEnabled = config?.wakeword_stt_enabled === true;
  const speechModeEnabled = config?.speech_mode_enabled === true;
  const loopInteractionLocked = isChatboxLoopInteractionLocked({
    overlayPhase,
    isSending,
  });
  const devUiEnabled = isDevUiEnabled();
  const {
    inputValue,
    setInputValue,
    getInputValue,
    updateTranscription,
    resetTranscription,
    handleInputChange,
  } = useTranscription();

  const focusInput = useCallback(() => {
    if (loopInteractionLocked) {
      inputRef.current?.blur();
      return;
    }
    inputRef.current?.focus();
  }, [loopInteractionLocked]);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.CHATBOX_FOCUS, () => {
      focusInput();
    });
    return () => {
      removeListener?.();
    };
  }, [focusInput]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.WAKEWORD_STT_TRIGGER, () => {
      if (!wakewordSttEnabled) {
        setWakewordSttSessionActive(false);
        return;
      }
      resetTranscription();
      setInputValue('');
      setWakewordSttSessionActive(true);
      focusInput();
    });
    return () => {
      removeListener?.();
    };
  }, [focusInput, resetTranscription, setInputValue, wakewordSttEnabled]);

  useEffect(() => {
    if (!wakewordSttEnabled && wakewordSttSessionActive) {
      setWakewordSttSessionActive(false);
    }
  }, [wakewordSttEnabled, wakewordSttSessionActive]);

  useEffect(() => {
    if (!loopInteractionLocked) {
      return;
    }
    inputRef.current?.blur();
  }, [loopInteractionLocked]);

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
    const outgoingMessage = buildOutgoingMessage(getInputValue(), loopInteractionLocked, clipboardImages);
    if (!outgoingMessage) {
      return;
    }
    setWakewordSttSessionActive(false);
    resetTranscription();
    setInputValue('');
    setClipboardImages([]);
    await sendMessage(outgoingMessage);
  }, [clipboardImages, getInputValue, loopInteractionLocked, resetTranscription, sendMessage, setInputValue]);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    void handleSend();
  }, [handleSend]);

  const handleOpenSettings = useCallback(async () => {
    if (loopInteractionLocked) {
      return;
    }
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW, {
        maximize: true,
        open: 'chat',
      });
    } catch (error) {
      console.warn('[ChatBox] Failed to show main window:', error);
    }
  }, [loopInteractionLocked]);

  const handleComposerPaste = useCallback(async (event) => {
    if (loopInteractionLocked) {
      return;
    }
    try {
      const parsedImages = await parseClipboardImageItems(event.clipboardData?.items || []);
      if (parsedImages.length === 0) {
        return;
      }
      event.preventDefault();
      setClipboardImages((previous) => [...previous, ...parsedImages]);
    } catch (error) {
      console.warn('[ChatBox] Failed to parse pasted image:', error);
    }
  }, [loopInteractionLocked]);

  const handleCaptureScreenshot = useCallback(async () => {
    if (loopInteractionLocked || isCapturingScreenshot) {
      return;
    }
    setIsCapturingScreenshot(true);
    try {
      const capture = await extractOSstate(true, false, 0, false);
      if (!capture?.screenshot) {
        return;
      }
      const contentType = normalizeArtifactImageContentType(capture.screenshotContentType || 'image/png');
      const extension = resolveArtifactImageExtension(contentType);
      setClipboardImages((previous) => ([
        ...previous,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          base64: capture.screenshot,
          contentType,
          filename: `screenshot-${Date.now()}.${extension}`,
          previewUrl: `data:${contentType};base64,${capture.screenshot}`,
        },
      ]));
      focusInput();
    } catch (error) {
      console.warn('[ChatBox] Failed to capture screenshot:', error);
    } finally {
      setIsCapturingScreenshot(false);
    }
  }, [focusInput, isCapturingScreenshot, loopInteractionLocked]);

  const handleToggleSpeechMode = useCallback(() => {
    if (loopInteractionLocked) {
      return;
    }
    if (typeof updateConfig !== 'function') {
      return;
    }
    updateConfig({
      speech_mode_enabled: !speechModeEnabled,
    });
  }, [speechModeEnabled, loopInteractionLocked, updateConfig]);

  const handleDevAutoCompaction = useCallback(() => {
    if (loopInteractionLocked) {
      return;
    }
    setThinkingStatus(COMPACTION_THINKING_STATUS);
    setThinkingSourceEventType('context-compaction-started');
    ApiClient.compactHistory(true);
  }, [loopInteractionLocked, setThinkingSourceEventType, setThinkingStatus]);

  const handleDragMove = useCallback((event) => {
    const dragState = dragStateRef.current;
    if (!dragState.isDragging) {
      return;
    }

    const screenX = Math.round(Number(event.screenX) || 0);
    const screenY = Math.round(Number(event.screenY) || 0);
    const clientX = Math.round(Number(event.clientX) || 0);
    const clientY = Math.round(Number(event.clientY) || 0);
    const movedDistance = Math.abs(clientX - dragState.startClientX) + Math.abs(clientY - dragState.startClientY);

    if (movedDistance < 2) {
      return;
    }

    const nextX = screenX - dragState.pointerOffsetX;
    const nextY = screenY - dragState.pointerOffsetY;

    if (nextX === dragState.lastTargetX && nextY === dragState.lastTargetY) {
      return;
    }
    dragState.lastTargetX = nextX;
    dragState.lastTargetY = nextY;

    IpcBridge.send(SEND_CHANNELS.MOVE_CHATBOX_TO, { x: nextX, y: nextY });
    event.preventDefault();
  }, []);

  const stopDragging = useCallback(() => {
    dragStateRef.current.isDragging = false;
    dragStateRef.current.lastTargetX = null;
    dragStateRef.current.lastTargetY = null;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('blur', stopDragging);
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('blur', stopDragging);
    };
  }, [handleDragMove, stopDragging]);

  const handlePillMouseDown = useCallback((event) => {
    if (loopInteractionLocked || event.button !== 0 || isDragBlockedTarget(event.target)) {
      return;
    }
    const screenX = Math.round(Number(event.screenX) || 0);
    const screenY = Math.round(Number(event.screenY) || 0);
    const windowScreenX = Math.round(Number(window.screenX) || 0);
    const windowScreenY = Math.round(Number(window.screenY) || 0);

    dragStateRef.current.isDragging = true;
    dragStateRef.current.startClientX = Math.round(Number(event.clientX) || 0);
    dragStateRef.current.startClientY = Math.round(Number(event.clientY) || 0);
    dragStateRef.current.pointerOffsetX = screenX - windowScreenX;
    dragStateRef.current.pointerOffsetY = screenY - windowScreenY;
    dragStateRef.current.lastTargetX = windowScreenX;
    dragStateRef.current.lastTargetY = windowScreenY;
    event.preventDefault();
  }, [loopInteractionLocked]);
  const hasImagePreview = clipboardImages.length > 0;

  useEffect(() => {
    const nextAnchorHeight = hasImagePreview
      ? CHATBOX_VISUAL_ANCHOR_HEIGHT_WITH_PREVIEW
      : CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT;
    IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_VISUAL_ANCHOR_HEIGHT, {
      height: nextAnchorHeight,
    }).catch((error) => {
      console.warn('[ChatBox] Failed to sync visual anchor height:', error);
    });
  }, [hasImagePreview]);

  useEffect(() => {
    return () => {
      IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_VISUAL_ANCHOR_HEIGHT, {
        height: CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT,
      }).catch(() => {});
    };
  }, []);

  return (
    <div
      className={`chatbox-shell-wrap chatbox-input-shell-wrap${hasImagePreview ? ' with-preview' : ''}${loopInteractionLocked ? ' loop-active' : ''}`}
    >
      <div className="chatbox-shell">
        <form
          className={`chatbox-pill${hasImagePreview ? ' with-preview' : ''}`}
          onSubmit={handleSubmit}
          onMouseDown={handlePillMouseDown}
        >
          <ChatBoxImagePreviewRow
            clipboardImages={clipboardImages}
            onRemoveImage={(id) => {
              setClipboardImages((previous) => previous.filter((image) => image.id !== id));
            }}
          />
          <div className="chatbox-main-row">
            <button
              type="button"
              className="chatbox-icon chatbox-settings"
              onClick={handleOpenSettings}
              aria-label="Open dashboard"
              title="Open dashboard"
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
            <div className="chatbox-input-wrap">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onPaste={handleComposerPaste}
                placeholder="Ask me anything..."
                className="chatbox-input"
                disabled={loopInteractionLocked}
              />
            </div>
            <button
              type="button"
              className="chatbox-icon chatbox-screenshot"
              aria-label="Take screenshot"
              title="Take screenshot"
              onClick={handleCaptureScreenshot}
              disabled={loopInteractionLocked || isCapturingScreenshot}
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
              type="submit"
              className="chatbox-icon chatbox-send"
              aria-label="Send message"
              title="Send message"
              disabled={loopInteractionLocked || !inputValue.trim()}
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
