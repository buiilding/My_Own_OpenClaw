/**
 * Provides the chat browser session control module for the renderer UI.
 */

import { Link2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { desktopRuntimeSkin } from '../../../app/skin/desktopRuntimeSkin';
import { useBrowserSessionControl } from '../../../infrastructure/hooks/useBrowserSessionControl';

function ChatBrowserSessionControl() {
  const rootRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const {
    localRuntimeReady,
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
    if (!localRuntimeReady || !connected || busyAction) {
      return;
    }
    setPickerOpen((current) => !current);
  }, [busyAction, connected, localRuntimeReady]);

  const handleConnectBrowser = useCallback(() => {
    if (busyAction || !localRuntimeReady) {
      return;
    }
    void connectBrowser();
  }, [busyAction, connectBrowser, localRuntimeReady]);

  const handleDisconnectBrowser = useCallback(() => {
    if (busyAction || !localRuntimeReady) {
      return;
    }
    void disconnectBrowser();
    setPickerOpen(false);
  }, [busyAction, disconnectBrowser, localRuntimeReady]);

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
    : (error || desktopRuntimeSkin.chat.browserSession.connectTitle);
  const controlsDisabled = Boolean(busyAction) || !localRuntimeReady;
  const copy = desktopRuntimeSkin.chat.browserSession;
  const tabLabel = currentTabLabel || copy.tabFallbackLabel;
  const tabControlLabel = `${copy.connectedLabelPrefix} ${tabLabel}`;
  const disconnectedButtonLabel = !localRuntimeReady && error
    ? copy.unavailableLabel
    : copy.connectLabel;
  const disconnectedButtonText = localRuntimeReady
    ? (busyAction === 'connect' ? copy.connectingLabel : copy.connectLabel)
    : (error ? copy.unavailableLabel : copy.startingRuntimeLabel);

  return (
    <div className="chat-browser-session-control" ref={rootRef}>
      {connected ? (
        <>
          <button
            type="button"
            className={`chat-browser-chip chat-browser-button${pickerOpen ? ' is-open' : ''}`}
            title={buttonTitle}
            aria-label={tabControlLabel}
            aria-expanded={pickerOpen}
            onClick={openPicker}
            disabled={controlsDisabled}
          >
            <span className="chat-browser-button-text">
              {tabControlLabel}
            </span>
          </button>
          {pickerOpen ? (
            <div
              className="chat-browser-picker"
              role="dialog"
              aria-label={copy.carouselLabel}
            >
              <div className="chat-browser-carousel">
                <button
                  type="button"
                  className="chat-browser-carousel-arrow"
                  aria-label={copy.previousTabLabel}
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
                    {tabLabel}
                  </div>
                </div>
                <button
                  type="button"
                  className="chat-browser-carousel-arrow"
                  aria-label={copy.nextTabLabel}
                  onClick={() => handleCarouselMove(1)}
                  disabled={controlsDisabled || tabs.length <= 1}
                >
                  {'>'}
                </button>
              </div>
              <button
                type="button"
                className="chat-browser-disconnect-button"
                aria-label={copy.disconnectLabel}
                onClick={handleDisconnectBrowser}
                disabled={controlsDisabled}
              >
                <span>{copy.disconnectLabel}</span>
                <Link2 size={16} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          className="chat-browser-chip chat-browser-button is-disconnected"
          aria-label={disconnectedButtonLabel}
          title={buttonTitle}
          onClick={handleConnectBrowser}
          disabled={controlsDisabled}
        >
          <span className="chat-browser-button-text">
            {disconnectedButtonText}
          </span>
        </button>
      )}
    </div>
  );
}

export default ChatBrowserSessionControl;
