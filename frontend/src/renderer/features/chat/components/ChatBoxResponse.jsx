import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../stores/chatStore';
import { useCurrentTurnPresentationState } from '../hooks/useCurrentTurnPresentationState';
import { useResponseOverlayPhase } from '../hooks/useResponseOverlayPhase';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { toSanitizedMarkdownHtml } from '../../../infrastructure/markdown';
import { resolveLlmOutputContract } from '../../../infrastructure/llmOutputContract';
import { selectChatBoxState } from '../utils/chatSelectors';
import { getRoundedFrameSize } from '../utils/overlay/overlayFrameSize';
import { isDevUiEnabled } from '../utils/devUiFlag';
import {
  RESPONSE_OVERLAY_LAYOUT_MODE,
  resolveResponseOverlayLayoutMode,
} from '../utils/overlay/responseOverlayLayoutMode';
import { RESPONSE_OVERLAY_PHASE } from '../utils/overlay/responseOverlayPhaseContract';
import {
  buildCurrentTurnResponseOverlayEntries,
  isResponseCloseable,
  normalizeThinkingText,
  resolveSourceTagForResponse,
  shouldRenderResponseMarkdown,
} from '../utils/state/chatBoxResponseState';
import { logRendererResponseSurfaceTrace } from '../utils/chatStream/chatStreamDebugTrace';

const RESPONSE_FIXED_HEIGHT = 236;
const RESPONSE_BOTTOM_STICK_THRESHOLD = 20;

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

function renderResponseEntry(entry, markdownHtml) {
  if (!entry) {
    return null;
  }

  if (entry.type === 'tool-explanation') {
    return <div className="chatbox-response-text chatbox-response-plain">{entry.text}</div>;
  }

  if (entry.type === 'error') {
    return <div className="chatbox-response-text chatbox-response-plain chatbox-response-error">{entry.text}</div>;
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

  const currentTurnPresentationState = useCurrentTurnPresentationState({
    phase: overlayPhase,
    isSending,
    messages,
    dismissedResponseId: closedResponseId,
  });
  const responseOverlayEntries = useMemo(
    () => buildCurrentTurnResponseOverlayEntries(messages),
    [messages],
  );
  const latestResponseOverlayEntryId = responseOverlayEntries.length > 0
    ? responseOverlayEntries[responseOverlayEntries.length - 1].id
    : null;
  const showResponse = responseOverlayEntries.length > 0 && latestResponseOverlayEntryId !== closedResponseId;
  const showAwaitingReply = !showResponse && currentTurnPresentationState.showChatboxAwaitingReply;
  const latestSourceTaggedResponseEntry = useMemo(() => {
    for (let index = responseOverlayEntries.length - 1; index >= 0; index -= 1) {
      const entry = responseOverlayEntries[index];
      if (entry?.type === 'llm-text' || entry?.type === 'error') {
        return entry;
      }
    }
    return null;
  }, [responseOverlayEntries]);
  const responseEntrySignature = useMemo(
    () => responseOverlayEntries.map((entry) => `${entry.id}:${entry.text}`).join('\u0001'),
    [responseOverlayEntries],
  );

  const responseIsCloseable = useMemo(() => {
    if (!showResponse) {
      return false;
    }
    if (currentTurnPresentationState.isBusy) {
      return false;
    }
    return isResponseCloseable(latestSourceTaggedResponseEntry)
      || responseOverlayEntries.some((entry) => entry.type === 'tool-explanation');
  }, [
    currentTurnPresentationState.isBusy,
    latestSourceTaggedResponseEntry,
    responseOverlayEntries,
    showResponse,
  ]);

  const renderedResponseEntries = useMemo(() => {
    return responseOverlayEntries.map((entry) => {
      if (!shouldRenderResponseMarkdown(entry)) {
        return {
          ...entry,
          markdownHtml: '',
        };
      }
      const contract = resolveLlmOutputContract(entry.text ?? '', {
        provider: entry.modelProvider || null,
        modelId: entry.modelId || null,
        enableMath: true,
        stripAccidentalHtmlTokens: true,
      });
      return {
        ...entry,
        markdownHtml: toSanitizedMarkdownHtml(contract.markdown, { enableMath: contract.mathEnabled }),
      };
    });
  }, [responseOverlayEntries]);

  const thinkingText = useMemo(
    () => normalizeThinkingText(thinkingStatus),
    [thinkingStatus],
  );

  const overlayLayoutMode = useMemo(() => resolveResponseOverlayLayoutMode({
    showResponse,
  }), [showResponse]);
  const isVisible = overlayLayoutMode !== RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN;

  const sourceTagForResponse = useMemo(() => {
    return resolveSourceTagForResponse({
      visibleResponse: latestSourceTaggedResponseEntry,
      showResponse,
      devUiEnabled: isDevUiEnabled(),
    });
  }, [latestSourceTaggedResponseEntry, showResponse]);

  useEffect(() => {
    logRendererResponseSurfaceTrace({
      overlayPhase,
      isSending,
      messageCount: messages.length,
      activeResponseTextLength: typeof latestSourceTaggedResponseEntry?.text === 'string'
        ? latestSourceTaggedResponseEntry.text.length
        : 0,
      activeResponseType: latestSourceTaggedResponseEntry?.type || null,
      visibleResponseId: latestResponseOverlayEntryId,
      responseOverlayEntryCount: responseOverlayEntries.length,
      showAwaitingReply,
      showResponse,
      thinkingTextLength: typeof thinkingText === 'string' ? thinkingText.length : 0,
    });
  }, [
    isSending,
    latestResponseOverlayEntryId,
    latestSourceTaggedResponseEntry?.text,
    latestSourceTaggedResponseEntry?.type,
    messages.length,
    overlayPhase,
    responseOverlayEntries.length,
    showAwaitingReply,
    showResponse,
    thinkingText,
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
    let { width, height } = nextFrame;
    const unchanged = (
      lastFrameRef.current.visible === true
      && lastFrameRef.current.fullScreenGhost === false
      && lastFrameRef.current.compactHover === false
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
      compactHover: false,
      layoutMode,
    };

    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SET_RESPONSEBOX_SIZE, {
        visible: true,
        width,
        height,
        compact_hover: false,
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
  }, [responseEntrySignature, showResponse, syncScrollState]);

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
    responseEntrySignature,
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
    if (!latestResponseOverlayEntryId || !responseIsCloseable) {
      return;
    }
    setClosedResponseId(latestResponseOverlayEntryId);
  }, [latestResponseOverlayEntryId, responseIsCloseable]);

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
      </div>
    </div>
  );
}

export default ChatBoxResponse;
