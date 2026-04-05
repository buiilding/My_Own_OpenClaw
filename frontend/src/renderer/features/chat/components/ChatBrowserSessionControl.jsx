import { Link2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBrowserSessionControl } from '../../../infrastructure/hooks/useBrowserSessionControl';

function ChatBrowserSessionControl() {
  const rootRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const {
    localBackendReady,
    connected,
    currentTargetId,
    currentTabLabel,
    currentTabTitle,
    currentTabUrl,
    tabs,
    busyAction,
    error,
    connectBrowser,
    disconnectBrowser,
    switchBrowserTab,
  } = useBrowserSessionControl({ interactivePolling: pickerOpen });

  useEffect(() => {
    if (connected) {
      return;
    }
    setPickerOpen(false);
  }, [connected]);

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
    tabs.findIndex((tab) => tab.targetId === currentTargetId)
  ), [currentTargetId, tabs]);

  const openPicker = useCallback(() => {
    if (!localBackendReady || !connected || busyAction) {
      return;
    }
    setPickerOpen((current) => !current);
  }, [busyAction, connected, localBackendReady]);

  const handleConnectBrowser = useCallback(() => {
    if (busyAction || !localBackendReady) {
      return;
    }
    void connectBrowser();
  }, [busyAction, connectBrowser, localBackendReady]);

  const handleDisconnectBrowser = useCallback(() => {
    if (busyAction || !localBackendReady) {
      return;
    }
    void disconnectBrowser();
    setPickerOpen(false);
  }, [busyAction, disconnectBrowser, localBackendReady]);

  const handleCarouselMove = useCallback((step) => {
    if (tabs.length <= 1) {
      return;
    }

    const safeCurrentIndex = currentTabIndex >= 0 ? currentTabIndex : 0;
    const nextIndex = (safeCurrentIndex + step + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    void switchBrowserTab(nextTab?.targetId);
  }, [currentTabIndex, switchBrowserTab, tabs]);

  const buttonTitle = connected
    ? (currentTabTitle || currentTabUrl || currentTabLabel)
    : 'Connect the dedicated Windie browser';
  const controlsDisabled = Boolean(busyAction) || !localBackendReady;

  return (
    <div className="chat-browser-session-control" ref={rootRef}>
      {connected ? (
        <>
          <button
            type="button"
            className={`chat-browser-chip chat-browser-button${pickerOpen ? ' is-open' : ''}`}
            title={buttonTitle}
            aria-label={`Browser Tab: ${currentTabLabel || 'New tab'}`}
            aria-expanded={pickerOpen}
            onClick={openPicker}
            disabled={controlsDisabled}
          >
            <span className="chat-browser-button-text">
              {`Browser Tab: ${currentTabLabel || 'New tab'}`}
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
                  disabled={controlsDisabled || tabs.length <= 1}
                >
                  {'<'}
                </button>
                <div className="chat-browser-carousel-viewport">
                  <div
                    className="chat-browser-carousel-slide"
                    title={buttonTitle}
                  >
                    {currentTabLabel || 'New tab'}
                  </div>
                </div>
                <button
                  type="button"
                  className="chat-browser-carousel-arrow"
                  aria-label="Next browser tab"
                  onClick={() => handleCarouselMove(1)}
                  disabled={controlsDisabled || tabs.length <= 1}
                >
                  {'>'}
                </button>
              </div>
              <button
                type="button"
                className="chat-browser-disconnect-button"
                aria-label="Disconnect browser"
                onClick={handleDisconnectBrowser}
                disabled={controlsDisabled}
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
          title={error || 'Connect the dedicated Windie browser'}
          onClick={handleConnectBrowser}
          disabled={controlsDisabled}
        >
          <span className="chat-browser-button-text">
            {localBackendReady
              ? (busyAction === 'connect' ? 'Connecting browser…' : 'Connect browser')
              : 'Starting browser…'}
          </span>
        </button>
      )}
    </div>
  );
}

export default ChatBrowserSessionControl;
