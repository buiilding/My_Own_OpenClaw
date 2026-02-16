import { useCallback } from 'react';
import { IpcBridge, INVOKE_CHANNELS } from '../infrastructure/ipc/bridge';
import '../styles/WindowChrome.css';

function WindowChrome() {
  const handleMinimize = useCallback(() => {
    IpcBridge.invoke(INVOKE_CHANNELS.WINDOW_MINIMIZE).catch((error) => {
      console.warn('[WindowChrome] Failed to minimize window:', error);
    });
  }, []);

  const handleToggleMaximize = useCallback(() => {
    IpcBridge.invoke(INVOKE_CHANNELS.WINDOW_TOGGLE_MAXIMIZE).catch((error) => {
      console.warn('[WindowChrome] Failed to toggle maximize:', error);
    });
  }, []);

  const handleClose = useCallback(() => {
    IpcBridge.invoke(INVOKE_CHANNELS.WINDOW_CLOSE).catch((error) => {
      console.warn('[WindowChrome] Failed to close window:', error);
    });
  }, []);

  return (
    <header className="window-chrome">
      <div className="window-chrome-title">Desktop Assistant</div>
      <div className="window-chrome-controls">
        <button
          type="button"
          className="window-control-btn"
          onClick={handleMinimize}
          aria-label="Minimize window"
          title="Minimize"
        >
          <span className="window-control-icon">-</span>
        </button>
        <button
          type="button"
          className="window-control-btn"
          onClick={handleToggleMaximize}
          aria-label="Toggle maximize window"
          title="Maximize / Restore"
        >
          <span className="window-control-icon window-control-square">□</span>
        </button>
        <button
          type="button"
          className="window-control-btn window-control-close"
          onClick={handleClose}
          aria-label="Close window"
          title="Close"
        >
          <span className="window-control-icon">×</span>
        </button>
      </div>
    </header>
  );
}

export default WindowChrome;
