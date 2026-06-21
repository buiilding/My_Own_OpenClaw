/**
 * Provides the chat browser session control module for the renderer UI.
 */

import { Link2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DesktopRuntimeSkin } from '../../../app/skin/desktopRuntimeSkin';
import { DesktopBrowserSessionRuntimeClient } from '../../../app/runtime/desktopBrowserSessionRuntimeClient';

function ChatBrowserSessionControl() {
  const rootRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const copy = DesktopRuntimeSkin.desktopRuntimeSkin.chat.browserSession;
  const {
    connected,
    connectBrowser,
    disconnectBrowser,
    presentation,
    switchBrowserTabByStep,
  } = DesktopBrowserSessionRuntimeClient.useDesktopBrowserSessionControl({
    copy,
    interactivePolling: pickerOpen,
  });

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

  const openPicker = useCallback(() => {
    if (!presentation.canOpenPicker) {
      return;
    }
    setPickerOpen((current) => !current);
  }, [presentation.canOpenPicker]);

  const handleConnectBrowser = useCallback(() => {
    if (presentation.controlsDisabled) {
      return;
    }
    void connectBrowser();
  }, [connectBrowser, presentation.controlsDisabled]);

  const handleDisconnectBrowser = useCallback(() => {
    if (presentation.controlsDisabled) {
      return;
    }
    void disconnectBrowser();
    setPickerOpen(false);
  }, [disconnectBrowser, presentation.controlsDisabled]);

  const handleCarouselMove = useCallback((step) => {
    void switchBrowserTabByStep(step);
  }, [switchBrowserTabByStep]);

  return (
    <div className="chat-browser-session-control" ref={rootRef}>
      {connected ? (
        <>
          <button
            type="button"
            className={`chat-browser-chip chat-browser-button${pickerOpen ? ' is-open' : ''}`}
            title={presentation.buttonTitle}
            aria-label={presentation.tabControlLabel}
            aria-expanded={pickerOpen}
            onClick={openPicker}
            disabled={presentation.controlsDisabled}
          >
            <span className="chat-browser-button-text">
              {presentation.tabControlLabel}
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
                  disabled={presentation.controlsDisabled || !presentation.hasMultipleTabs}
                >
                  {'<'}
                </button>
                <div className="chat-browser-carousel-viewport">
                  <div
                    className="chat-browser-carousel-slide"
                    title={presentation.buttonTitle}
                  >
                    {presentation.tabLabel}
                  </div>
                </div>
                <button
                  type="button"
                  className="chat-browser-carousel-arrow"
                  aria-label={copy.nextTabLabel}
                  onClick={() => handleCarouselMove(1)}
                  disabled={presentation.controlsDisabled || !presentation.hasMultipleTabs}
                >
                  {'>'}
                </button>
              </div>
              <button
                type="button"
                className="chat-browser-disconnect-button"
                aria-label={copy.disconnectLabel}
                onClick={handleDisconnectBrowser}
                disabled={presentation.controlsDisabled}
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
          aria-label={presentation.disconnectedButtonLabel}
          title={presentation.buttonTitle}
          onClick={handleConnectBrowser}
          disabled={presentation.controlsDisabled}
        >
          <span className="chat-browser-button-text">
            {presentation.disconnectedButtonText}
          </span>
        </button>
      )}
    </div>
  );
}

export default ChatBrowserSessionControl;
