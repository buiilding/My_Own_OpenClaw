import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../stores/chatStore';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { toSanitizedMarkdownHtml } from '../../../infrastructure/markdown';
import { selectChatBoxState } from '../utils/chatSelectors';
import { getRoundedFrameSize } from '../utils/overlayFrameSize';
import { subscribeResponseOverlayPhase } from '../utils/overlayPhaseListener';

const RESPONSE_TYPES = new Set(['tool-call', 'llm-text', 'error']);
const FIRST_CHUNK_TYPES = new Set(['llm-text', 'tool-call', 'error']);

function renderResponseContent(response, markdownHtml) {
  if (!response) {
    return null;
  }

  if (response.type === 'tool-call') {
    return <pre className="chatbox-response-text chatbox-response-pre">{response.text}</pre>;
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

function findLastUserIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].sender === 'user') {
      return i;
    }
  }
  return -1;
}

function findLatestMessageAfterUser(messages, lastUserIndex, allowedTypes) {
  if (lastUserIndex < 0) {
    return null;
  }
  for (let i = messages.length - 1; i > lastUserIndex; i -= 1) {
    const message = messages[i];
    if (message.sender !== 'assistant') {
      continue;
    }
    if (!message.text) {
      continue;
    }
    if (!allowedTypes.has(message.type)) {
      continue;
    }
    return message;
  }
  return null;
}

function ChatBoxResponse() {
  const { messages } = useChatStore(useShallow(selectChatBoxState));
  const [closedResponseId, setClosedResponseId] = useState(null);
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
  const [overlayPhase, setOverlayPhase] = useState('idle');
  const shellRef = useRef(null);
  const lastUserMessageIdRef = useRef(null);
  const lastFrameRef = useRef({ width: 0, height: 0, visible: null });

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

  const showAwaitingReply = (
    awaitingFirstChunk || overlayPhase === 'awaiting-first-chunk'
  ) && !showResponse;
  const isVisible = showResponse || showAwaitingReply;
  const responseMarkdownHtml = useMemo(() => {
    if (!activeResponse || activeResponse.type === 'tool-call' || activeResponse.type === 'error') {
      return '';
    }
    return toSanitizedMarkdownHtml(activeResponse.text ?? '');
  }, [activeResponse]);

  const reportOverlaySize = useCallback(async (visible) => {
    if (!visible) {
      if (lastFrameRef.current.visible === false) {
        return;
      }
      lastFrameRef.current = { width: 0, height: 0, visible: false };
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
    const { width, height } = nextFrame;
    const unchanged = (
      lastFrameRef.current.visible === true
      && lastFrameRef.current.width === width
      && lastFrameRef.current.height === height
    );
    if (unchanged) {
      return;
    }
    lastFrameRef.current = { width, height, visible: true };

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
  }, [lastUserMessageId]);

  useEffect(() => {
    if (!awaitingFirstChunk || !firstTextOrError) {
      return;
    }
    setAwaitingFirstChunk(false);
  }, [awaitingFirstChunk, firstTextOrError]);

  useEffect(() => {
    let observer = null;

    if (!isVisible) {
      void reportOverlaySize(false);
      return () => {};
    }

    const updateSize = () => {
      void reportOverlaySize(true);
    };

    if (typeof ResizeObserver !== 'undefined' && shellRef.current) {
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
  }, [isVisible, reportOverlaySize]);

  useEffect(() => {
    return () => {
      void reportOverlaySize(false);
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
    <div className="chatbox-shell-wrap">
      <div className="chatbox-shell" ref={shellRef}>
        {showResponse ? (
          <div className="chatbox-response-pill">
            <button
              type="button"
              className="chatbox-response-close"
              onClick={handleCloseResponse}
              disabled={!responseIsCloseable}
              aria-label={responseIsCloseable ? 'Close response' : 'Response still streaming'}
            >
              ×
            </button>
            {renderResponseContent(activeResponse, responseMarkdownHtml)}
          </div>
        ) : null}

        {showAwaitingReply ? (
          <div className="chatbox-typing-indicator" aria-label="Assistant is awaiting reply">
            <span />
            <span />
            <span />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ChatBoxResponse;
