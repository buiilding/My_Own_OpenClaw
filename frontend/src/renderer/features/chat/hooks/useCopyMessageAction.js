/**
 * Provides the use copy message action module for the renderer UI.
 */

import { useEffect, useRef, useState } from 'react';
import { DesktopClipboardRuntime } from '../../../app/runtime/desktopClipboardRuntime';

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
      const didCopy = await DesktopClipboardRuntime.writeText(messageText);
      if (didCopy) {
        setCopySuccess(true);
        scheduleCopyReset();
      }
    } catch (error) {
      console.warn(`[${warningPrefix}] Failed to copy message:`, error);
    }
  };

  return {
    copySuccess,
    handleCopy,
  };
}
