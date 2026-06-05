import { useCallback, useEffect, useRef, useState } from 'react';
import { DesktopLiveTurnRuntimeClient } from '../../app/runtime/desktopLiveTurnRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../app/runtime/desktopTranscriptSessionRuntimeClient';
import { IpcBridge, INVOKE_CHANNELS, SEND_CHANNELS } from '../../infrastructure/ipc/bridge';
import { SendIcon } from '../chat/components/chatbox/ChatBoxIcons';
import {
  createChatboxDragState,
  getChatboxDragTarget,
  startChatboxDrag,
  stopChatboxDrag,
} from '../chat/utils/chatbox/chatboxPillLayout';
import { createConversationRef } from '../chat/utils/session/conversationRef';
import { useMinimalCurrentTurn } from './useMinimalCurrentTurn';

function resolveConversationRef() {
  const existing = DesktopTranscriptSessionRuntimeClient.getActiveConversationRef();
  if (typeof existing === 'string' && existing.trim()) {
    return existing.trim();
  }
  const nextConversationRef = createConversationRef();
  DesktopTranscriptSessionRuntimeClient.setActiveConversationRef(nextConversationRef);
  return nextConversationRef;
}

function isTurnTerminal(currentTurn, turnRef) {
  return Boolean(
    currentTurn
      && currentTurn.turnRef === turnRef
      && (currentTurn.phase === 'complete' || currentTurn.phase === 'error' || currentTurn.phase === 'idle'),
  );
}

function isInteractivePillTarget(target) {
  return Boolean(
    target?.closest?.('input, button, textarea, select, a, [data-no-pill-drag]'),
  );
}

export default function MinimalChatPill() {
  const [inputValue, setInputValue] = useState('');
  const [pendingTurnRef, setPendingTurnRef] = useState(null);
  const [sendError, setSendError] = useState(null);
  const inputRef = useRef(null);
  const dragStateRef = useRef(createChatboxDragState());
  const hitTestActiveRef = useRef(null);
  const { currentTurn, isBusy, status } = useMinimalCurrentTurn();
  const backendConnected = status?.phase !== 'error' && status?.phase !== 'closed';
  const showTyping = Boolean(
    pendingTurnRef
      && !isTurnTerminal(currentTurn, pendingTurnRef),
  );

  useEffect(() => {
    if (pendingTurnRef && isTurnTerminal(currentTurn, pendingTurnRef)) {
      setPendingTurnRef(null);
    }
  }, [currentTurn, pendingTurnRef]);

  const setChatboxHitTestActive = useCallback((active) => {
    const nextActive = active === true;
    if (hitTestActiveRef.current === nextActive) {
      return;
    }
    hitTestActiveRef.current = nextActive;
    IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_HIT_TEST_ACTIVE, {
      active: nextActive,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setChatboxHitTestActive(true);
    return () => setChatboxHitTestActive(false);
  }, [setChatboxHitTestActive]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    const text = inputValue.trim();
    if (!text || pendingTurnRef) {
      return;
    }
    const conversationRef = resolveConversationRef();
    const turnRef = crypto.randomUUID();
    setInputValue('');
    setSendError(null);
    setPendingTurnRef(turnRef);
    try {
      await DesktopLiveTurnRuntimeClient.sendQuery({
        text,
        conversationRef,
        turnRef,
        screenshotRef: null,
        screenshotUrl: null,
        screenshotRefs: null,
        captureMeta: null,
        attachmentContext: null,
        attachmentFilenames: null,
        screenshot: null,
        workspacePath: null,
        model: null,
      });
    } catch (error) {
      setPendingTurnRef(null);
      setSendError(error?.message || 'Message failed to send.');
    }
  }, [inputValue, pendingTurnRef]);

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
    if (event.button !== 0) {
      return;
    }
    if (isInteractivePillTarget(event.target)) {
      return;
    }
    startChatboxDrag(
      dragStateRef.current,
      event,
      window.screenX,
      window.screenY,
    );
  }, []);

  const handlePillClickCapture = useCallback((event) => {
    if (!dragStateRef.current.didDrag) {
      return;
    }
    dragStateRef.current.didDrag = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return (
    <div className="minimal-pill-shell-wrap">
      <form
        className={`minimal-pill${showTyping || isBusy ? ' is-working' : ''}`}
        onSubmit={handleSubmit}
        onMouseDown={handlePillMouseDown}
        onClickCapture={handlePillClickCapture}
        onMouseEnter={() => setChatboxHitTestActive(true)}
        onMouseMove={() => setChatboxHitTestActive(true)}
        onMouseLeave={() => setChatboxHitTestActive(false)}
      >
        {showTyping ? (
          <div className="minimal-pill-typing" aria-label="Assistant is typing">
            <span />
            <span />
            <span />
          </div>
        ) : null}
        <input
          ref={inputRef}
          className="minimal-pill-input"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder={backendConnected ? 'Ask WindieOS...' : 'Connecting...'}
          disabled={Boolean(pendingTurnRef)}
        />
        <button
          type="submit"
          className="minimal-pill-send"
          aria-label="Send message"
          title="Send message"
          disabled={Boolean(pendingTurnRef) || inputValue.trim().length === 0}
        >
          <SendIcon />
        </button>
      </form>
      {sendError ? (
        <div className="minimal-pill-error" role="status">{sendError}</div>
      ) : null}
    </div>
  );
}
