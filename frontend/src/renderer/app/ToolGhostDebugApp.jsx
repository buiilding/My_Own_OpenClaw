/**
 * Provides the tool ghost debug app module for the renderer UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getToolGhostClickSyncDelayMs } from './runtime/desktopToolGhostRuntime';
import ToolGhostCursor from '../features/chat/components/ToolGhostCursor';
import '../styles/theme.css';
import '../styles/ChatBoxResponseOverlay.css';

const LOOP_GAP_MS = 700;
const toolGhostClickSyncDelayMs = getToolGhostClickSyncDelayMs();

const TRACK_STYLE = Object.freeze({
  '--ghost-start-left': '50%',
  '--ghost-start-top': '22%',
  '--ghost-end-left': '50%',
  '--ghost-end-top': '76%',
  '--ghost-ripple-left': '50%',
  '--ghost-ripple-top': '76%',
  '--ghost-target-scale': '1',
  '--ghost-motion-duration': `${toolGhostClickSyncDelayMs}ms`,
});

function ToolGhostDebugApp() {
  const [isVisible, setIsVisible] = useState(false);
  const [runToken, setRunToken] = useState(0);
  const hideTimerRef = useRef(null);
  const loopTimerRef = useRef(null);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (loopTimerRef.current) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
  }, []);

  const runAnimationOnce = useCallback(() => {
    clearTimers();
    setRunToken((value) => value + 1);
    setIsVisible(true);
    hideTimerRef.current = window.setTimeout(() => {
      setIsVisible(false);
      hideTimerRef.current = null;
      loopTimerRef.current = window.setTimeout(() => {
        runAnimationOnce();
      }, LOOP_GAP_MS);
    }, toolGhostClickSyncDelayMs);
  }, [clearTimers]);

  useEffect(() => {
    runAnimationOnce();
    return () => {
      clearTimers();
    };
  }, [clearTimers, runAnimationOnce]);

  return isVisible ? (
    <div className="chatbox-tool-ghost" aria-label="Ghost cursor debug animation" key={runToken}>
      <div
        className="chatbox-tool-ghost-track is-targeted is-click-animating is-moving"
        style={TRACK_STYLE}
      >
        <div className="chatbox-tool-ghost-target-ripple is-click-timeline" />
        <ToolGhostCursor label="Clicking Chrome icon" />
      </div>
    </div>
  ) : null;
}

export default ToolGhostDebugApp;
