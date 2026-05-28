import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../stores/chatStore';
import { useResponseOverlayViewModel } from '../hooks/useResponseOverlayViewModel';
import { useResponseOverlayWindowSync } from '../hooks/useResponseOverlayWindowSync';
import { useResponseOverlayScrollState } from '../hooks/useResponseOverlayScrollState';
import { sanitizeMarkdownHtml } from '../../../infrastructure/markdown';
import { selectChatBoxState } from '../utils/chatSelectors';
import {
  logRendererChatPillTrace,
  logRendererResponseSurfaceTrace,
} from '../utils/chatStream/chatStreamDebugTrace';
import { RESPONSE_OVERLAY_LAYOUT } from '../utils/overlay/responseOverlayLayoutContract';

const RESPONSE_FIXED_HEIGHT = RESPONSE_OVERLAY_LAYOUT.RESPONSE_FIXED_HEIGHT;
const TYPING_FRAME_HEIGHT = RESPONSE_OVERLAY_LAYOUT.AWAITING_FRAME_HEIGHT;

function renderResponseEntry(entry, markdownHtml) {
  if (!entry) {
    return null;
  }

  if (entry.type === 'tool-explanation' || entry.type === 'search-source') {
    return <div className="chatbox-response-text chatbox-response-plain">{entry.text}</div>;
  }

  if (entry.type === 'error') {
    return <div className="chatbox-response-text chatbox-response-plain chatbox-response-error">{entry.text}</div>;
  }

  return (
    <div
      className="chatbox-response-text chatbox-response-markdown"
      dangerouslySetInnerHTML={{ __html: sanitizeMarkdownHtml(markdownHtml) }}
    />
  );
}

function ChatBoxResponse() {
  const {
    messages,
    isSending,
    thinkingStatus,
    currentTurnProjection,
  } = useChatStore(useShallow(selectChatBoxState));
  const shellRef = useRef(null);
  const lastLoggedSurfaceStateRef = useRef('');
  const {
    responseOverlayEntries,
    latestSourceTaggedResponseEntry,
    responseEntrySignature,
    responseIsCloseable,
    renderedResponseEntries,
    thinkingText,
    sourceTagForResponse,
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
  });
  const {
    hasOverflowAbove,
    responsePillRef,
    handleResponseScroll,
  } = useResponseOverlayScrollState({
    showResponse,
    responseEntrySignature,
  });

  useResponseOverlayWindowSync({
    shellRef,
    isVisible,
    overlayLayoutMode,
    responseEntrySignature,
    showResponse,
    thinkingText,
  });

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
      console.log('[ResponseOverlayState][renderer]', {
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
              {sourceTagForResponse ? (
                <div className="chatbox-source-badge" title={`source_event=${latestSourceTaggedResponseEntry?.sourceEventType || 'unknown'}`}>
                  {sourceTagForResponse}
                </div>
              ) : null}
              <div className="chatbox-response-transcript">
                {renderedResponseEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`chatbox-response-entry chatbox-response-entry-${entry.type}`}
                  >
                    {renderResponseEntry(entry, entry.markdownHtml)}
                  </div>
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

export default ChatBoxResponse;
