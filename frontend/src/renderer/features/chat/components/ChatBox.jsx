import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';

function getLatestAssistantMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.sender === 'assistant' && msg.type !== 'tool-output' && msg.text) {
      return msg.text;
    }
  }
  return null;
}

function trimPreview(text, maxLength) {
  if (!text) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

function ChatBox() {
  const messages = useChatStore((state) => state.messages);
  const isSending = useChatStore((state) => state.isSending);
  const thinkingStatus = useChatStore((state) => state.thinkingStatus);
  const { sendMessage } = useChatMessageSender();
  const [inputValue, setInputValue] = useState('');
  const ignoreMouseRef = useRef(true);
  const inputRef = useRef(null);

  const lastAssistantMessage = useMemo(
    () => getLatestAssistantMessage(messages),
    [messages]
  );

  const statusText = thinkingStatus
    ? 'Thinking…'
    : isSending
      ? 'Sending…'
      : 'Ready';

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
    setOverlayIgnore(true);
    return () => {
      setOverlayIgnore(false);
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

  const handleMouseEnter = useCallback(() => {
    setOverlayIgnore(false);
  }, [setOverlayIgnore]);

  const handleMouseLeave = useCallback(() => {
    if (document.activeElement === inputRef.current) {
      return;
    }
    setOverlayIgnore(true);
  }, [setOverlayIgnore]);

  const handleInputFocus = useCallback(() => {
    setOverlayIgnore(false);
  }, [setOverlayIgnore]);

  const handleInputBlur = useCallback(() => {
    setOverlayIgnore(true);
  }, [setOverlayIgnore]);

  const handleOpenSettings = useCallback(async () => {
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW);
    } catch (error) {
      console.warn('[ChatBox] Failed to show main window:', error);
    }
  }, []);

  const preview = trimPreview(lastAssistantMessage, 140);

  return (
    <div className="chatbox-shell" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div className="chatbox-header">
        <div className="chatbox-status">
          <span className={`chatbox-indicator ${thinkingStatus ? 'is-thinking' : isSending ? 'is-sending' : ''}`} />
          <span className="chatbox-status-text">{statusText}</span>
        </div>
        <button type="button" className="chatbox-settings" onClick={handleOpenSettings}>
          Settings
        </button>
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
        <button type="submit" className="chatbox-send" disabled={isSending}>
          {isSending ? '…' : 'Send'}
        </button>
      </form>
      {preview ? (
        <div className="chatbox-preview">
          <span className="chatbox-preview-label">Assistant</span>
          <span className="chatbox-preview-text">{preview}</span>
        </div>
      ) : null}
    </div>
  );
}

export default ChatBox;
