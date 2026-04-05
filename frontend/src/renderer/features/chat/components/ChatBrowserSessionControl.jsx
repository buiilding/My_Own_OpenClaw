import { Link2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';

const BROWSER_CONTROL_EXPLANATION = 'Manage the dedicated browser session from the chat header.';
const POLL_WHEN_CONNECTED_MS = 2000;
const POLL_WHEN_PICKER_OPEN_MS = 1000;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatBrowserTabLabel(tab) {
  const title = normalizeString(tab?.title);
  if (title) {
    return title;
  }

  const url = normalizeString(tab?.url);
  if (!url || url === 'about:blank') {
    return 'New tab';
  }

  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname;
    return `${parsedUrl.hostname}${path}`;
  } catch (_error) {
    return url;
  }
}

function normalizeTab(tab) {
  const targetId = normalizeString(tab?.target_id || tab?.targetId);
  const url = normalizeString(tab?.url);
  const title = normalizeString(tab?.title);
  return {
    targetId,
    title,
    url,
    label: formatBrowserTabLabel({ title, url }),
  };
}

async function runBrowserAction(action, extras = {}) {
  const result = await IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, {
    toolName: 'browser',
    args: {
      action,
      explanation: BROWSER_CONTROL_EXPLANATION,
      ...extras,
    },
    skipAutoCapture: true,
  });

  if (!result || result.success !== true) {
    throw new Error(
      normalizeString(result?.error) || `Browser action '${action}' failed.`,
    );
  }

  return result?.data && typeof result.data === 'object'
    ? result.data
    : {};
}

function buildDisconnectedState(error = '') {
  return {
    connected: false,
    currentTargetId: '',
    currentTabLabel: '',
    currentTabTitle: '',
    currentTabUrl: '',
    tabs: [],
    error,
  };
}

function ChatBrowserSessionControl() {
  const rootRef = useRef(null);
  const syncRequestIdRef = useRef(0);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [carouselDirection, setCarouselDirection] = useState('right');
  const [browserState, setBrowserState] = useState(() => buildDisconnectedState());

  const syncBrowserSession = useCallback(async () => {
    const requestId = syncRequestIdRef.current + 1;
    syncRequestIdRef.current = requestId;

    try {
      const status = await runBrowserAction('status');
      if (requestId !== syncRequestIdRef.current) {
        return;
      }

      if (status.connected !== true) {
        setBrowserState(buildDisconnectedState());
        return;
      }

      const tabsPayload = await runBrowserAction('get_tabs');
      if (requestId !== syncRequestIdRef.current) {
        return;
      }

      const tabs = Array.isArray(tabsPayload?.tabs)
        ? tabsPayload.tabs
          .map((tab) => normalizeTab(tab))
          .filter((tab) => tab.targetId)
        : [];
      const currentTargetId = normalizeString(status?.target_id || status?.targetId);
      const currentTab = (
        tabs.find((tab) => tab.targetId === currentTargetId)
        || tabs[0]
        || normalizeTab({
          target_id: currentTargetId || 'active-tab',
          title: status?.title,
          url: status?.url,
        })
      );
      const nextTabs = tabs.some((tab) => tab.targetId === currentTab.targetId)
        ? tabs
        : [currentTab, ...tabs];

      setBrowserState({
        connected: true,
        currentTargetId: currentTab.targetId,
        currentTabLabel: currentTab.label,
        currentTabTitle: currentTab.title,
        currentTabUrl: currentTab.url,
        tabs: nextTabs,
        error: '',
      });
    } catch (error) {
      if (requestId !== syncRequestIdRef.current) {
        return;
      }

      const message = normalizeString(error?.message) || 'Failed to sync the browser session.';
      setBrowserState((current) => ({
        ...current,
        error: message,
      }));
    }
  }, []);

  useEffect(() => {
    void syncBrowserSession();
  }, [syncBrowserSession]);

  useEffect(() => {
    const handleWindowFocus = () => {
      void syncBrowserSession();
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [syncBrowserSession]);

  useEffect(() => {
    const pollIntervalMs = pickerOpen
      ? POLL_WHEN_PICKER_OPEN_MS
      : browserState.connected
        ? POLL_WHEN_CONNECTED_MS
        : 0;

    if (!pollIntervalMs) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void syncBrowserSession();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [browserState.connected, pickerOpen, syncBrowserSession]);

  useEffect(() => {
    if (browserState.connected) {
      return;
    }
    setPickerOpen(false);
  }, [browserState.connected]);

  useEffect(() => {
    if (!pickerOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setPickerOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setPickerOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [pickerOpen]);

  const currentTabIndex = useMemo(() => (
    browserState.tabs.findIndex((tab) => tab.targetId === browserState.currentTargetId)
  ), [browserState.currentTargetId, browserState.tabs]);

  const openPicker = useCallback(() => {
    if (!browserState.connected || busyAction) {
      return;
    }
    setPickerOpen((current) => !current);
  }, [browserState.connected, busyAction]);

  const handleConnectBrowser = useCallback(async () => {
    if (busyAction) {
      return;
    }

    setBusyAction('connect');
    try {
      await runBrowserAction('connect');
      await syncBrowserSession();
    } catch (error) {
      setBrowserState((current) => ({
        ...current,
        error: normalizeString(error?.message) || 'Failed to connect the browser.',
      }));
    } finally {
      setBusyAction('');
    }
  }, [busyAction, syncBrowserSession]);

  const handleDisconnectBrowser = useCallback(async () => {
    if (busyAction) {
      return;
    }

    setBusyAction('disconnect');
    try {
      await runBrowserAction('close');
      setBrowserState(buildDisconnectedState());
      setPickerOpen(false);
    } catch (error) {
      setBrowserState((current) => ({
        ...current,
        error: normalizeString(error?.message) || 'Failed to disconnect the browser.',
      }));
    } finally {
      setBusyAction('');
    }
  }, [busyAction]);

  const handleSwitchTab = useCallback(async (targetId, direction) => {
    const nextTargetId = normalizeString(targetId);
    if (!nextTargetId || busyAction || nextTargetId === browserState.currentTargetId) {
      return;
    }

    const nextTab = browserState.tabs.find((tab) => tab.targetId === nextTargetId);
    setCarouselDirection(direction === 'left' ? 'left' : 'right');
    if (nextTab) {
      setBrowserState((current) => ({
        ...current,
        currentTargetId: nextTab.targetId,
        currentTabLabel: nextTab.label,
        currentTabTitle: nextTab.title,
        currentTabUrl: nextTab.url,
        error: '',
      }));
    }

    setBusyAction('switch');
    try {
      await runBrowserAction('switch', { tab_id: nextTargetId });
      await syncBrowserSession();
    } catch (error) {
      setBrowserState((current) => ({
        ...current,
        error: normalizeString(error?.message) || 'Failed to switch browser tabs.',
      }));
      await syncBrowserSession();
    } finally {
      setBusyAction('');
    }
  }, [browserState.currentTargetId, browserState.tabs, busyAction, syncBrowserSession]);

  const handleCarouselMove = useCallback((step) => {
    if (browserState.tabs.length <= 1) {
      return;
    }

    const safeCurrentIndex = currentTabIndex >= 0 ? currentTabIndex : 0;
    const nextIndex = (safeCurrentIndex + step + browserState.tabs.length) % browserState.tabs.length;
    const nextTab = browserState.tabs[nextIndex];
    void handleSwitchTab(nextTab?.targetId, step < 0 ? 'left' : 'right');
  }, [browserState.tabs, currentTabIndex, handleSwitchTab]);

  const buttonTitle = browserState.connected
    ? (browserState.currentTabTitle || browserState.currentTabUrl || browserState.currentTabLabel)
    : 'Connect the dedicated Windie browser';
  const isBusy = Boolean(busyAction);

  return (
    <div className="chat-browser-session-control" ref={rootRef}>
      {browserState.connected ? (
        <>
          <button
            type="button"
            className={`chat-browser-chip chat-browser-button${pickerOpen ? ' is-open' : ''}`}
            title={buttonTitle}
            aria-label={`Current browsertab: ${browserState.currentTabLabel || 'New tab'}`}
            aria-expanded={pickerOpen}
            onClick={openPicker}
            disabled={isBusy}
          >
            <span className="chat-browser-button-text">
              {`Current browsertab: ${browserState.currentTabLabel || 'New tab'}`}
            </span>
          </button>
          {pickerOpen ? (
            <div
              className="chat-browser-picker"
              role="dialog"
              aria-label="Browser tab carousel"
            >
              <div className="chat-browser-carousel">
                <button
                  type="button"
                  className="chat-browser-carousel-arrow"
                  aria-label="Previous browser tab"
                  onClick={() => handleCarouselMove(-1)}
                  disabled={isBusy || browserState.tabs.length <= 1}
                >
                  {'<'}
                </button>
                <div className="chat-browser-carousel-viewport">
                  <div
                    key={`${browserState.currentTargetId || 'tab'}:${carouselDirection}`}
                    className={`chat-browser-carousel-slide is-${carouselDirection}`}
                    title={buttonTitle}
                  >
                    {browserState.currentTabLabel || 'New tab'}
                  </div>
                </div>
                <button
                  type="button"
                  className="chat-browser-carousel-arrow"
                  aria-label="Next browser tab"
                  onClick={() => handleCarouselMove(1)}
                  disabled={isBusy || browserState.tabs.length <= 1}
                >
                  {'>'}
                </button>
              </div>
              <button
                type="button"
                className="chat-browser-disconnect-button"
                aria-label="Disconnect browser"
                onClick={handleDisconnectBrowser}
                disabled={isBusy}
              >
                <span>Disconnect browser</span>
                <Link2 size={16} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          className="chat-browser-chip chat-browser-button is-disconnected"
          aria-label="Connect browser"
          title={browserState.error || 'Connect the dedicated Windie browser'}
          onClick={() => {
            void handleConnectBrowser();
          }}
          disabled={isBusy}
        >
          <span className="chat-browser-button-text">
            {busyAction === 'connect' ? 'Connecting browser…' : 'Connect browser'}
          </span>
        </button>
      )}
    </div>
  );
}

export default ChatBrowserSessionControl;
