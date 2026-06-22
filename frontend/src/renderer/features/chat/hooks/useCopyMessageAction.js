/**
 * Provides the use copy message action module for the renderer UI.
 */

import { useEffect, useRef, useState } from 'react';
import { DesktopClipboardRuntime } from '../../../app/runtime/desktopClipboardRuntime';
import { DesktopMessageActionRuntime } from '../../../app/runtime/desktopMessageActionRuntime';

export function useCopyMessageAction({
  messageText = '',
  warningPrefix = 'MessageActions',
  resetDelayMs = 4000,
}) {
  const [copySuccess, setCopySuccess] = useState(false);
  const copyResetTimerRef = useRef(null);

  const scheduleCopyReset = () => {
    DesktopMessageActionRuntime.scheduleMessageActionTimer({
      timerRef: copyResetTimerRef,
      delayMs: resetDelayMs,
      callback: () => {
        setCopySuccess(false);
      },
    });
  };

  useEffect(() => () => {
    DesktopMessageActionRuntime.clearMessageActionTimer({
      timerRef: copyResetTimerRef,
    });
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
