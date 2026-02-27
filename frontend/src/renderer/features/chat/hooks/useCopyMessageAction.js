import { useEffect, useRef, useState } from 'react';

export function useCopyMessageAction({
  messageText = '',
  warningPrefix = 'MessageActions',
  resetDelayMs = 4000,
}) {
  const [copySuccess, setCopySuccess] = useState(false);
  const copyResetTimerRef = useRef(null);

  const scheduleCopyReset = () => {
    if (copyResetTimerRef.current) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopySuccess(false);
      copyResetTimerRef.current = null;
    }, resetDelayMs);
  };

  useEffect(() => () => {
    if (copyResetTimerRef.current) {
      window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
  }, []);

  const handleCopy = async () => {
    if (!messageText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(messageText);
      setCopySuccess(true);
      scheduleCopyReset();
    } catch (error) {
      console.warn(`[${warningPrefix}] Failed to copy message:`, error);
    }
  };

  return {
    copySuccess,
    handleCopy,
  };
}
