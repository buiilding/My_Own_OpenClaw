import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../stores/chatStore';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { toSanitizedMarkdownHtml } from '../../../infrastructure/markdown';
import { selectChatBoxState } from '../utils/chatSelectors';
import { getRoundedFrameSize } from '../utils/overlayFrameSize';
import { subscribeResponseOverlayPhase } from '../utils/overlayPhaseListener';
import { buildToolGhostPreviewFromMessageText } from '../utils/toolGhostPreview';
import { useToolGhostLifecycle } from './useToolGhostLifecycle';
import {
  buildToolGhostTrackStyle,
  findLastUserIndex,
  findLatestMessageAfterUser,
  findLatestToolCallAfterUser,
} from './chatBoxResponseUtils';

const RESPONSE_TYPES = new Set(['llm-text', 'error']);
const FIRST_CHUNK_TYPES = new Set(['llm-text', 'error']);
const RESPONSE_MIN_HEIGHT = 92;
const RESPONSE_MAX_HEIGHT = 460;
const RESPONSE_CHROME_HEIGHT = 28;
const RESPONSE_BOTTOM_STICK_THRESHOLD = 20;
const THINKING_BOTTOM_STICK_THRESHOLD = 12;

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
  const { messages, thinkingStatus } = useChatStore(useShallow(selectChatBoxState));
  const [closedResponseId, setClosedResponseId] = useState(null);
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
  const [overlayPhase, setOverlayPhase] = useState('idle');
  const [responseHeight, setResponseHeight] = useState(RESPONSE_MIN_HEIGHT);
  const [hasOverflowAbove, setHasOverflowAbove] = useState(false);
  const [hasThinkingOverflowAbove, setHasThinkingOverflowAbove] = useState(false);
  const shellRef = useRef(null);
  const responsePillRef = useRef(null);
  const responseBodyRef = useRef(null);
  const thinkingTextRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const shouldStickThinkingToBottomRef = useRef(true);
  const lastUserMessageIdRef = useRef(null);
  const lastFrameRef = useRef({ width: 0, height: 0, visible: null, fullScreenGhost: false });

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
  const activeToolCall = useMemo(
    () => findLatestToolCallAfterUser(messages, lastUserIndex),
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

  const showAwaitingReply = (
    awaitingFirstChunk || overlayPhase === 'awaiting-first-chunk'
  ) && !showResponse && overlayPhase !== 'tool-call';
  const toolGhostPreview = useMemo(
    () => buildToolGhostPreviewFromMessageText(activeToolCall?.text ?? ''),
    [activeToolCall],
  );
  const shouldShowToolGhostBase = !showResponse && overlayPhase === 'tool-call' && Boolean(activeToolCall);
  const {
    toolGhostStartRatio,
    toolGhostResolvedTargetRatio,
    toolGhostReady,
    toolGhostHidden,
    toolGhostViewportSize,
  } = useToolGhostLifecycle({
    shouldShowToolGhostBase,
    toolGhostPreview,
    activeToolCallId: activeToolCall?.id,
  });
  const showToolGhost = shouldShowToolGhostBase && (
    !toolGhostPreview.isMouseClick || (toolGhostReady && !toolGhostHidden)
  );
  const isVisible = showResponse || showAwaitingReply || showToolGhost;
  const shouldUseFullscreenGhostFrame = showToolGhost && toolGhostPreview.isMotionAction;
  const shouldRenderResponseShell = showResponse || showAwaitingReply;
  const effectiveTargetRatio = useMemo(
    () => toolGhostResolvedTargetRatio || (
      toolGhostPreview.hasTarget
        ? { xRatio: toolGhostPreview.xRatio, yRatio: toolGhostPreview.yRatio }
        : null
    ),
    [
      toolGhostResolvedTargetRatio,
      toolGhostPreview.hasTarget,
      toolGhostPreview.xRatio,
      toolGhostPreview.yRatio,
    ],
  );
  const hasEffectiveTarget = Boolean(effectiveTargetRatio);
  const toolGhostTrackStyle = useMemo(() => {
    return buildToolGhostTrackStyle(toolGhostPreview, toolGhostStartRatio, effectiveTargetRatio);
  }, [toolGhostPreview, toolGhostStartRatio, effectiveTargetRatio]);
  const responseMarkdownHtml = useMemo(() => {
    if (!activeResponse || activeResponse.type === 'tool-call' || activeResponse.type === 'error') {
      return '';
    }
    return toSanitizedMarkdownHtml(activeResponse.text ?? '');
  }, [activeResponse]);
  const thinkingText = useMemo(
    () => (typeof thinkingStatus === 'string' ? thinkingStatus.trim() : ''),
    [thinkingStatus],
  );

  const reportOverlaySize = useCallback(async ({
    visible,
    fullScreenGhost = false,
    viewportWidth = null,
    viewportHeight = null,
  }) => {
    if (!visible) {
      if (lastFrameRef.current.visible === false) {
        return;
      }
      lastFrameRef.current = { width: 0, height: 0, visible: false, fullScreenGhost: false };
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

    if (fullScreenGhost) {
      const width = Number.isFinite(viewportWidth) ? Math.max(1, Math.round(viewportWidth)) : 0;
      const height = Number.isFinite(viewportHeight) ? Math.max(1, Math.round(viewportHeight)) : 0;
      const unchanged = (
        lastFrameRef.current.visible === true
        && lastFrameRef.current.fullScreenGhost === true
        && lastFrameRef.current.width === width
        && lastFrameRef.current.height === height
      );
      if (unchanged) {
        return;
      }
      lastFrameRef.current = { width, height, visible: true, fullScreenGhost: true };
      try {
        await IpcBridge.invoke(INVOKE_CHANNELS.SET_RESPONSEBOX_SIZE, {
          visible: true,
          width,
          height,
          full_screen: true,
        });
      } catch (error) {
        console.warn('[ChatBoxResponse] Failed to enter fullscreen ghost overlay mode:', error);
      }
      return;
    }

    const nextFrame = getRoundedFrameSize(shellRef.current);
    if (!nextFrame) {
      return;
    }
    const { width, height } = nextFrame;
    const unchanged = (
      lastFrameRef.current.visible === true
      && lastFrameRef.current.fullScreenGhost === false
      && lastFrameRef.current.width === width
      && lastFrameRef.current.height === height
    );
    if (unchanged) {
      return;
    }
    lastFrameRef.current = { width, height, visible: true, fullScreenGhost: false };

    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SET_RESPONSEBOX_SIZE, {
        visible: true,
        width,
        height,
      });
    } catch (error) {
      console.warn('[ChatBoxResponse] Failed to resize response overlay:', error);
    }
  }, []);

  useEffect(() => {
    return subscribeResponseOverlayPhase((phase) => {
      setOverlayPhase(phase);
      if (phase === 'awaiting-first-chunk') {
        setAwaitingFirstChunk(true);
        setClosedResponseId(null);
      } else if (phase === 'streaming' || phase === 'complete' || phase === 'error' || phase === 'idle') {
        setAwaitingFirstChunk(false);
      }
    });
  }, []);

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
      setResponseHeight(RESPONSE_MIN_HEIGHT);
      setHasOverflowAbove(false);
      shouldStickToBottomRef.current = true;
      return;
    }

    const bodyEl = responseBodyRef.current;
    if (!bodyEl) {
      return;
    }

    let animationFrameId = null;
    let resizeObserver = null;

    const recalcHeight = () => {
      const measuredHeight = bodyEl.scrollHeight + RESPONSE_CHROME_HEIGHT;
      const nextHeight = Math.max(
        RESPONSE_MIN_HEIGHT,
        Math.min(RESPONSE_MAX_HEIGHT, measuredHeight),
      );
      setResponseHeight((prevHeight) => (prevHeight === nextHeight ? prevHeight : nextHeight));
    };

    const scheduleRecalc = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        recalcHeight();
      });
    };

    scheduleRecalc();

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleRecalc);
      resizeObserver.observe(bodyEl);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [showResponse, activeResponse?.id]);

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

    if (!isVisible) {
      void reportOverlaySize({ visible: false });
      return () => {};
    }

    const updateSize = () => {
      void reportOverlaySize({
        visible: true,
        fullScreenGhost: shouldUseFullscreenGhostFrame,
        viewportWidth: toolGhostViewportSize.width,
        viewportHeight: toolGhostViewportSize.height,
      });
    };

    if (!shouldUseFullscreenGhostFrame && typeof ResizeObserver !== 'undefined' && shellRef.current) {
      observer = new ResizeObserver(() => {
        window.requestAnimationFrame(updateSize);
      });
      observer.observe(shellRef.current);
    }

    updateSize();
    window.requestAnimationFrame(updateSize);

    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, [
    isVisible,
    reportOverlaySize,
    shouldUseFullscreenGhostFrame,
    toolGhostViewportSize.width,
    toolGhostViewportSize.height,
  ]);

  useEffect(() => {
    return () => {
      void reportOverlaySize({ visible: false });
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
    <>
      {shouldRenderResponseShell ? (
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
      ) : null}

      {showToolGhost ? (
        <div className="chatbox-tool-ghost" aria-label="Assistant tool action preview">
          <div
            key={activeToolCall?.id || 'tool-ghost-track'}
            className={`chatbox-tool-ghost-track${hasEffectiveTarget ? ' is-targeted' : ''}${toolGhostPreview.hasRect ? ' has-rect' : ''}${toolGhostPreview.isMouseClick ? ' is-click-animating' : ''}${toolGhostPreview.isMotionAction ? ' is-moving' : ''}`}
            style={toolGhostTrackStyle || undefined}
          >
            {toolGhostPreview.hasRect ? (
              <div className="chatbox-tool-ghost-target-rect" />
            ) : null}
            {hasEffectiveTarget && toolGhostPreview.showsTargetRipple ? (
              <div className={`chatbox-tool-ghost-target-ripple${toolGhostPreview.isMouseClick ? ' is-click-timeline' : ''}`} />
            ) : null}
            <div className="chatbox-tool-ghost-cursor-wrap" aria-hidden="true">
              <div className="chatbox-tool-ghost-ring" />
              <div className="chatbox-tool-ghost-cursor">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <polyline
                    points="4 4 20 12 13 13 12 20 4 4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line
                    x1="9"
                    y1="9"
                    x2="13"
                    y2="13"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="chatbox-tool-ghost-label">{toolGhostPreview.label}</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default ChatBoxResponse;
