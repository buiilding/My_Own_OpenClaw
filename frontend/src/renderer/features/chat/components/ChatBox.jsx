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
import { useVoiceMode } from '../../voice/hooks/useVoiceMode';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { ApiClient } from '../../../infrastructure/api/client';
import { isDevUiEnabled } from '../utils/devUiFlag';
import { buildOutgoingMessage } from '../utils/message/messageInput';
import { parseClipboardImageItems } from '../utils/clipboardImageUtils';
import { COMPACTION_THINKING_STATUS } from '../utils/chatStream/chatStreamThinkingStatus';
import {
  CompactIcon,
  CloseIcon,
  ScreenshotIcon,
  SendIcon,
  SettingsIcon,
  SoundIcon,
} from './chatbox/ChatBoxIcons';
import ChatBoxImagePreviewRow from './chatbox/ChatBoxImagePreviewRow';

const CHATBOX_DRAG_START_THRESHOLD = 5;

function applyBooleanConfigUpdate(updateConfig, key, nextValue) {
  if (typeof updateConfig !== 'function') {
    return false;
  }
  updateConfig({
    [key]: nextValue,
  });
  return true;
}

const CHATBOX_CLOSE_BUMP_HEIGHT = 14;
const CHATBOX_CLOSE_BUMP_HALF_WIDTH = 22;
const CHATBOX_CLOSE_CORNER_RADIUS = 26;

function formatPathNumber(value) {
  return Number(value.toFixed(2));
}

function buildChatboxPillClipPath({
  width,
  height,
  centerX,
}) {
  const safeWidth = Math.max(1, Number(width) || 0);
  const safeHeight = Math.max(1, Number(height) || 0);
  const cornerRadius = Math.min(CHATBOX_CLOSE_CORNER_RADIUS, safeWidth / 2, safeHeight / 2);
  const bodyTop = Math.min(CHATBOX_CLOSE_BUMP_HEIGHT, Math.max(0, safeHeight - cornerRadius - 1));
  const maxHalfWidth = Math.max(12, Math.min(CHATBOX_CLOSE_BUMP_HALF_WIDTH, ((safeWidth - (cornerRadius * 2)) / 2) - 8));
  const clampedCenterX = Math.min(
    safeWidth - cornerRadius - maxHalfWidth - 6,
    Math.max(cornerRadius + maxHalfWidth + 6, Number(centerX) || 0),
  );
  const leftShoulderX = clampedCenterX - maxHalfWidth;
  const rightShoulderX = clampedCenterX + maxHalfWidth;
  const curveInset = Math.min(16, maxHalfWidth * 0.72);
  const apexControlInset = Math.min(14, maxHalfWidth * 0.56);

  return `path("M ${formatPathNumber(cornerRadius)} ${formatPathNumber(bodyTop)} L ${formatPathNumber(leftShoulderX)} ${formatPathNumber(bodyTop)} C ${formatPathNumber(leftShoulderX + curveInset)} ${formatPathNumber(bodyTop)}, ${formatPathNumber(clampedCenterX - apexControlInset)} 0, ${formatPathNumber(clampedCenterX)} 0 C ${formatPathNumber(clampedCenterX + apexControlInset)} 0, ${formatPathNumber(rightShoulderX - curveInset)} ${formatPathNumber(bodyTop)}, ${formatPathNumber(rightShoulderX)} ${formatPathNumber(bodyTop)} L ${formatPathNumber(safeWidth - cornerRadius)} ${formatPathNumber(bodyTop)} A ${formatPathNumber(cornerRadius)} ${formatPathNumber(cornerRadius)} 0 0 1 ${formatPathNumber(safeWidth)} ${formatPathNumber(bodyTop + cornerRadius)} L ${formatPathNumber(safeWidth)} ${formatPathNumber(safeHeight - cornerRadius)} A ${formatPathNumber(cornerRadius)} ${formatPathNumber(cornerRadius)} 0 0 1 ${formatPathNumber(safeWidth - cornerRadius)} ${formatPathNumber(safeHeight)} L ${formatPathNumber(cornerRadius)} ${formatPathNumber(safeHeight)} A ${formatPathNumber(cornerRadius)} ${formatPathNumber(cornerRadius)} 0 0 1 0 ${formatPathNumber(safeHeight - cornerRadius)} L 0 ${formatPathNumber(bodyTop + cornerRadius)} A ${formatPathNumber(cornerRadius)} ${formatPathNumber(cornerRadius)} 0 0 1 ${formatPathNumber(cornerRadius)} ${formatPathNumber(bodyTop)} Z")`;
}

function ChatBox() {
  const { config, updateConfig } = useAppConfigContext();
  const messages = useChatStore((state) => state.messages);
  const isSending = useChatStore((state) => state.isSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setThinkingSourceEventType = useChatStore((state) => state.setThinkingSourceEventType);
  const { sendMessage } = useChatMessageSender(undefined, {
    senderSurface: 'overlay-chatbox',
  });
  const overlayPhase = useResponseOverlayPhase();
  const [wakewordSttSessionActive, setWakewordSttSessionActive] = useState(false);
  const [clipboardImages, setClipboardImages] = useState([]);
  const inputRef = useRef(null);
  const pillRef = useRef(null);
  const sendButtonRef = useRef(null);
  const loopInteractionLockedRef = useRef(false);
  const dragStateRef = useRef({
    isDragging: false,
    didDrag: false,
    startClientX: 0,
    startClientY: 0,
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    lastTargetX: null,
    lastTargetY: null,
  });
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
  } = useTranscription();

  const focusInput = useCallback(() => {
    if (loopInteractionLockedRef.current) {
      inputRef.current?.blur();
      return;
    }
    inputRef.current?.focus();
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
      height: pillHeight + CHATBOX_CLOSE_BUMP_HEIGHT,
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

  const handleOpenConfig = useCallback(async () => {
    if (loopInteractionLocked) {
      return;
    }
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW, {
        maximize: true,
      });
    } catch (error) {
      console.warn('[ChatBox] Failed to show main window:', error);
    }
  }, [loopInteractionLocked]);

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

    if (movedDistance < CHATBOX_DRAG_START_THRESHOLD) {
      return;
    }
    dragState.didDrag = true;

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

  useChatboxDragWindowBindings(handleDragMove, stopDragging);

  const handlePillMouseDown = useCallback((event) => {
    if (loopInteractionLocked || event.button !== 0) {
      return;
    }
    const screenX = Math.round(Number(event.screenX) || 0);
    const screenY = Math.round(Number(event.screenY) || 0);
    const windowScreenX = Math.round(Number(window.screenX) || 0);
    const windowScreenY = Math.round(Number(window.screenY) || 0);

    dragStateRef.current.isDragging = true;
    dragStateRef.current.didDrag = false;
    dragStateRef.current.startClientX = Math.round(Number(event.clientX) || 0);
    dragStateRef.current.startClientY = Math.round(Number(event.clientY) || 0);
    dragStateRef.current.pointerOffsetX = screenX - windowScreenX;
    dragStateRef.current.pointerOffsetY = screenY - windowScreenY;
    dragStateRef.current.lastTargetX = windowScreenX;
    dragStateRef.current.lastTargetY = windowScreenY;
  }, [loopInteractionLocked]);

  const handlePillClickCapture = useCallback((event) => {
    if (!dragStateRef.current.didDrag) {
      return;
    }
    dragStateRef.current.didDrag = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);
  const hasImagePreview = clipboardImages.length > 0;

  useChatboxVisualAnchorBindings(hasImagePreview);

  return (
    <div
      className={`chatbox-shell-wrap chatbox-input-shell-wrap${hasImagePreview ? ' with-preview' : ''}${loopInteractionLocked ? ' loop-active' : ''}`}
    >
      <div className="chatbox-shell">
        <form
          ref={pillRef}
          className={`chatbox-pill${hasImagePreview ? ' with-preview' : ''}`}
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
          <ChatBoxImagePreviewRow
            clipboardImages={clipboardImages}
            onRemoveImage={(id) => {
              setClipboardImages((previous) => previous.filter((image) => image.id !== id));
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
