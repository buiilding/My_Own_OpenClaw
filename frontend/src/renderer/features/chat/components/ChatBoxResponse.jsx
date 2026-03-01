import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../stores/chatStore';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { toSanitizedMarkdownHtml } from '../../../infrastructure/markdown';
import { resolveLlmOutputContract } from '../../../infrastructure/llmOutputContract';
import { selectChatBoxState } from '../utils/chatSelectors';
import { getRoundedFrameSize } from '../utils/overlayFrameSize';
import { subscribeResponseOverlayPhase } from '../utils/overlayPhaseListener';
import { isDevUiEnabled } from '../utils/devUiFlag';
import { resolveSourceTag } from '../utils/sourceTags';
import {
  isCompactHoverLayoutMode,
  RESPONSE_OVERLAY_LAYOUT_MODE,
  resolveResponseOverlayLayoutMode,
} from '../utils/responseOverlayLayoutMode';
import { RESPONSE_OVERLAY_PHASE } from '../utils/responseOverlayPhaseContract';
import {
  isLoopActivePhase,
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
const RESPONSE_FIXED_HEIGHTS = [92, 164, 236, 324, 460];
const RESPONSE_MIN_HEIGHT = RESPONSE_FIXED_HEIGHTS[0];
const RESPONSE_CHROME_HEIGHT = 28;
const RESPONSE_BOTTOM_STICK_THRESHOLD = 20;
const TYPING_FRAME_HEIGHT = 24;

function resolveSteppedResponseHeight(measuredHeight) {
  if (!Number.isFinite(measuredHeight)) {
    return RESPONSE_MIN_HEIGHT;
  }
  for (const fixedHeight of RESPONSE_FIXED_HEIGHTS) {
    if (measuredHeight <= fixedHeight) {
      return fixedHeight;
    }
  }
  return RESPONSE_FIXED_HEIGHTS[RESPONSE_FIXED_HEIGHTS.length - 1];
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
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
  const [awaitingPhaseLatch, setAwaitingPhaseLatch] = useState(false);
  const [awaitingOverlayLock, setAwaitingOverlayLock] = useState({
    active: false,
    baselineResponseId: null,
    baselineResponseText: null,
    correlationId: null,
  });
  const [overlayPhase, setOverlayPhase] = useState('idle');
  const [hasOverflowAbove, setHasOverflowAbove] = useState(false);
  const [responseHeight, setResponseHeight] = useState(RESPONSE_MIN_HEIGHT);
  const shellRef = useRef(null);
  const responsePillRef = useRef(null);
  const responseBodyRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const hideOverlayTimeoutRef = useRef(null);
  const lastUserMessageIdRef = useRef(null);
  const lastFrameRef = useRef({
    width: 0,
    height: 0,
    visible: null,
    fullScreenGhost: false,
    compactHover: false,
    layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
  });
  const activeResponseIdRef = useRef(null);
  const activeResponseTextRef = useRef(null);
  const clearAwaitingOverlayLock = useCallback(() => ({
    active: false,
    baselineResponseId: null,
    baselineResponseText: null,
    correlationId: null,
  }), []);

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
  const firstChunkId = firstTextOrError?.id || null;
  const responseIsCloseable = useMemo(() => {
    if (!activeResponse) {
      return false;
    }
    if (activeResponse.type === 'error') {
      return true;
    }
    return Boolean(activeResponse.isComplete);
  }, [activeResponse]);
  useEffect(() => {
    activeResponseIdRef.current = activeResponse?.id || null;
  }, [activeResponse?.id]);
  useEffect(() => {
    activeResponseTextRef.current = typeof activeResponse?.text === 'string'
      ? activeResponse.text
      : null;
  }, [activeResponse?.text]);

  const hasFreshChunkForOverlayLock = Boolean(
    awaitingOverlayLock.active
      && firstChunkId
      && (
        firstChunkId !== awaitingOverlayLock.baselineResponseId
        || (
          firstChunkId === awaitingOverlayLock.baselineResponseId
          && typeof activeResponse?.text === 'string'
          && typeof awaitingOverlayLock.baselineResponseText === 'string'
          && activeResponse.text !== awaitingOverlayLock.baselineResponseText
        )
      ),
  );
  const shouldSuppressResponseForOverlayLock = (
    awaitingOverlayLock.active
    && !hasFreshChunkForOverlayLock
  );
  const shouldForceAwaitingState = (
    (awaitingFirstChunk && !firstChunkId)
    || awaitingPhaseLatch
    || shouldSuppressResponseForOverlayLock
    || isSending
    || isOverlayAwaitingReplyPhase(overlayPhase)
  );

  const showResponse = Boolean(
    activeResponse
      && !shouldForceAwaitingState
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
  const showAwaitingReply = (
    shouldForceAwaitingState
    && !showResponse
  );
  const overlayLayoutMode = useMemo(() => resolveResponseOverlayLayoutMode({
    showResponse,
    showAwaitingReply,
  }), [showAwaitingReply, showResponse]);
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
    return subscribeResponseOverlayPhase((phase, payload = {}) => {
      const payloadCorrelationId = (
        typeof payload?.correlation_id === 'string' && payload.correlation_id.trim().length > 0
      )
        ? payload.correlation_id.trim()
        : null;
      setOverlayPhase(phase);
      if (isAwaitingFirstChunkPhase(phase)) {
        setAwaitingFirstChunk(true);
        setClosedResponseId(null);
      } else if (shouldOverlayClearAwaitingFirstChunk(phase)) {
        setAwaitingFirstChunk(false);
      }
      if (isOverlayAwaitingReplyPhase(phase) || isAwaitingFirstChunkPhase(phase)) {
        setAwaitingPhaseLatch(true);
        setAwaitingOverlayLock((currentLock) => {
          if (currentLock.active) {
            return {
              ...currentLock,
              correlationId: payloadCorrelationId || currentLock.correlationId,
            };
          }
          return {
            active: true,
            baselineResponseId: activeResponseIdRef.current,
            baselineResponseText: activeResponseTextRef.current,
            correlationId: payloadCorrelationId,
          };
        });
      } else if (
        phase === RESPONSE_OVERLAY_PHASE.STREAMING
        || phase === RESPONSE_OVERLAY_PHASE.COMPLETE
        || phase === RESPONSE_OVERLAY_PHASE.ERROR
      ) {
        const isStreamingPhase = phase === RESPONSE_OVERLAY_PHASE.STREAMING;
        setAwaitingPhaseLatch((currentLatch) => {
          if (!currentLatch) {
            return currentLatch;
          }
          if (!awaitingOverlayLock.active) {
            return false;
          }
          if (!awaitingOverlayLock.correlationId || !payloadCorrelationId) {
            return isStreamingPhase ? currentLatch : false;
          }
          return awaitingOverlayLock.correlationId === payloadCorrelationId ? false : currentLatch;
        });
        setAwaitingOverlayLock((currentLock) => {
          if (!currentLock.active) {
            return currentLock;
          }
          if (!currentLock.correlationId || !payloadCorrelationId) {
            return isStreamingPhase ? currentLock : clearAwaitingOverlayLock();
          }
          return currentLock.correlationId === payloadCorrelationId
            ? clearAwaitingOverlayLock()
            : currentLock;
        });
      }
    });
  }, [awaitingOverlayLock.active, awaitingOverlayLock.correlationId, clearAwaitingOverlayLock]);

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
        const shouldLatchAwaitingOnReappear = (
          isSending
          || awaitingFirstChunk
          || awaitingPhaseLatch
          || awaitingOverlayLock.active
          || isLoopActivePhase(overlayPhase)
        );
        if (shouldLatchAwaitingOnReappear) {
          setAwaitingPhaseLatch(true);
          setAwaitingOverlayLock((currentLock) => {
            if (currentLock.active) {
              return currentLock;
            }
            return {
              active: true,
              baselineResponseId: activeResponseIdRef.current,
              baselineResponseText: activeResponseTextRef.current,
              correlationId: null,
            };
          });
        }
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
    isSending,
    awaitingFirstChunk,
    awaitingPhaseLatch,
    awaitingOverlayLock.active,
    overlayPhase,
  ]);

  useEffect(() => {
    if (!lastUserMessageId) {
      return;
    }
    if (lastUserMessageIdRef.current === lastUserMessageId) {
      return;
    }
    lastUserMessageIdRef.current = lastUserMessageId;
    if (firstTextOrError) {
      setAwaitingFirstChunk(false);
      setAwaitingPhaseLatch(false);
      setAwaitingOverlayLock(clearAwaitingOverlayLock());
      setClosedResponseId(null);
      return;
    }
    setAwaitingFirstChunk(true);
    setAwaitingPhaseLatch(true);
    setAwaitingOverlayLock({
      active: true,
      baselineResponseId: activeResponseIdRef.current,
      baselineResponseText: activeResponseTextRef.current,
      correlationId: null,
    });
    setClosedResponseId(null);
    shouldStickToBottomRef.current = true;
    setHasOverflowAbove(false);
  }, [lastUserMessageId, firstTextOrError, clearAwaitingOverlayLock]);

  useEffect(() => {
    if (!awaitingFirstChunk || !firstTextOrError) {
      return;
    }
    setAwaitingFirstChunk(false);
  }, [awaitingFirstChunk, firstTextOrError]);

  useEffect(() => {
    if (hasFreshChunkForOverlayLock && awaitingOverlayLock.active) {
      setAwaitingOverlayLock(clearAwaitingOverlayLock());
      setAwaitingPhaseLatch(false);
      return;
    }
    if (showResponse && awaitingPhaseLatch) {
      setAwaitingPhaseLatch(false);
    }
  }, [showResponse, awaitingPhaseLatch, hasFreshChunkForOverlayLock, awaitingOverlayLock.active, clearAwaitingOverlayLock]);

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
      setResponseHeight(RESPONSE_MIN_HEIGHT);
      return;
    }

    let cancelled = false;
    const rafId = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      const bodyEl = responseBodyRef.current;
      if (!bodyEl) {
        return;
      }
      const measuredHeight = bodyEl.scrollHeight + RESPONSE_CHROME_HEIGHT;
      const nextHeight = resolveSteppedResponseHeight(measuredHeight);
      setResponseHeight((currentHeight) => (
        currentHeight === nextHeight ? currentHeight : nextHeight
      ));
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [showResponse, activeResponse?.id, activeResponse?.text, responseMarkdownHtml]);

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
    let cancelled = false;
    let rafId = null;

    if (hideOverlayTimeoutRef.current !== null) {
      window.clearTimeout(hideOverlayTimeoutRef.current);
      hideOverlayTimeoutRef.current = null;
    }

    if (!isVisible) {
      // Avoid single-frame hide/show oscillation during capture-return state updates.
      hideOverlayTimeoutRef.current = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        hideOverlayTimeoutRef.current = null;
        void reportOverlaySize({
          visible: false,
          layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
        });
      }, 120);
      return () => {
        cancelled = true;
        if (hideOverlayTimeoutRef.current !== null) {
          window.clearTimeout(hideOverlayTimeoutRef.current);
          hideOverlayTimeoutRef.current = null;
        }
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
    responseHeight,
    showResponse,
    thinkingText,
  ]);

  useEffect(() => {
    return () => {
      if (hideOverlayTimeoutRef.current !== null) {
        window.clearTimeout(hideOverlayTimeoutRef.current);
        hideOverlayTimeoutRef.current = null;
      }
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
    <div className={`chatbox-shell-wrap chatbox-response-shell-wrap${showResponse ? ' has-response-pill' : ''}`}>
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
