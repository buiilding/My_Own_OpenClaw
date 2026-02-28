import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../stores/chatStore';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { toSanitizedMarkdownHtml } from '../../../infrastructure/markdown';
import { resolveLlmOutputContract } from '../../../infrastructure/llmOutputContract';
import { selectChatBoxState } from '../utils/chatSelectors';
import { getRoundedFrameSize } from '../utils/overlayFrameSize';
import { subscribeResponseOverlayPhase } from '../utils/overlayPhaseListener';
import { useAutoResizedResponseHeight } from '../hooks/useAutoResizedResponseHeight';
import { isDevUiEnabled } from '../utils/devUiFlag';
import { resolveSourceTag } from '../utils/sourceTags';
import {
  isCompactHoverLayoutMode,
  RESPONSE_OVERLAY_LAYOUT_MODE,
  resolveResponseOverlayLayoutMode,
} from '../utils/responseOverlayLayoutMode';
import {
  isAwaitingFirstChunkPhase,
  isOverlayAwaitingReplyPhase,
  shouldOverlayClearAwaitingFirstChunk,
} from '../utils/streamPhaseState';
import {
  findLastUserIndex,
  findLatestMessageAfterUser,
} from './chatBoxResponseUtils';

const RESPONSE_TYPES = new Set(['llm-text', 'error']);
const FIRST_CHUNK_TYPES = new Set(['llm-text', 'error']);
const RESPONSE_MIN_HEIGHT = 92;
const RESPONSE_MAX_HEIGHT = 460;
const RESPONSE_CHROME_HEIGHT = 28;
const RESPONSE_BOTTOM_STICK_THRESHOLD = 20;
const THINKING_BOTTOM_STICK_THRESHOLD = 12;
const TYPING_FRAME_HEIGHT = 24;

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
    thinkingSourceEventType,
  } = useChatStore(useShallow(selectChatBoxState));
  const [closedResponseId, setClosedResponseId] = useState(null);
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
  const [overlayPhase, setOverlayPhase] = useState('idle');
  const [hasOverflowAbove, setHasOverflowAbove] = useState(false);
  const [hasThinkingOverflowAbove, setHasThinkingOverflowAbove] = useState(false);
  const shellRef = useRef(null);
  const responsePillRef = useRef(null);
  const responseBodyRef = useRef(null);
  const thinkingTextRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const shouldStickThinkingToBottomRef = useRef(true);
  const lastUserMessageIdRef = useRef(null);
  const lastFrameRef = useRef({
    width: 0,
    height: 0,
    visible: null,
    fullScreenGhost: false,
    compactHover: false,
    layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
  });

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
      && !awaitingFirstChunk
      && activeResponse.id !== closedResponseId,
  );

  const responseMarkdownHtml = useMemo(() => {
    if (!activeResponse || activeResponse.type === 'tool-call' || activeResponse.type === 'error') {
      return '';
    }
    const contract = resolveLlmOutputContract(activeResponse.text ?? '', {
      provider: activeResponse.modelProvider || null,
      modelId: activeResponse.modelId || null,
      enableMath: true,
      stripAccidentalHtmlTokens: true,
    });
    return toSanitizedMarkdownHtml(contract.markdown, { enableMath: contract.mathEnabled });
  }, [activeResponse]);
  const thinkingText = useMemo(
    () => (typeof thinkingStatus === 'string' ? thinkingStatus.trim() : ''),
    [thinkingStatus],
  );
  const showCompactionStatus = Boolean(
    !showResponse
      && thinkingText
      && thinkingSourceEventType === 'context-compaction-started',
  );
  const showAwaitingReply = (
    ((awaitingFirstChunk || isSending || isOverlayAwaitingReplyPhase(overlayPhase)) && !showResponse)
    || showCompactionStatus
  );
  const overlayLayoutMode = useMemo(() => resolveResponseOverlayLayoutMode({
    showResponse,
    showAwaitingReply,
    thinkingText,
  }), [showAwaitingReply, showResponse, thinkingText]);
  const isVisible = overlayLayoutMode !== RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN;
  const sourceTagForResponse = useMemo(() => {
    if (!isDevUiEnabled() || !activeResponse) {
      return null;
    }
    const sourceEventType = typeof activeResponse.sourceEventType === 'string' && activeResponse.sourceEventType
      ? activeResponse.sourceEventType
      : 'unknown';
    const sourceChannel = typeof activeResponse.sourceChannel === 'string' && activeResponse.sourceChannel
      ? activeResponse.sourceChannel
      : 'unknown';
    return resolveSourceTag(sourceEventType, sourceChannel);
  }, [activeResponse]);
  const sourceTagForThinking = useMemo(() => {
    if (!isDevUiEnabled() || !thinkingText) {
      return null;
    }
    return resolveSourceTag(thinkingSourceEventType || 'llm-thought', 'from-backend');
  }, [thinkingSourceEventType, thinkingText]);
  const responseHeight = useAutoResizedResponseHeight({
    activeResponseId: activeResponse?.id,
    bodyRef: responseBodyRef,
    enabled: showResponse,
    minHeight: RESPONSE_MIN_HEIGHT,
    maxHeight: RESPONSE_MAX_HEIGHT,
    chromeHeight: RESPONSE_CHROME_HEIGHT,
  });

  const reportOverlaySize = useCallback(async ({
    visible,
    layoutMode = RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
  }) => {
    if (!visible) {
      if (lastFrameRef.current.visible === false) {
        return;
      }
      lastFrameRef.current = {
        width: 0,
        height: 0,
        visible: false,
        fullScreenGhost: false,
        compactHover: false,
        layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
      };
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
      // Keep typing indicator hover position deterministic across tool/capture cycles.
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
    return subscribeResponseOverlayPhase((phase) => {
      setOverlayPhase(phase);
      if (isAwaitingFirstChunkPhase(phase)) {
        setAwaitingFirstChunk(true);
        setClosedResponseId(null);
      } else if (shouldOverlayClearAwaitingFirstChunk(phase)) {
        setAwaitingFirstChunk(false);
      }
    });
  }, []);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.RESPONSE_OVERLAY_VISIBILITY, (payload = {}) => {
      const overlayVisible = payload?.visible === true;
      if (!overlayVisible) {
        lastFrameRef.current = {
          width: 0,
          height: 0,
          visible: false,
          fullScreenGhost: false,
          compactHover: false,
          layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
        };
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
  }, [isVisible, overlayLayoutMode, reportOverlaySize]);

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
    shouldStickToBottomRef.current = true;
    setHasOverflowAbove(false);
    shouldStickThinkingToBottomRef.current = true;
    setHasThinkingOverflowAbove(false);
  }, [lastUserMessageId]);

  useEffect(() => {
    if (!awaitingFirstChunk || !firstTextOrError) {
      return;
    }
    setAwaitingFirstChunk(false);
  }, [awaitingFirstChunk, firstTextOrError]);

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

  const syncThinkingScrollState = useCallback(() => {
    const thinkingEl = thinkingTextRef.current;
    if (!thinkingEl) {
      setHasThinkingOverflowAbove(false);
      shouldStickThinkingToBottomRef.current = true;
      return;
    }

    setHasThinkingOverflowAbove(thinkingEl.scrollTop > 2);
    const distanceFromBottom = thinkingEl.scrollHeight - thinkingEl.clientHeight - thinkingEl.scrollTop;
    shouldStickThinkingToBottomRef.current = distanceFromBottom <= THINKING_BOTTOM_STICK_THRESHOLD;
  }, []);

  const handleThinkingScroll = useCallback(() => {
    syncThinkingScrollState();
  }, [syncThinkingScrollState]);

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
  }, [showResponse, activeResponse?.id, activeResponse?.text, responseHeight, syncScrollState]);

  useEffect(() => {
    if (!showAwaitingReply || !thinkingText) {
      setHasThinkingOverflowAbove(false);
      shouldStickThinkingToBottomRef.current = true;
      return;
    }

    const thinkingEl = thinkingTextRef.current;
    if (!thinkingEl) {
      return;
    }

    if (shouldStickThinkingToBottomRef.current) {
      thinkingEl.scrollTop = thinkingEl.scrollHeight;
    }
    syncThinkingScrollState();
  }, [showAwaitingReply, thinkingText, syncThinkingScrollState]);

  useEffect(() => {
    let observer = null;
    let cancelled = false;
    let rafId = null;

    if (!isVisible) {
      void reportOverlaySize({
        visible: false,
        layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
      });
      return () => {
        cancelled = true;
      };
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

    if (typeof ResizeObserver !== 'undefined' && shellRef.current) {
      observer = new ResizeObserver(() => {
        scheduleSizeUpdate();
      });
      observer.observe(shellRef.current);
    }

    scheduleSizeUpdate();

    return () => {
      cancelled = true;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (observer) {
        observer.disconnect();
      }
    };
  }, [
    isVisible,
    overlayLayoutMode,
    reportOverlaySize,
    activeResponse?.id,
    activeResponse?.text,
    responseHeight,
    showResponse,
    thinkingText,
  ]);

  useEffect(() => {
    return () => {
      void reportOverlaySize({
        visible: false,
        layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
      });
    };
  }, [reportOverlaySize]);

  const handleCloseResponse = useCallback(() => {
    if (!activeResponse || !responseIsCloseable) {
      return;
    }
    setClosedResponseId(activeResponse.id);
  }, [activeResponse, responseIsCloseable]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className={`chatbox-shell-wrap${showResponse ? ' has-response-pill' : ''}`}>
      <div className="chatbox-shell" ref={shellRef}>
        {showResponse ? (
          <div
            className={`chatbox-response-pill${hasOverflowAbove ? ' has-overflow-above' : ''}`}
            ref={responsePillRef}
            style={{ height: `${responseHeight}px` }}
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
            <div className="chatbox-response-body" ref={responseBodyRef}>
              {sourceTagForResponse ? (
                <div className="chatbox-source-badge" title={`source_event=${activeResponse?.sourceEventType || 'unknown'}`}>
                  {sourceTagForResponse}
                </div>
              ) : null}
              {renderResponseContent(activeResponse, responseMarkdownHtml)}
            </div>
          </div>
        ) : null}

        {showAwaitingReply ? (
          <>
            {thinkingText ? (
              <div
                className={`chatbox-thinking-stream${hasThinkingOverflowAbove ? ' has-overflow-above' : ''}`}
                ref={thinkingTextRef}
                onScroll={handleThinkingScroll}
                role="status"
                aria-live="polite"
                aria-label="Assistant reasoning stream"
              >
                {sourceTagForThinking ? (
                  <div className="chatbox-source-badge" title={`source_event=${thinkingSourceEventType || 'llm-thought'}`}>
                    {sourceTagForThinking}
                  </div>
                ) : null}
                <pre className="chatbox-thinking-stream-text">{thinkingText}</pre>
              </div>
            ) : null}
            <div className="chatbox-typing-indicator" aria-label="Assistant is awaiting reply">
              <span />
              <span />
              <span />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default ChatBoxResponse;
