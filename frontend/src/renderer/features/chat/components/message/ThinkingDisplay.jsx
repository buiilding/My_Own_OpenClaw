/**
 * Provides the thinking display module for the renderer UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { isDevUiEnabled } from '../../../../app/runtime/desktopDevUiRuntime';
import { SDK_CONVERSATION_EVENT_SOURCE_CHANNEL } from '../../../../app/runtime/desktopPresentationSourceChannels';
import { resolveSourceTag } from '../../utils/message/sourceTags';
import '../../../../styles/ThinkingDisplay.css';

const THINKING_BOTTOM_STICK_THRESHOLD = 12;

function ThinkingDisplay({ status, sourceEventType = null }) {
  const [hasOverflowAbove, setHasOverflowAbove] = useState(false);
  const containerRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const normalizedStatus = useMemo(
    () => (typeof status === 'string' ? status.trim() : ''),
    [status],
  );

  const syncScrollState = useCallback(() => {
    const containerEl = containerRef.current;
    if (!containerEl) {
      setHasOverflowAbove(false);
      shouldStickToBottomRef.current = true;
      return;
    }

    setHasOverflowAbove(containerEl.scrollTop > 2);
    const distanceFromBottom = (
      containerEl.scrollHeight - containerEl.clientHeight - containerEl.scrollTop
    );
    shouldStickToBottomRef.current = distanceFromBottom <= THINKING_BOTTOM_STICK_THRESHOLD;
  }, []);

  const handleScroll = useCallback(() => {
    syncScrollState();
  }, [syncScrollState]);

  useEffect(() => {
    if (!normalizedStatus) {
      setHasOverflowAbove(false);
      shouldStickToBottomRef.current = true;
      return;
    }

    const containerEl = containerRef.current;
    if (!containerEl) {
      return;
    }

    if (shouldStickToBottomRef.current) {
      containerEl.scrollTop = containerEl.scrollHeight;
    }
    syncScrollState();
  }, [normalizedStatus, syncScrollState]);

  if (!normalizedStatus) {
    return null;
  }

  const sourceTag = isDevUiEnabled()
    ? resolveSourceTag(sourceEventType || 'llm-thought', SDK_CONVERSATION_EVENT_SOURCE_CHANNEL)
    : null;

  return (
    <div
      className={`thinking-display-stream${hasOverflowAbove ? ' has-overflow-above' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Assistant reasoning stream"
      ref={containerRef}
      onScroll={handleScroll}
    >
      {sourceTag ? (
        <div className="thinking-source-badge" title={`source_event=${sourceEventType || 'llm-thought'}`}>
          {sourceTag}
        </div>
      ) : null}
      <pre className="thinking-display-text">{normalizedStatus}</pre>
    </div>
  );
}

ThinkingDisplay.propTypes = {
  status: PropTypes.string,
  sourceEventType: PropTypes.string,
};

export default ThinkingDisplay;
