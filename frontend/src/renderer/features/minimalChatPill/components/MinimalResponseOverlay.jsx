/**
 * Provides the minimal response overlay module for the renderer UI.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../../chat/stores/chatStore';
import { useResponseOverlayViewModel } from '../hooks/useResponseOverlayViewModel';
import { useResponseOverlayWindowSync } from '../hooks/useResponseOverlayWindowSync';
import { useResponseOverlayScrollState } from '../hooks/useResponseOverlayScrollState';
import { selectLiveTurnSurfaceState } from '../../chat/utils/chatSelectors';
import MessageItem from '../../chat/components/message/MessageItem';
import { resolveConversationToolSchemas } from '../../chat/utils/message/messageTransparency';
import {
  logRendererChatPillTrace,
  logRendererLiveSurfaceTrace,
  logRendererResponseSurfaceTrace,
} from '../../chat/utils/chatStream/chatStreamDebugTrace';
import { RESPONSE_OVERLAY_LAYOUT } from '../../../app/runtime/desktopResponseOverlayLayoutRuntime';
import { DesktopResponseOverlayRuntimeClient } from '../../../app/runtime/desktopResponseOverlayRuntimeClient';

const RESPONSE_FIXED_HEIGHT = RESPONSE_OVERLAY_LAYOUT.RESPONSE_FIXED_HEIGHT;
const TYPING_FRAME_HEIGHT = RESPONSE_OVERLAY_LAYOUT.AWAITING_FRAME_HEIGHT;

function MinimalResponseOverlay() {
  const {
    messages,
    isSending,
    thinkingStatus,
    currentTurnProjection,
    pendingTurn,
  } = useChatStore(useShallow(selectLiveTurnSurfaceState));
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
    isSending,
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
    () => resolveConversationToolSchemas(messages),
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
    DesktopResponseOverlayRuntimeClient.setResponseboxHitTestActive({
      active: nextActive,
    }).catch(() => {});
    logRendererLiveSurfaceTrace('response_overlay.hit_test.set', {
      source: 'minimal-response-overlay-renderer',
      reason: 'renderer-normal-hit-test-request',
      active: nextActive,
      ignoreMouseEvents: !nextActive,
    }, currentTurnProjection?.conversationRef || null);
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
    logRendererLiveSurfaceTrace(
      typingRendered ? 'typing.rendered.show' : 'typing.rendered.hide',
      {
        source: 'minimal-response-overlay',
        reason: typingRendered ? 'awaiting-indicator-rendered' : 'awaiting-indicator-not-rendered',
        turnRef: currentTurnProjection?.turnRef || currentTurnId || null,
        conversationRef: currentTurnProjection?.conversationRef || null,
        phase: currentTurnProjection?.phase || 'idle',
        overlayMode: overlayIntent?.mode || overlayLayoutMode || null,
        guardRef: overlayIntent?.staleGuardRef
          || overlayIntent?.turnRef
          || currentTurnProjection?.turnRef
          || currentTurnId
          || null,
        isVisible,
        showAwaitingReply,
        showResponse,
        layoutMode: overlayLayoutMode,
        entryCount: responseOverlayEntries.length,
        hasVisibleContent: responseOverlayEntries.length > 0,
      },
      currentTurnProjection?.conversationRef || null,
    );
  }, [
    currentTurnId,
    currentTurnProjection?.conversationRef,
    currentTurnProjection?.phase,
    currentTurnProjection?.turnRef,
    isVisible,
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
      logRendererResponseSurfaceTrace({
        source: 'renderer-response-overlay-state',
        action: 'state-changed',
        turn_id: currentTurnId || null,
        phase: currentTurnProjection?.phase || 'idle',
        is_visible: isVisible,
        show_awaiting_reply: showAwaitingReply,
        show_response: showResponse,
        response_layout_mode: overlayLayoutMode,
        visible_response_id: latestResponseOverlayEntryId || null,
        response_entry_count: responseOverlayEntries.length,
        active_response_text_length: activeResponseTextLength,
        thinking_text_length: typeof thinkingText === 'string' ? thinkingText.length : 0,
        is_sending: isSending,
        message_count: messages.length,
      });
    }
    logRendererResponseSurfaceTrace({
      overlayPhase: currentTurnProjection?.phase || 'idle',
      isSending,
      messageCount: messages.length,
      activeResponseTextLength,
      activeResponseType: latestSourceTaggedResponseEntry?.type || null,
      visibleResponseId: latestResponseOverlayEntryId,
      responseOverlayEntryCount: responseOverlayEntries.length,
      showAwaitingReply,
      showResponse,
      thinkingTextLength: typeof thinkingText === 'string' ? thinkingText.length : 0,
    });
    logRendererChatPillTrace({
      source: 'renderer-response-surface',
      action: 'render',
      turn_id: currentTurnId,
      phase: currentTurnProjection?.phase || 'idle',
      response_layout_mode: overlayLayoutMode,
      show_response: showResponse,
      show_awaiting_reply: showAwaitingReply,
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
