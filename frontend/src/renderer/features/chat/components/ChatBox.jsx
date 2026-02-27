import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { useTranscription } from '../hooks/useTranscription';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS, SEND_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { getRoundedFrameSize } from '../utils/overlayFrameSize';
import { subscribeResponseOverlayPhase } from '../utils/overlayPhaseListener';
import { useVoiceMode } from '../../voice/hooks/useVoiceMode';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { ApiClient } from '../../../infrastructure/api/client';
import { isDevUiEnabled } from '../utils/devUiFlag';
import { buildOutgoingMessage } from '../utils/messageInput';
import { extractOSstate } from '../../../infrastructure/services/SystemCapture';
import {
  normalizeArtifactImageContentType,
  resolveArtifactImageExtension,
} from '../../../infrastructure/services/ArtifactImageUtils';

const CLICK_THROUGH_PHASES = new Set(['awaiting-first-chunk', 'streaming', 'tool-call', 'tool-output']);
const OVERLAY_ACTIVE_PHASES = new Set(['awaiting-first-chunk', 'streaming']);
const OVERLAY_TERMINAL_PHASES = new Set(['idle', 'complete', 'error']);
const LOOP_ACTIVE_PHASES = new Set(['awaiting-first-chunk', 'streaming', 'tool-call', 'tool-output']);
const CHATBOX_SIZE_MODES = Object.freeze({
  COMPACT: 'compact',
  WITH_PREVIEW: 'with-preview',
});
const RESIZE_TRANSITION_LOCK_MS = 240;
const RESIZE_DEBOUNCE_MS = 40;
const WITH_PREVIEW_TOP_HEADROOM_PX = 14;
const STARTUP_LAYOUT_READY_MIN_DELAY_MS = 120;
const PREVIEW_SETTLE_SYNC_DELAYS_MS = Object.freeze([90, 180]);

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

function isDragBlockedTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest(
    'button, a, [role="button"], input, textarea, select, option, label, [role="textbox"], [contenteditable=""], [contenteditable="true"], [contenteditable=true], .chatbox-input-wrap, .chatbox-actions',
  ));
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </svg>
  );
}

function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5L6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

function ScreenshotIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h3l1.2-2h7.6L17 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}

function CompactIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10h11" />
      <path d="M11 6l4 4-4 4" />
      <path d="M20 14H9" />
      <path d="M13 18l-4-4 4-4" />
    </svg>
  );
}

function ChatBox() {
  const { config, updateConfig } = useAppConfigContext();
  const isSending = useChatStore((state) => state.isSending);
  const streamPhase = useChatStore((state) => state.streamTracking.phase);
  const { sendMessage } = useChatMessageSender(undefined, {
    senderSurface: 'overlay-chatbox',
  });
  const [overlayPhase, setOverlayPhase] = useState('idle');
  const [wakewordSttSessionActive, setWakewordSttSessionActive] = useState(false);
  const [clipboardImages, setClipboardImages] = useState([]);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const ignoreMouseRef = useRef(undefined);
  const layoutPendingClearedRef = useRef(false);
  const shellWrapRef = useRef(null);
  const shellRef = useRef(null);
  const inputRef = useRef(null);
  const lastSizeRef = useRef({ width: 0, height: 0 });
  const resizeSyncRef = useRef({
    frameHandle: null,
    debounceHandle: null,
    settleSyncHandles: [],
    inFlight: false,
    queuedSize: null,
    layoutReadyTimer: null,
    mountedAtMs: Date.now(),
    transitionLockUntil: 0,
    activeMode: CHATBOX_SIZE_MODES.COMPACT,
    cachedModeHeights: {
      [CHATBOX_SIZE_MODES.COMPACT]: null,
      [CHATBOX_SIZE_MODES.WITH_PREVIEW]: null,
    },
    scheduleSizeSync: null,
  });
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
  const devUiEnabled = isDevUiEnabled();
  const {
    inputValue,
    setInputValue,
    getInputValue,
    updateTranscription,
    resetTranscription,
    handleInputChange,
  } = useTranscription();
  const activeResizeMode = clipboardImages.length > 0
    ? CHATBOX_SIZE_MODES.WITH_PREVIEW
    : CHATBOX_SIZE_MODES.COMPACT;

  const setOverlayIgnore = useCallback(async (ignore) => {
    if (ignoreMouseRef.current === ignore) {
      return;
    }
    ignoreMouseRef.current = ignore;
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE, { ignore });
    } catch (error) {
      console.warn('[ChatBox] Failed to toggle overlay mouse ignore:', error);
    }
  }, []);

  const focusInput = useCallback(() => {
    void setOverlayIgnore(false);
    inputRef.current?.focus();
  }, [setOverlayIgnore]);

  useEffect(() => {
    setOverlayIgnore(false);
    return () => {
      setOverlayIgnore(false);
    };
  }, [setOverlayIgnore]);

  useEffect(() => {
    focusInput();

    const handleWindowFocus = () => {
      focusInput();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        focusInput();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [focusInput]);

  useEffect(() => {
    const overlayIsTerminal = OVERLAY_TERMINAL_PHASES.has(overlayPhase);
    const shouldIgnore = !overlayIsTerminal && (
      OVERLAY_ACTIVE_PHASES.has(overlayPhase) || CLICK_THROUGH_PHASES.has(streamPhase)
    );
    void setOverlayIgnore(shouldIgnore);
  }, [overlayPhase, setOverlayIgnore, streamPhase]);

  useEffect(() => {
    if (!shellRef.current) {
      return () => {};
    }
    const resizeSyncState = resizeSyncRef.current;
    const requestFrame = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 0);
    const cancelFrame = typeof window.cancelAnimationFrame === 'function'
      ? window.cancelAnimationFrame.bind(window)
      : (handle) => window.clearTimeout(handle);
    const clearSettleSyncHandles = () => {
      const handles = Array.isArray(resizeSyncState.settleSyncHandles)
        ? resizeSyncState.settleSyncHandles
        : [];
      handles.forEach((handle) => window.clearTimeout(handle));
      resizeSyncState.settleSyncHandles = [];
    };
    const markLayoutReady = () => {
      if (layoutPendingClearedRef.current) {
        return;
      }
      const mountedAtMs = Number(resizeSyncState.mountedAtMs || Date.now());
      const elapsedMs = Math.max(0, Date.now() - mountedAtMs);
      if (elapsedMs < STARTUP_LAYOUT_READY_MIN_DELAY_MS) {
        if (resizeSyncState.layoutReadyTimer) {
          window.clearTimeout(resizeSyncState.layoutReadyTimer);
        }
        resizeSyncState.layoutReadyTimer = window.setTimeout(
          markLayoutReady,
          STARTUP_LAYOUT_READY_MIN_DELAY_MS - elapsedMs,
        );
        return;
      }
      layoutPendingClearedRef.current = true;
      shellWrapRef.current?.classList?.remove('is-layout-pending');
    };

    const flushSizeUpdate = async (nextFrame) => {
      const widthDelta = Math.abs((lastSizeRef.current.width || 0) - nextFrame.width);
      const heightDelta = Math.abs((lastSizeRef.current.height || 0) - nextFrame.height);
      if (widthDelta <= 1 && heightDelta <= 1) {
        return;
      }
      if (resizeSyncState.inFlight) {
        resizeSyncState.queuedSize = nextFrame;
        return;
      }

      resizeSyncState.inFlight = true;
      lastSizeRef.current = { width: nextFrame.width, height: nextFrame.height };
      try {
        const anchorX = Number(window.screenX);
        const windowHeight = Number(window.outerHeight || window.innerHeight || 0);
        const anchorBottom = Number(window.screenY) + windowHeight;
        await IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_SIZE, {
          width: nextFrame.width,
          height: nextFrame.height,
          anchor_x: Number.isFinite(anchorX) ? Math.round(anchorX) : undefined,
          anchor_bottom: Number.isFinite(anchorBottom) ? Math.round(anchorBottom) : undefined,
        });
      } catch (error) {
        console.warn('[ChatBox] Failed to resize chatbox window:', error);
      } finally {
        resizeSyncState.inFlight = false;
        if (resizeSyncState.queuedSize) {
          const queuedSize = resizeSyncState.queuedSize;
          resizeSyncState.queuedSize = null;
          void flushSizeUpdate(queuedSize);
          return;
        }
        markLayoutReady();
      }
    };

    const measureAndQueueSize = ({ force = false } = {}) => {
      if (
        !force
        && resizeSyncState.activeMode === CHATBOX_SIZE_MODES.COMPACT
        && Date.now() < resizeSyncState.transitionLockUntil
      ) {
        return;
      }
      const measuredFrame = getRoundedFrameSize(shellRef.current);
      if (!measuredFrame) {
        return;
      }
      const activeMode = resizeSyncState.activeMode;
      const shellScrollHeight = Number(shellRef.current?.scrollHeight || 0);
      const baseMeasuredHeight = Number.isFinite(shellScrollHeight) && shellScrollHeight > 0
        ? Math.max(measuredFrame.height, Math.round(shellScrollHeight))
        : measuredFrame.height;
      const measuredHeight = baseMeasuredHeight + (
        activeMode === CHATBOX_SIZE_MODES.WITH_PREVIEW ? WITH_PREVIEW_TOP_HEADROOM_PX : 0
      );
      if (resizeSyncState.cachedModeHeights[activeMode] == null) {
        resizeSyncState.cachedModeHeights[activeMode] = measuredHeight;
      } else if (
        activeMode === CHATBOX_SIZE_MODES.WITH_PREVIEW
        && measuredHeight > resizeSyncState.cachedModeHeights[activeMode]
      ) {
        // Preview rows can settle after first measurement; allow upward cache correction.
        resizeSyncState.cachedModeHeights[activeMode] = measuredHeight;
      }
      const nextFrame = {
        width: measuredFrame.width,
        height: resizeSyncState.cachedModeHeights[activeMode] ?? measuredHeight,
      };
      void flushSizeUpdate(nextFrame);
    };

    const scheduleSizeSync = ({ force = false, immediate = false } = {}) => {
      if (resizeSyncState.frameHandle) {
        cancelFrame(resizeSyncState.frameHandle);
      }
      if (resizeSyncState.debounceHandle) {
        window.clearTimeout(resizeSyncState.debounceHandle);
      }
      if (immediate) {
        measureAndQueueSize({ force });
        return;
      }
      const debounceMs = resizeSyncState.activeMode === CHATBOX_SIZE_MODES.WITH_PREVIEW
        ? 0
        : RESIZE_DEBOUNCE_MS;
      if (debounceMs === 0) {
        measureAndQueueSize({ force });
        return;
      }
      resizeSyncState.frameHandle = requestFrame(() => {
        resizeSyncState.frameHandle = null;
        resizeSyncState.debounceHandle = window.setTimeout(() => {
          resizeSyncState.debounceHandle = null;
          measureAndQueueSize({ force });
        }, debounceMs);
      });
    };
    resizeSyncState.scheduleSizeSync = scheduleSizeSync;

    if (typeof ResizeObserver === 'undefined') {
      scheduleSizeSync({ force: true, immediate: true });
      scheduleSizeSync();
      return () => {
        resizeSyncState.scheduleSizeSync = null;
      };
    }

    const observer = new ResizeObserver(() => {
      scheduleSizeSync();
    });
    observer.observe(shellRef.current);
    scheduleSizeSync({ force: true, immediate: true });
    scheduleSizeSync();

    return () => {
      observer.disconnect();
      if (resizeSyncState.frameHandle) {
        cancelFrame(resizeSyncState.frameHandle);
        resizeSyncState.frameHandle = null;
      }
      if (resizeSyncState.debounceHandle) {
        window.clearTimeout(resizeSyncState.debounceHandle);
        resizeSyncState.debounceHandle = null;
      }
      if (resizeSyncState.layoutReadyTimer) {
        window.clearTimeout(resizeSyncState.layoutReadyTimer);
        resizeSyncState.layoutReadyTimer = null;
      }
      clearSettleSyncHandles();
      resizeSyncState.queuedSize = null;
      resizeSyncState.inFlight = false;
      resizeSyncState.scheduleSizeSync = null;
    };
  }, []);

  useEffect(() => {
    const resizeSyncState = resizeSyncRef.current;
    const clearSettleSyncHandles = () => {
      const handles = Array.isArray(resizeSyncState.settleSyncHandles)
        ? resizeSyncState.settleSyncHandles
        : [];
      handles.forEach((handle) => window.clearTimeout(handle));
      resizeSyncState.settleSyncHandles = [];
    };
    resizeSyncState.activeMode = activeResizeMode;
    resizeSyncState.queuedSize = null;
    resizeSyncState.transitionLockUntil = activeResizeMode === CHATBOX_SIZE_MODES.COMPACT
      ? Date.now() + RESIZE_TRANSITION_LOCK_MS
      : 0;
    clearSettleSyncHandles();
    resizeSyncState.scheduleSizeSync?.({ force: true, immediate: true });
    resizeSyncState.scheduleSizeSync?.();
    const settleDelays = activeResizeMode === CHATBOX_SIZE_MODES.WITH_PREVIEW
      ? PREVIEW_SETTLE_SYNC_DELAYS_MS
      : [STARTUP_LAYOUT_READY_MIN_DELAY_MS];
    resizeSyncState.settleSyncHandles = settleDelays.map((delayMs) => window.setTimeout(() => {
      resizeSyncState.scheduleSizeSync?.({ force: true, immediate: true });
    }, delayMs));
  }, [activeResizeMode]);

  useEffect(() => {
    return subscribeResponseOverlayPhase(setOverlayPhase);
  }, []);

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
    const outgoingMessage = buildOutgoingMessage(getInputValue(), isSending, clipboardImages);
    if (!outgoingMessage) {
      return;
    }
    setWakewordSttSessionActive(false);
    resetTranscription();
    setInputValue('');
    setClipboardImages([]);
    await sendMessage(outgoingMessage);
  }, [clipboardImages, getInputValue, isSending, resetTranscription, sendMessage, setInputValue]);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    void handleSend();
  }, [handleSend]);

  const handleOpenSettings = useCallback(async () => {
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW, {
        maximize: true,
        open: 'chat',
      });
    } catch (error) {
      console.warn('[ChatBox] Failed to show main window:', error);
    }
  }, []);

  const handleComposerPaste = useCallback(async (event) => {
    const clipboardItems = Array.from(event.clipboardData?.items || []);
    const imageItems = clipboardItems.filter((item) => item.type?.startsWith('image/'));
    if (imageItems.length === 0) {
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
      console.warn('[ChatBox] Failed to parse pasted image:', error);
    }
  }, []);

  const handleCaptureScreenshot = useCallback(async () => {
    if (isSending || isCapturingScreenshot) {
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
  }, [focusInput, isCapturingScreenshot, isSending]);

  const handleToggleSpeechMode = useCallback(() => {
    if (typeof updateConfig !== 'function') {
      return;
    }
    updateConfig({
      speech_mode_enabled: !speechModeEnabled,
    });
  }, [speechModeEnabled, updateConfig]);

  const handleDevAutoCompaction = useCallback(() => {
    ApiClient.compactHistory(true);
  }, []);

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
    if (event.button !== 0 || isDragBlockedTarget(event.target)) {
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
  }, []);
  const isLoopActive = LOOP_ACTIVE_PHASES.has(streamPhase) || LOOP_ACTIVE_PHASES.has(overlayPhase);
  const showPreviewRow = clipboardImages.length > 0;

  return (
    <div
      ref={shellWrapRef}
      className={`chatbox-shell-wrap chatbox-input-shell-wrap is-layout-pending${isLoopActive ? ' loop-active' : ''}`}
    >
      <div className="chatbox-shell" ref={shellRef}>
        <form className={`chatbox-pill${showPreviewRow ? ' has-preview' : ''}`} onSubmit={handleSubmit} onMouseDown={handlePillMouseDown}>
          {showPreviewRow ? (
            <div className="chatbox-image-preview-row">
              {clipboardImages.map((clipboardImage, index) => (
                <div className="chatbox-image-preview-card" key={clipboardImage.id || index}>
                  <img
                    src={clipboardImage.previewUrl}
                    alt={`Pasted image preview ${index + 1}`}
                    className="chatbox-image-preview-thumb"
                  />
                  <button
                    type="button"
                    className="chatbox-image-preview-remove"
                    aria-label={`Remove screenshot ${index + 1}`}
                    onClick={() => {
                      setClipboardImages((previous) => (
                        previous.filter((image) => image.id !== clipboardImage.id)
                      ));
                    }}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="chatbox-main-row">
            <button
              type="button"
              className="chatbox-icon chatbox-settings"
              onClick={handleOpenSettings}
              aria-label="Open dashboard"
              title="Open dashboard"
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
                disabled={isSending}
              />
            </div>
            <button
              type="button"
              className="chatbox-icon chatbox-screenshot"
              aria-label="Take screenshot"
              title="Take screenshot"
              onClick={handleCaptureScreenshot}
              disabled={isSending || isCapturingScreenshot}
            >
              <ScreenshotIcon />
            </button>
            <button
              type="button"
              className={`chatbox-icon chatbox-tts${speechModeEnabled ? ' is-enabled' : ''}`}
              aria-label="Toggle text-to-speech"
              title={speechModeEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
              onClick={handleToggleSpeechMode}
            >
              <SoundIcon />
            </button>
            <button
              type="submit"
              className="chatbox-icon chatbox-send"
              aria-label="Send message"
              title="Send message"
              disabled={isSending || !inputValue.trim()}
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
