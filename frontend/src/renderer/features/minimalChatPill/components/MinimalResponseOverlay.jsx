/**
 * Provides the minimal response overlay module for the renderer UI.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { selectLiveTurnSurfaceState, useChatStore } from '../../chat/stores/chatStore';
import { useResponseOverlayViewModel } from '../hooks/useResponseOverlayViewModel';
import { useResponseOverlayWindowSync } from '../hooks/useResponseOverlayWindowSync';
import { useResponseOverlayScrollState } from '../hooks/useResponseOverlayScrollState';
import MessageItem from '../../chat/components/message/MessageItem';
import { DesktopMessageTransparencyRuntime } from '../../../app/runtime/desktopMessageTransparencyRuntime';
import { DesktopRendererTraceRuntime } from '../../../app/runtime/desktopRendererTraceRuntime';
import { DesktopResponseOverlayLayoutRuntime } from '../../../app/runtime/desktopResponseOverlayLayoutRuntime';
import { DesktopResponseOverlayRuntimeClient } from '../../../app/runtime/desktopResponseOverlayRuntimeClient';

const RESPONSE_FIXED_HEIGHT = DesktopResponseOverlayLayoutRuntime.getResponseOverlayFixedHeight();
const TYPING_FRAME_HEIGHT = (
  DesktopResponseOverlayLayoutRuntime.getResponseOverlayAwaitingFrameHeight()
);
const {
  logRendererResponseOverlayHitTestTrace,
  logRendererResponseOverlayStateTrace,
  logRendererResponseOverlayTypingRenderedTrace,
  logRendererResponseSurfaceRenderTrace,
  logRendererResponseSurfaceSnapshotTrace,
} = DesktopRendererTraceRuntime;

function MinimalResponseOverlay() {
  const {
    messages,
    thinkingStatus,
    currentTurnProjection,
    pendingTurn,
  } = useChatStore(useShallow(selectLiveTurnSurfaceState));
  const isSending = useChatStore((state) => state.isSending);
  const shellRef = useRef(null);
  const responseboxHitTestActiveRef = useRef(null);
  const lastLoggedSurfaceStateRef = useRef('');
  const lastRenderedTypingVisibleRef = useRef(null);

  const {
    responseOverlayEntries,
    latestSourceTaggedResponseEntry,
    responseEntrySignature,
    responseIsCloseable,
    overlayIntent,
    thinkingText,
    handleCloseResponse,
    latestResponseOverlayEntryId,
    showResponse,
    showAwaitingReply,
    overlayLayoutMode,
    isVisible,
    turnId: currentTurnId,
  } = useResponseOverlayViewModel({
    messages,
    thinkingStatus,
    currentTurnProjection,
    pendingTurn,
  });
  const {
    hasOverflowAbove,
    responsePillRef,
    handleResponseScroll,
  } = useResponseOverlayScrollState({
    showResponse,
    responseEntrySignature,
  });
  const conversationToolSchemas = useMemo(
    () => DesktopMessageTransparencyRuntime.resolveConversationToolSchemas(messages),
    [messages],
  );

  useResponseOverlayWindowSync({
    shellRef,
    isVisible,
    overlayLayoutMode,
    overlayIntent,
    responseEntrySignature,
    showResponse,
    thinkingText,
  });

  const setResponseboxHitTestActive = useCallback((active) => {
    const nextActive = active === true;
    if (responseboxHitTestActiveRef.current === nextActive) {
      return;
    }
    responseboxHitTestActiveRef.current = nextActive;
    DesktopResponseOverlayRuntimeClient.setResponseboxHitTestActiveValue(nextActive).catch(() => {});
    logRendererResponseOverlayHitTestTrace({
      conversationRef: currentTurnProjection?.conversationRef || null,
      active: nextActive,
    });
  }, [currentTurnProjection?.conversationRef]);

  useEffect(() => {
    setResponseboxHitTestActive(false);
    return () => {
      setResponseboxHitTestActive(false);
    };
  }, [setResponseboxHitTestActive]);

  const syncResponseboxHitTestForPointer = useCallback((event) => {
    const shellBounds = shellRef.current?.getBoundingClientRect?.();
    if (!shellBounds) {
      setResponseboxHitTestActive(false);
      return;
    }
    const pointerX = Number(event.clientX);
    const pointerY = Number(event.clientY);
    const isInsideResponse = (
      Number.isFinite(pointerX)
      && Number.isFinite(pointerY)
      && pointerX >= shellBounds.left
      && pointerX <= shellBounds.right
      && pointerY >= shellBounds.top
      && pointerY <= shellBounds.bottom
    );
    setResponseboxHitTestActive(isInsideResponse);
  }, [setResponseboxHitTestActive]);

  const disableResponseboxHitTest = useCallback(() => {
    setResponseboxHitTestActive(false);
  }, [setResponseboxHitTestActive]);

  useEffect(() => {
    window.addEventListener('mousemove', syncResponseboxHitTestForPointer);
    window.addEventListener('mouseleave', disableResponseboxHitTest);
    window.addEventListener('blur', disableResponseboxHitTest);
    return () => {
      window.removeEventListener('mousemove', syncResponseboxHitTestForPointer);
      window.removeEventListener('mouseleave', disableResponseboxHitTest);
      window.removeEventListener('blur', disableResponseboxHitTest);
    };
  }, [disableResponseboxHitTest, syncResponseboxHitTestForPointer]);

  useEffect(() => {
    const typingRendered = isVisible && showAwaitingReply;
    if (lastRenderedTypingVisibleRef.current === typingRendered) {
      return;
    }
    lastRenderedTypingVisibleRef.current = typingRendered;
    logRendererResponseOverlayTypingRenderedTrace({
      typingRendered,
      currentTurnProjection,
      currentTurnId,
      overlayIntent,
      overlayLayoutMode,
      isVisible,
      showAwaitingReply,
      showResponse,
      responseOverlayEntryCount: responseOverlayEntries.length,
    });
  }, [
    currentTurnId,
    currentTurnProjection,
    currentTurnProjection?.conversationRef,
    currentTurnProjection?.phase,
    currentTurnProjection?.turnRef,
    isVisible,
    overlayIntent,
    overlayIntent?.mode,
    overlayIntent?.staleGuardRef,
    overlayIntent?.turnRef,
    overlayLayoutMode,
    responseOverlayEntries.length,
    showAwaitingReply,
    showResponse,
  ]);

  useEffect(() => {
    const activeResponseTextLength = typeof latestSourceTaggedResponseEntry?.text === 'string'
      ? latestSourceTaggedResponseEntry.text.length
      : 0;
    const nextSurfaceStateSignature = JSON.stringify({
      isVisible,
      showAwaitingReply,
      showResponse,
      overlayLayoutMode,
      phase: currentTurnProjection?.phase || 'idle',
      turnId: currentTurnId || null,
      visibleResponseId: latestResponseOverlayEntryId || null,
      activeResponseTextLength,
    });
    if (lastLoggedSurfaceStateRef.current !== nextSurfaceStateSignature) {
      lastLoggedSurfaceStateRef.current = nextSurfaceStateSignature;
      logRendererResponseOverlayStateTrace({
        turnRef: currentTurnId || null,
        phase: currentTurnProjection?.phase || 'idle',
        isVisible,
        showAwaitingReply,
        showResponse,
        responseLayoutMode: overlayLayoutMode,
        visibleResponseId: latestResponseOverlayEntryId || null,
        responseEntryCount: responseOverlayEntries.length,
        activeResponseTextLength,
        thinkingText,
        isSending,
        messageCount: messages.length,
      });
    }
    logRendererResponseSurfaceSnapshotTrace({
      phase: currentTurnProjection?.phase || 'idle',
      isSending,
      messageCount: messages.length,
      activeResponseTextLength,
      responseType: latestSourceTaggedResponseEntry?.type || null,
      visibleResponseId: latestResponseOverlayEntryId,
      responseOverlayEntryCount: responseOverlayEntries.length,
      showAwaitingReply,
      showResponse,
      thinkingTextLength: typeof thinkingText === 'string' ? thinkingText.length : 0,
    });
    logRendererResponseSurfaceRenderTrace({
      turnRef: currentTurnId,
      phase: currentTurnProjection?.phase || 'idle',
      responseLayoutMode: overlayLayoutMode,
      showResponse,
      showAwaitingReply,
    });
  }, [
    currentTurnId,
    currentTurnProjection?.phase,
    isVisible,
    isSending,
    latestResponseOverlayEntryId,
    latestSourceTaggedResponseEntry?.text,
    latestSourceTaggedResponseEntry?.type,
    messages.length,
    responseOverlayEntries.length,
    showAwaitingReply,
    showResponse,
    thinkingText,
    overlayLayoutMode,
  ]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`chatbox-shell-wrap chatbox-response-shell-wrap${showResponse ? ' has-response-pill' : ''}${showAwaitingReply && !showResponse ? ' awaiting-only' : ''}`}
      style={{
        '--chatbox-awaiting-frame-height': `${TYPING_FRAME_HEIGHT}px`,
      }}
    >
      <div className="chatbox-shell" ref={shellRef}>
        {showResponse ? (
          <div
            className={`chatbox-response-pill${hasOverflowAbove ? ' has-overflow-above' : ''}`}
            ref={responsePillRef}
            style={{ height: `${RESPONSE_FIXED_HEIGHT}px` }}
            onScroll={handleResponseScroll}
          >
            <button
              type="button"
              className="chatbox-response-close"
              onClick={handleCloseResponse}
              disabled={!responseIsCloseable}
              aria-label={responseIsCloseable ? 'Close response' : 'Response still streaming'}
            >
              ×
            </button>
            <div className="chatbox-response-body">
              <div className="chatbox-response-transcript">
                {responseOverlayEntries.map((message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    conversationToolSchemas={conversationToolSchemas}
                    enableAssistantActions={false}
                    enableUserActions={false}
                    disableAssistantActions
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {showAwaitingReply ? (
          <div className="chatbox-awaiting-shell" data-thinking={thinkingText ? '1' : '0'}>
            <div className="chatbox-typing-indicator" aria-label="Assistant is awaiting reply">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default MinimalResponseOverlay;
