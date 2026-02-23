import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { ApiClient } from '../../../infrastructure/api/client';
import { setActiveConversationRef } from '../../../infrastructure/transcript/TranscriptWriter';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';

const CLICK_THROUGH_PHASES = new Set(['awaiting-first-chunk', 'streaming', 'tool-call', 'tool-output']);
const OVERLAY_ACTIVE_PHASES = new Set(['awaiting-first-chunk', 'streaming']);
const OVERLAY_TERMINAL_PHASES = new Set(['idle', 'complete', 'error']);
const ACTIVE_QUERY_PHASES = new Set(['awaiting-first-chunk', 'streaming', 'tool-call', 'tool-output']);

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="2.2" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2.2" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="11" cy="18" r="2.2" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M6.5 11.5a5.5 5.5 0 0011 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  );
}

function ChatBox() {
  const isSending = useChatStore((state) => state.isSending);
  const streamPhase = useChatStore((state) => state.streamTracking.phase);
  const clearMessages = useChatStore((state) => state.clearMessages);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);
  const canStop = ACTIVE_QUERY_PHASES.has(streamPhase);
  const { sendMessage } = useChatMessageSender(undefined, {
    senderSurface: 'overlay-chatbox',
  });
  const [inputValue, setInputValue] = useState('');
  const [overlayPhase, setOverlayPhase] = useState('idle');
  const ignoreMouseRef = useRef(undefined);
  const shellRef = useRef(null);
  const inputRef = useRef(null);
  const lastSizeRef = useRef({ width: 0, height: 0 });

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
      const rect = shellRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));

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
    const removePhaseListener = IpcBridge.on(ON_CHANNELS.RESPONSE_OVERLAY_PHASE, (payload) => {
      const phase = typeof payload?.phase === 'string' ? payload.phase : null;
      if (!phase) {
        return;
      }
      setOverlayPhase(phase);
    });
    return () => {
      removePhaseListener?.();
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

  const handleCloseChatbox = useCallback(async () => {
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX);
    } catch (error) {
      console.warn('[ChatBox] Failed to hide chatbox:', error);
    }
  }, []);

  const handleStopQuery = useCallback(() => {
    if (!canStop) {
      return;
    }
    ApiClient.stopQuery();
  }, [canStop]);

  const handleNewChat = useCallback(() => {
    if (canStop) {
      ApiClient.stopQuery();
    }
    clearMessages();
    setIsSending(false);
    setThinkingStatus(null);
    setTokenCounts(null);
    setActiveConversationRef(null);
    setInputValue('');
  }, [
    canStop,
    clearMessages,
    setIsSending,
    setThinkingStatus,
    setTokenCounts,
  ]);

  return (
    <div className="chatbox-shell-wrap">
      <div className="chatbox-shell" ref={shellRef}>
        <form className="chatbox-pill" onSubmit={handleSubmit}>
          <button
            type="button"
            className="chatbox-pill-close"
            onClick={handleCloseChatbox}
            aria-label="Close chatbox"
            title="Close chatbox"
          >
            ×
          </button>
          <div className="chatbox-input-wrap">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="Type a command…"
              className="chatbox-input"
              disabled={isSending}
            />
          </div>
          <div className="chatbox-actions">
            <button
              type="button"
              className="chatbox-icon chatbox-new-chat"
              onClick={handleNewChat}
              aria-label="New chat"
              title="New chat"
            >
              <span aria-hidden="true">+</span>
            </button>
            <button
              type="button"
              className="chatbox-icon chatbox-stop"
              onClick={handleStopQuery}
              disabled={!canStop}
              aria-label="Stop response"
              title="Stop response"
            >
              <span aria-hidden="true">■</span>
            </button>
            <button
              type="button"
              className="chatbox-icon chatbox-mic"
              disabled
              aria-label="Voice input disabled"
            >
              <MicIcon />
            </button>
            <button
              type="button"
              className="chatbox-icon chatbox-settings"
              onClick={handleOpenSettings}
              aria-label="Open settings"
            >
              <SettingsIcon />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChatBox;
