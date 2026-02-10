import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { selectChatBoxState } from '../utils/chatSelectors';
import {
  getChatBoxStatusText,
  getInteractionModeLabel,
  getLatestAssistantMessage,
  trimPreview,
} from '../utils/chatBoxPresentation';

function ChatBox() {
  const { messages, isSending, thinkingStatus } = useChatStore(useShallow(selectChatBoxState));
  const { config } = useAppConfigContext();
  const { sendMessage } = useChatMessageSender();
  const [inputValue, setInputValue] = useState('');
  const ignoreMouseRef = useRef(undefined);
  const shellRef = useRef(null);
  const inputRef = useRef(null);
  const lastSizeRef = useRef({ width: 0, height: 0 });

  const lastAssistantMessage = useMemo(
    () => getLatestAssistantMessage(messages),
    [messages]
  );

  const statusText = getChatBoxStatusText(thinkingStatus, isSending);
  const interactionMode = config?.interaction_mode || 'chat';
  const interactionLabel = getInteractionModeLabel(interactionMode);

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

  const preview = trimPreview(lastAssistantMessage, 140);

  return (
    <div className="chatbox-shell-wrap">
      <div className="chatbox-shell" ref={shellRef}>
        <div className="chatbox-row">
          <div className="chatbox-left">
            <span className={`chatbox-indicator ${thinkingStatus ? 'is-thinking' : isSending ? 'is-sending' : ''}`} />
            <span className="chatbox-mode">{interactionLabel}</span>
            <span className="chatbox-status-text">{statusText}</span>
          </div>
          <form className="chatbox-form" onSubmit={handleSubmit}>
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
          </form>
          <div className="chatbox-actions">
            <button type="button" className="chatbox-icon chatbox-settings" onClick={handleOpenSettings} aria-label="Open dashboard">
              Config
            </button>
            <button type="button" className="chatbox-icon chatbox-mic" disabled aria-label="Voice typing disabled">
              Mic
            </button>
          </div>
        </div>
        {preview ? (
          <div className="chatbox-preview">
            <span className="chatbox-preview-label">Assistant</span>
            <span className="chatbox-preview-text">{preview}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ChatBox;
