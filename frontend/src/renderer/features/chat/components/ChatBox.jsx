import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS, SEND_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { getRoundedFrameSize } from '../utils/overlayFrameSize';
import { subscribeResponseOverlayPhase } from '../utils/overlayPhaseListener';
import { resolveActiveWindowContext } from '../utils/activeWindowContext';

const CLICK_THROUGH_PHASES = new Set(['awaiting-first-chunk', 'streaming', 'tool-call', 'tool-output']);
const OVERLAY_ACTIVE_PHASES = new Set(['awaiting-first-chunk', 'streaming']);
const OVERLAY_TERMINAL_PHASES = new Set(['idle', 'complete', 'error']);
const LOOP_ACTIVE_PHASES = new Set(['awaiting-first-chunk', 'streaming', 'tool-call', 'tool-output']);
const ACTIVE_WINDOW_POLL_INTERVAL_MS = 5000;
const CONTEXT_STATUS = Object.freeze({
  FRESH: 'fresh',
  STALE: 'stale',
  OFFLINE: 'offline',
});

function setStatusIfChanged(setStatus, nextStatus) {
  setStatus((previousStatus) => (previousStatus === nextStatus ? previousStatus : nextStatus));
}

function buildContextAriaLabel(context, status) {
  if (status === CONTEXT_STATUS.FRESH) {
    return `Active app: ${context.label}`;
  }
  return `Active app: ${context.label} (${status})`;
}

function extractMetadataActiveWindow(message) {
  const metadata = message?.fullUserMessage?.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const activeWindow = metadata.active_window;
  if (typeof activeWindow !== 'string') {
    return null;
  }
  const trimmed = activeWindow.trim();
  return trimmed || null;
}

function selectLatestMetadataActiveWindow(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.sender !== 'user') {
      continue;
    }
    const activeWindow = extractMetadataActiveWindow(message);
    if (activeWindow) {
      return activeWindow;
    }
  }
  return null;
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

function ChatBox() {
  const isSending = useChatStore((state) => state.isSending);
  const streamPhase = useChatStore((state) => state.streamTracking.phase);
  const metadataActiveWindow = useChatStore((state) => selectLatestMetadataActiveWindow(state.messages));
  const { sendMessage } = useChatMessageSender(undefined, {
    senderSurface: 'overlay-chatbox',
  });
  const [inputValue, setInputValue] = useState('');
  const [overlayPhase, setOverlayPhase] = useState('idle');
  const [isResponseOverlayVisible, setIsResponseOverlayVisible] = useState(false);
  const [activeWindowContext, setActiveWindowContext] = useState(
    () => resolveActiveWindowContext(null),
  );
  const [activeWindowStatus, setActiveWindowStatus] = useState(CONTEXT_STATUS.FRESH);
  const hasSuccessfulContextRef = useRef(false);
  const metadataActiveWindowRef = useRef(metadataActiveWindow);
  const ignoreMouseRef = useRef(undefined);
  const shellRef = useRef(null);
  const inputRef = useRef(null);
  const lastSizeRef = useRef({ width: 0, height: 0 });
  const dragStateRef = useRef({
    isDragging: false,
    startClientX: 0,
    startClientY: 0,
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    lastTargetX: null,
    lastTargetY: null,
  });

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

  useEffect(() => {
    setOverlayIgnore(false);
    return () => {
      setOverlayIgnore(false);
    };
  }, [setOverlayIgnore]);

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

    const updateSize = async () => {
      const nextFrame = getRoundedFrameSize(shellRef.current);
      if (!nextFrame) {
        return;
      }
      const { width, height } = nextFrame;

      if (lastSizeRef.current.width === width && lastSizeRef.current.height === height) {
        return;
      }
      lastSizeRef.current = { width, height };
      try {
        await IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_SIZE, { width, height });
      } catch (error) {
        console.warn('[ChatBox] Failed to resize chatbox window:', error);
      }
    };

    if (typeof ResizeObserver === 'undefined') {
      window.requestAnimationFrame(updateSize);
      return () => {};
    }

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(updateSize);
    });
    observer.observe(shellRef.current);
    window.requestAnimationFrame(updateSize);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    return subscribeResponseOverlayPhase(setOverlayPhase);
  }, []);

  useEffect(() => {
    metadataActiveWindowRef.current = metadataActiveWindow;
  }, [metadataActiveWindow]);

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;

    const refreshActiveWindow = async () => {
      try {
        const state = await IpcBridge.invoke(INVOKE_CHANNELS.GET_SYSTEM_STATE, {
          fields: ['active_window'],
        });
        if (cancelled) {
          return;
        }
        hasSuccessfulContextRef.current = true;
        setActiveWindowContext(resolveActiveWindowContext(state?.active_window));
        setStatusIfChanged(setActiveWindowStatus, CONTEXT_STATUS.FRESH);
      } catch (_error) {
        if (!cancelled) {
          const fallbackWindow = metadataActiveWindowRef.current;
          const hasFallbackWindow = typeof fallbackWindow === 'string' && fallbackWindow.trim().length > 0;
          setActiveWindowContext(resolveActiveWindowContext(hasFallbackWindow ? fallbackWindow : null));
          const nextStatus = hasSuccessfulContextRef.current || hasFallbackWindow
            ? CONTEXT_STATUS.STALE
            : CONTEXT_STATUS.OFFLINE;
          setStatusIfChanged(setActiveWindowStatus, nextStatus);
        }
      }
    };

    void refreshActiveWindow();
    intervalId = window.setInterval(() => {
      void refreshActiveWindow();
    }, ACTIVE_WINDOW_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.CHATBOX_FOCUS, () => {
      setOverlayIgnore(false);
      inputRef.current?.focus();
    });
    return () => {
      removeListener?.();
    };
  }, [setOverlayIgnore]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.RESPONSE_OVERLAY_VISIBILITY, (payload) => {
      const visible = payload?.visible === true;
      setIsResponseOverlayVisible((previous) => (previous === visible ? previous : visible));
    });
    return () => {
      removeListener?.();
    };
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isSending) {
      return;
    }
    setInputValue('');
    await sendMessage(trimmed);
  }, [inputValue, isSending, sendMessage]);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    void handleSend();
  }, [handleSend]);

  const handleOpenSettings = useCallback(async () => {
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW);
    } catch (error) {
      console.warn('[ChatBox] Failed to show main window:', error);
    }
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
  const showContextIndicator = !isResponseOverlayVisible;

  return (
    <div className={`chatbox-shell-wrap${isLoopActive ? ' loop-active' : ''}`}>
      <div className="chatbox-shell" ref={shellRef}>
        <form className="chatbox-pill" onSubmit={handleSubmit} onMouseDown={handlePillMouseDown}>
          <button
            type="button"
            className="chatbox-icon chatbox-settings"
            onClick={handleOpenSettings}
            aria-label="Open settings"
            title="Open settings"
          >
            <SettingsIcon />
          </button>
          {showContextIndicator ? (
            <div
              className={`chatbox-context-indicator is-${activeWindowStatus}`}
              aria-label={buildContextAriaLabel(activeWindowContext, activeWindowStatus)}
              title={activeWindowContext.fullLabel}
            >
              <span className="chatbox-context-label">{activeWindowContext.label}</span>
            </div>
          ) : null}
          <div className="chatbox-input-wrap">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="Ask me anything..."
              className="chatbox-input"
              disabled={isSending}
            />
          </div>
          <button
            type="submit"
            className="chatbox-icon chatbox-send"
            aria-label="Send message"
            title="Send message"
            disabled={isSending || !inputValue.trim()}
          >
            <SendIcon />
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatBox;
