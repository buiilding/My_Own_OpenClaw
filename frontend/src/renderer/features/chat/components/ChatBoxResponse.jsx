import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../stores/chatStore';
import { useChatLoopUiState } from '../hooks/useChatLoopUiState';
import { useResponseOverlayPhase } from '../hooks/useResponseOverlayPhase';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { toSanitizedMarkdownHtml } from '../../../infrastructure/markdown';
import { resolveLlmOutputContract } from '../../../infrastructure/llmOutputContract';
import { selectChatBoxState } from '../utils/chatSelectors';
import { getRoundedFrameSize } from '../utils/overlay/overlayFrameSize';
import { isDevUiEnabled } from '../utils/devUiFlag';
import {
  hasVisibleChatboxResponse,
  resolveChatboxSurfaceStateFromLoopUiState,
  shouldShowChatboxAwaitingReply,
  shouldShowChatboxResponse,
} from '../utils/state/chatboxSurfaceState';
import {
  isCompactHoverLayoutMode,
  RESPONSE_OVERLAY_LAYOUT_MODE,
  resolveResponseOverlayLayoutMode,
} from '../utils/overlay/responseOverlayLayoutMode';
import { RESPONSE_OVERLAY_PHASE } from '../utils/overlay/responseOverlayPhaseContract';
import {
  findLastUserIndex,
  findLatestMessageAfterUser,
} from './chatbox/chatBoxResponseUtils';
import {
  isResponseCloseable,
  normalizeThinkingText,
  resolveSourceTagForResponse,
  shouldRenderResponseMarkdown,
} from '../utils/state/chatBoxResponseState';
import { logRendererResponseSurfaceTrace } from '../utils/chatStream/chatStreamDebugTrace';

const RESPONSE_TYPES = new Set(['llm-text', 'error']);
const RESPONSE_FIXED_HEIGHT = 236;
const RESPONSE_BOTTOM_STICK_THRESHOLD = 20;
const TYPING_FRAME_HEIGHT = 24;

function createHiddenFrameState() {
  return {
    width: 0,
    height: 0,
    visible: false,
    fullScreenGhost: false,
    compactHover: false,
    layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
  };
}

function renderResponseContent(response, markdownHtml) {
  if (!response) {
    return null;
  }

  if (response.type === 'error') {
    return <div className="chatbox-response-text chatbox-response-plain">{response.text}</div>;
  }

  return (
    <div
      className="chatbox-response-text chatbox-response-markdown"
      dangerouslySetInnerHTML={{ __html: markdownHtml }}
    />
  );
}

function ChatBoxResponse() {
  const {
    messages,
    isSending,
    thinkingStatus,
  } = useChatStore(useShallow(selectChatBoxState));
  const [closedResponseId, setClosedResponseId] = useState(null);
  const overlayPhase = useResponseOverlayPhase();
  const [hasOverflowAbove, setHasOverflowAbove] = useState(false);
  const shellRef = useRef(null);
  const responsePillRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const lastFrameRef = useRef(createHiddenFrameState());

  const lastUserIndex = useMemo(
    () => findLastUserIndex(messages),
    [messages],
  );

  const activeResponse = useMemo(
    () => findLatestMessageAfterUser(messages, lastUserIndex, RESPONSE_TYPES),
    [messages, lastUserIndex],
  );

  const visibleResponse = useMemo(
    () => (hasVisibleChatboxResponse(activeResponse, closedResponseId) ? activeResponse : null),
    [activeResponse, closedResponseId],
  );

  const { loopUiState } = useChatLoopUiState({
    phase: overlayPhase,
    isSending,
    hasVisibleReply: Boolean(visibleResponse),
  });
  const surfaceState = useMemo(() => resolveChatboxSurfaceStateFromLoopUiState({
    loopUiState,
    hasVisibleResponse: Boolean(visibleResponse),
  }), [loopUiState, visibleResponse]);
  const showAwaitingReply = shouldShowChatboxAwaitingReply(surfaceState);
  const showResponse = shouldShowChatboxResponse(surfaceState);

  const responseIsCloseable = useMemo(() => {
    return isResponseCloseable(visibleResponse);
  }, [visibleResponse]);

  const responseMarkdownHtml = useMemo(() => {
    if (!shouldRenderResponseMarkdown(visibleResponse)) {
      return '';
    }
    const contract = resolveLlmOutputContract(visibleResponse.text ?? '', {
      provider: visibleResponse.modelProvider || null,
      modelId: visibleResponse.modelId || null,
      enableMath: true,
      stripAccidentalHtmlTokens: true,
    });
    return toSanitizedMarkdownHtml(contract.markdown, { enableMath: contract.mathEnabled });
  }, [visibleResponse]);

  const thinkingText = useMemo(
    () => normalizeThinkingText(thinkingStatus),
    [thinkingStatus],
  );

  const overlayLayoutMode = useMemo(() => resolveResponseOverlayLayoutMode({
    showResponse,
    showAwaitingReply,
  }), [showAwaitingReply, showResponse]);
  const isVisible = overlayLayoutMode !== RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN;

  const sourceTagForResponse = useMemo(() => {
    return resolveSourceTagForResponse({
      visibleResponse,
      showResponse,
      devUiEnabled: isDevUiEnabled(),
    });
  }, [showResponse, visibleResponse]);

  useEffect(() => {
    logRendererResponseSurfaceTrace({
      overlayPhase,
      isSending,
      messageCount: messages.length,
      activeResponseTextLength: typeof activeResponse?.text === 'string' ? activeResponse.text.length : 0,
      activeResponseType: activeResponse?.type || null,
      visibleResponseId: visibleResponse?.id || null,
      showAwaitingReply,
      showResponse,
      thinkingTextLength: typeof thinkingText === 'string' ? thinkingText.length : 0,
    });
  }, [
    activeResponse?.id,
    activeResponse?.text,
    activeResponse?.type,
    isSending,
    messages.length,
    overlayPhase,
    showAwaitingReply,
    showResponse,
    thinkingText,
    visibleResponse?.id,
  ]);

  const reportOverlaySize = useCallback(async ({
    visible,
    layoutMode = RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
  }) => {
    if (!visible) {
      if (lastFrameRef.current.visible === false) {
        return;
      }
      lastFrameRef.current = createHiddenFrameState();
      try {
        await IpcBridge.invoke(INVOKE_CHANNELS.SET_RESPONSEBOX_SIZE, {
          visible: false,
          width: 0,
          height: 0,
        });
      } catch (error) {
        console.warn('[ChatBoxResponse] Failed to hide response overlay:', error);
      }
      return;
    }

    const nextFrame = getRoundedFrameSize(shellRef.current);
    if (!nextFrame) {
      return;
    }
    const compactHover = isCompactHoverLayoutMode(layoutMode);
    let { width, height } = nextFrame;
    if (layoutMode === RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_TYPING) {
      // Typing mode stays on a fixed shell so the overlay never visibly jumps.
      height = TYPING_FRAME_HEIGHT;
    }
    const unchanged = (
      lastFrameRef.current.visible === true
      && lastFrameRef.current.fullScreenGhost === false
      && lastFrameRef.current.compactHover === Boolean(compactHover)
      && lastFrameRef.current.layoutMode === layoutMode
      && lastFrameRef.current.width === width
      && lastFrameRef.current.height === height
    );
    if (unchanged) {
      return;
    }
    lastFrameRef.current = {
      width,
      height,
      visible: true,
      fullScreenGhost: false,
      compactHover: Boolean(compactHover),
      layoutMode,
    };

    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SET_RESPONSEBOX_SIZE, {
        visible: true,
        width,
        height,
        compact_hover: Boolean(compactHover),
      });
    } catch (error) {
      console.warn('[ChatBoxResponse] Failed to resize response overlay:', error);
    }
  }, []);

  useEffect(() => {
    if (overlayPhase === RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK) {
      setClosedResponseId(null);
    }
  }, [overlayPhase]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.RESPONSE_OVERLAY_VISIBILITY, (payload = {}) => {
      const overlayVisible = payload?.visible === true;
      if (!overlayVisible) {
        lastFrameRef.current = createHiddenFrameState();
        return;
      }
      if (!isVisible) {
        return;
      }
      window.requestAnimationFrame(() => {
        void reportOverlaySize({
          visible: true,
          layoutMode: overlayLayoutMode,
        });
      });
    });
    return () => {
      removeListener?.();
    };
  }, [
    isVisible,
    overlayLayoutMode,
    reportOverlaySize,
  ]);

  const syncScrollState = useCallback(() => {
    const responseEl = responsePillRef.current;
    if (!responseEl) {
      setHasOverflowAbove(false);
      shouldStickToBottomRef.current = true;
      return;
    }

    setHasOverflowAbove(responseEl.scrollTop > 2);
    const distanceFromBottom = responseEl.scrollHeight - responseEl.clientHeight - responseEl.scrollTop;
    shouldStickToBottomRef.current = distanceFromBottom <= RESPONSE_BOTTOM_STICK_THRESHOLD;
  }, []);

  const handleResponseScroll = useCallback(() => {
    syncScrollState();
  }, [syncScrollState]);

  useEffect(() => {
    if (!showResponse) {
      setHasOverflowAbove(false);
      shouldStickToBottomRef.current = true;
    }
  }, [showResponse]);

  useEffect(() => {
    if (!showResponse) {
      return;
    }
    const responseEl = responsePillRef.current;
    if (!responseEl) {
      return;
    }

    if (shouldStickToBottomRef.current) {
      responseEl.scrollTop = responseEl.scrollHeight;
    }
    syncScrollState();
  }, [showResponse, activeResponse?.id, activeResponse?.text, syncScrollState]);

  useEffect(() => {
    let cancelled = false;
    let rafId = null;

    if (!isVisible) {
      void reportOverlaySize({
        visible: false,
        layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
      });
      return undefined;
    }

    const scheduleSizeUpdate = () => {
      if (cancelled) {
        return;
      }
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        void reportOverlaySize({
          visible: true,
          layoutMode: overlayLayoutMode,
        });
      });
    };

    scheduleSizeUpdate();

    return () => {
      cancelled = true;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [
    isVisible,
    overlayLayoutMode,
    reportOverlaySize,
    activeResponse?.id,
    activeResponse?.text,
    showResponse,
    thinkingText,
  ]);

  useEffect(() => {
    return () => {
      lastFrameRef.current = createHiddenFrameState();
      void reportOverlaySize({
        visible: false,
        layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
      });
    };
  }, [reportOverlaySize]);

  const handleCloseResponse = useCallback(() => {
    if (!visibleResponse || !responseIsCloseable) {
      return;
    }
    setClosedResponseId(visibleResponse.id);
  }, [responseIsCloseable, visibleResponse]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className={`chatbox-shell-wrap chatbox-response-shell-wrap${showResponse ? ' has-response-pill' : ''}${showAwaitingReply && !showResponse ? ' awaiting-only' : ''}`}>
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
                <div className="chatbox-source-badge" title={`source_event=${activeResponse?.sourceEventType || 'unknown'}`}>
                  {sourceTagForResponse}
                </div>
              ) : null}
              {renderResponseContent(visibleResponse, responseMarkdownHtml)}
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
