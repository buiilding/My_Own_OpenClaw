import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { selectChatBoxState } from '../utils/chatSelectors';

const RESPONSE_TYPES = new Set(['tool-call', 'llm-text', 'error']);
const FIRST_CHUNK_TYPES = new Set(['llm-text', 'error']);

function findLastUserIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].sender === 'user') {
      return i;
    }
  }
  return -1;
}

function findLatestMessageAfterUser(messages, lastUserIndex, allowedTypes) {
  for (let i = messages.length - 1; i > lastUserIndex; i -= 1) {
    const message = messages[i];
    if (message.sender !== 'assistant') {
      continue;
    }
    if (!message.text) {
      continue;
    }
    if (!allowedTypes.has(message.type)) {
      continue;
    }
    return message;
  }
  return null;
}

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
  const { messages, isSending } = useChatStore(useShallow(selectChatBoxState));
  const { sendMessage } = useChatMessageSender();
  const [inputValue, setInputValue] = useState('');
  const [closedResponseId, setClosedResponseId] = useState(null);
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
  const [isCaptureActive, setIsCaptureActive] = useState(false);
  const ignoreMouseRef = useRef(undefined);
  const shellRef = useRef(null);
  const inputRef = useRef(null);
  const lastUserMessageIdRef = useRef(null);
  const lastSizeRef = useRef({ width: 0, height: 0 });

  const lastUserIndex = useMemo(
    () => findLastUserIndex(messages),
    [messages],
  );

  const lastUserMessageId = useMemo(() => {
    if (lastUserIndex < 0) {
      return null;
    }
    return messages[lastUserIndex]?.id || null;
  }, [lastUserIndex, messages]);

  const activeResponse = useMemo(
    () => findLatestMessageAfterUser(messages, lastUserIndex, RESPONSE_TYPES),
    [messages, lastUserIndex],
  );

  const firstTextOrError = useMemo(
    () => findLatestMessageAfterUser(messages, lastUserIndex, FIRST_CHUNK_TYPES),
    [messages, lastUserIndex],
  );

  const responseIsCloseable = useMemo(() => {
    if (!activeResponse) {
      return false;
    }
    if (activeResponse.type === 'error') {
      return true;
    }
    return Boolean(activeResponse.isComplete);
  }, [activeResponse]);

  const showResponse = Boolean(
    activeResponse
      && !isCaptureActive
      && !awaitingFirstChunk
      && activeResponse.id !== closedResponseId,
  );

  const showTyping = awaitingFirstChunk && !isCaptureActive;

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
    // Default: overlay is interactive. We resize the window to the pill, so it shouldn't
    // block clicks outside the UI.
    setOverlayIgnore(false);
    return () => {
      setOverlayIgnore(false);
    };
  }, [setOverlayIgnore]);

  useEffect(() => {
    if (!shellRef.current) {
      return () => {};
    }

    const updateSize = async () => {
      const rect = shellRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const width = Math.max(1, Math.ceil(rect.width));
      const height = Math.max(1, Math.ceil(rect.height));

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
      // JSDOM doesn't implement ResizeObserver; Electron/Chromium does.
      window.requestAnimationFrame(updateSize);
      return () => {};
    }

    const observer = new ResizeObserver(() => {
      // Collapse bursts into one update per frame.
      window.requestAnimationFrame(updateSize);
    });
    observer.observe(shellRef.current);
    window.requestAnimationFrame(updateSize);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.CHATBOX_FOCUS, () => {
      setOverlayIgnore(false);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    });
    return () => {
      removeListener?.();
    };
  }, [setOverlayIgnore]);

  useEffect(() => {
    if (!lastUserMessageId) {
      return;
    }
    if (lastUserMessageIdRef.current === lastUserMessageId) {
      return;
    }
    lastUserMessageIdRef.current = lastUserMessageId;
    setAwaitingFirstChunk(true);
    setClosedResponseId(null);
  }, [lastUserMessageId]);

  useEffect(() => {
    if (!awaitingFirstChunk) {
      return;
    }
    if (!firstTextOrError) {
      return;
    }
    setAwaitingFirstChunk(false);
  }, [awaitingFirstChunk, firstTextOrError]);

  useEffect(() => {
    const onCaptureState = (event) => {
      const nextActive = Boolean(event?.detail?.active);
      setIsCaptureActive(nextActive);
    };

    window.addEventListener('windie:screenshot-capture', onCaptureState);
    return () => {
      window.removeEventListener('windie:screenshot-capture', onCaptureState);
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
    handleSend();
  }, [handleSend]);

  const handleInputFocus = useCallback(() => {
    setOverlayIgnore(false);
  }, [setOverlayIgnore]);

  const handleInputBlur = useCallback(() => {
    // no-op; placeholder if we want click-through behavior later
  }, []);

  const handleOpenSettings = useCallback(async () => {
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW);
    } catch (error) {
      console.warn('[ChatBox] Failed to show main window:', error);
    }
  }, []);

  const handleCloseResponse = useCallback(() => {
    if (!activeResponse || !responseIsCloseable) {
      return;
    }
    setClosedResponseId(activeResponse.id);
  }, [activeResponse, responseIsCloseable]);

  return (
    <div className="chatbox-shell-wrap">
      <div className="chatbox-shell" ref={shellRef}>
        {showResponse ? (
          <div className="chatbox-response-pill">
            <button
              type="button"
              className="chatbox-response-close"
              onClick={handleCloseResponse}
              disabled={!responseIsCloseable}
              aria-label={responseIsCloseable ? 'Close response' : 'Response still streaming'}
            >
              ×
            </button>
            <div className="chatbox-response-text">{activeResponse.text}</div>
          </div>
        ) : null}

        {showTyping ? (
          <div className="chatbox-typing-indicator" aria-label="Assistant is typing">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        <form className="chatbox-pill" onSubmit={handleSubmit}>
          <div className="chatbox-input-wrap">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              placeholder="Type a command…"
              className="chatbox-input"
              disabled={isSending}
            />
          </div>
          <div className="chatbox-actions">
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
