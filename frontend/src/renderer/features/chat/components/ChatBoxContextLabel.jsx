import { useEffect, useRef, useState } from 'react';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { resolveActiveWindowContext } from '../utils/activeWindowContext';

const ACTIVE_WINDOW_POLL_INTERVAL_MS = 5000;
const CONTEXT_STATUS = Object.freeze({
  FRESH: 'fresh',
  OFFLINE: 'offline',
});

function setStatusIfChanged(setStatus, nextStatus) {
  setStatus((previousStatus) => (previousStatus === nextStatus ? previousStatus : nextStatus));
}

function buildContextAriaLabel(context, status) {
  if (status === CONTEXT_STATUS.FRESH) {
    return `Active app: ${context.label}`;
  }
  return `Active app: ${context.label} (${status})`;
}

function ChatBoxContextLabel() {
  const [activeWindowContext, setActiveWindowContext] = useState(
    () => resolveActiveWindowContext(null),
  );
  const [activeWindowStatus, setActiveWindowStatus] = useState(CONTEXT_STATUS.FRESH);
  const [isResponseOverlayVisible, setIsResponseOverlayVisible] = useState(false);
  const hasSuccessfulContextRef = useRef(false);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.RESPONSE_OVERLAY_VISIBILITY, (payload) => {
      const visible = payload?.visible === true;
      setIsResponseOverlayVisible((previous) => (previous === visible ? previous : visible));
    });
    return () => {
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;

    const refreshActiveWindow = async () => {
      try {
        const state = await IpcBridge.invoke(INVOKE_CHANNELS.GET_SYSTEM_STATE, {
          fields: ['active_window'],
        });
        if (cancelled) {
          return;
        }
        hasSuccessfulContextRef.current = true;
        setActiveWindowContext(resolveActiveWindowContext(state?.active_window));
        setStatusIfChanged(setActiveWindowStatus, CONTEXT_STATUS.FRESH);
      } catch (_error) {
        if (!cancelled) {
          setActiveWindowContext(resolveActiveWindowContext(null));
          setStatusIfChanged(
            setActiveWindowStatus,
            hasSuccessfulContextRef.current ? CONTEXT_STATUS.FRESH : CONTEXT_STATUS.OFFLINE,
          );
        }
      }
    };

    void refreshActiveWindow();
    intervalId = window.setInterval(() => {
      void refreshActiveWindow();
    }, ACTIVE_WINDOW_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  if (isResponseOverlayVisible) {
    return null;
  }

  return (
    <div
      className={`chatbox-floating-context is-${activeWindowStatus}`}
      aria-label={buildContextAriaLabel(activeWindowContext, activeWindowStatus)}
      title={activeWindowContext.fullLabel}
    >
      {activeWindowContext.label}
    </div>
  );
}

export default ChatBoxContextLabel;
