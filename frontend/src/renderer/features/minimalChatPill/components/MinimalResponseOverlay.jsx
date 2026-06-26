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
import { DesktopResponseOverlayInteractionRuntime } from '../../../app/runtime/desktopResponseOverlayInteractionRuntime';
import { DesktopResponseOverlayRuntimeClient } from '../../../app/runtime/desktopResponseOverlayRuntimeClient';
import { DesktopResponseOverlayViewRuntime } from '../../../app/runtime/desktopResponseOverlayViewRuntime';

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
const {
  buildResponseOverlayTraceSummary,
} = DesktopResponseOverlayViewRuntime;

function MinimalResponseOverlay() {
  const chatSurfaceState = useChatStore(useShallow(selectLiveTurnSurfaceState));
  const {
    messages,
  } = chatSurfaceState;
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
    currentTurnPhase,
    thinkingText,
    handleCloseResponse,
    latestResponseOverlayEntryId,
    responseVisible,
    awaitingVisible,
    overlayLayoutMode,
    isVisible,
    turnId: currentTurnId,
  } = useResponseOverlayViewModel({
    chatSurfaceState,
  });
  const latestResponseText = latestSourceTaggedResponseEntry?.text;
  const latestResponseType = latestSourceTaggedResponseEntry?.type;
  const responseOverlayEntryCount = responseOverlayEntries.length;
  const {
    hasOverflowAbove,
    responsePillRef,
    handleResponseScroll,
  } = useResponseOverlayScrollState({
    responseVisible,
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
    responseVisible,
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
      overlayIntent,
      active: nextActive,
    });
  }, [overlayIntent]);

  useEffect(() => {
    setResponseboxHitTestActive(false);
    return () => {
      setResponseboxHitTestActive(false);
    };
  }, [setResponseboxHitTestActive]);

  useEffect(() => {
    return DesktopResponseOverlayInteractionRuntime.subscribeToResponseboxHitTestEvents({
      shellRef,
      onHitTestActiveChange: setResponseboxHitTestActive,
    });
  }, [setResponseboxHitTestActive]);

  useEffect(() => {
    const typingRendered = isVisible && awaitingVisible;
    if (lastRenderedTypingVisibleRef.current === typingRendered) {
      return;
    }
    lastRenderedTypingVisibleRef.current = typingRendered;
    logRendererResponseOverlayTypingRenderedTrace({
      typingRendered,
      turnRef: currentTurnId,
      phase: currentTurnPhase,
      currentTurnId,
      overlayIntent,
      overlayLayoutMode,
      isVisible,
      awaitingVisible,
      responseVisible,
      responseOverlayEntryCount,
    });
  }, [
    currentTurnId,
    currentTurnPhase,
    isVisible,
    overlayIntent,
    overlayLayoutMode,
    responseOverlayEntryCount,
    awaitingVisible,
    responseVisible,
  ]);

  useEffect(() => {
    const traceSummary = buildResponseOverlayTraceSummary({
      awaitingVisible,
      currentTurnPhase,
      isVisible,
      latestResponseOverlayEntryId,
      latestSourceTaggedResponseEntry: {
        text: latestResponseText,
        type: latestResponseType,
      },
      messageCount: messages.length,
      overlayLayoutMode,
      responseOverlayEntryCount,
      responseVisible,
      thinkingText,
      turnId: currentTurnId,
    });
    if (lastLoggedSurfaceStateRef.current !== traceSummary.signature) {
      lastLoggedSurfaceStateRef.current = traceSummary.signature;
      logRendererResponseOverlayStateTrace(traceSummary.stateTrace);
    }
    logRendererResponseSurfaceSnapshotTrace(traceSummary.snapshotTrace);
    logRendererResponseSurfaceRenderTrace(traceSummary.renderTrace);
  }, [
    currentTurnId,
    currentTurnPhase,
    isVisible,
    latestResponseOverlayEntryId,
    latestResponseText,
    latestResponseType,
    messages.length,
    responseOverlayEntryCount,
    awaitingVisible,
    responseVisible,
    thinkingText,
    overlayLayoutMode,
  ]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`chatbox-shell-wrap chatbox-response-shell-wrap${responseVisible ? ' has-response-pill' : ''}${awaitingVisible && !responseVisible ? ' awaiting-only' : ''}`}
      style={{
        '--chatbox-awaiting-frame-height': `${TYPING_FRAME_HEIGHT}px`,
      }}
    >
      <div className="chatbox-shell" ref={shellRef}>
        {responseVisible ? (
          <div className="chatbox-response-frame">
            <button
              type="button"
              className="chatbox-response-close"
              onClick={handleCloseResponse}
              disabled={!responseIsCloseable}
              aria-label={responseIsCloseable ? 'Close response' : 'Response still streaming'}
            >
              ×
            </button>
            <div
              className={`chatbox-response-pill${hasOverflowAbove ? ' has-overflow-above' : ''}`}
              ref={responsePillRef}
              style={{ height: `${RESPONSE_FIXED_HEIGHT}px` }}
              onScroll={handleResponseScroll}
            >
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
          </div>
        ) : null}

        {awaitingVisible ? (
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
