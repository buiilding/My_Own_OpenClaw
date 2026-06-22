/**
 * Provides the use response overlay scroll state module for the renderer UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const RESPONSE_BOTTOM_STICK_THRESHOLD = 20;

export function useResponseOverlayScrollState({
  responseVisible,
  responseEntrySignature,
}) {
  const [hasOverflowAbove, setHasOverflowAbove] = useState(false);
  const responsePillRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);

  const syncScrollState = useCallback(() => {
    const responseElement = responsePillRef.current;
    if (!responseElement) {
      setHasOverflowAbove(false);
      shouldStickToBottomRef.current = true;
      return;
    }

    setHasOverflowAbove(responseElement.scrollTop > 2);
    const distanceFromBottom = (
      responseElement.scrollHeight
      - responseElement.clientHeight
      - responseElement.scrollTop
    );
    shouldStickToBottomRef.current = distanceFromBottom <= RESPONSE_BOTTOM_STICK_THRESHOLD;
  }, []);

  const handleResponseScroll = useCallback(() => {
    syncScrollState();
  }, [syncScrollState]);

  useEffect(() => {
    if (!responseVisible) {
      setHasOverflowAbove(false);
      shouldStickToBottomRef.current = true;
    }
  }, [responseVisible]);

  useEffect(() => {
    if (!responseVisible) {
      return;
    }
    const responseElement = responsePillRef.current;
    if (!responseElement) {
      return;
    }

    if (shouldStickToBottomRef.current) {
      responseElement.scrollTop = responseElement.scrollHeight;
    }
    syncScrollState();
  }, [responseEntrySignature, responseVisible, syncScrollState]);

  return {
    hasOverflowAbove,
    responsePillRef,
    handleResponseScroll,
  };
}
