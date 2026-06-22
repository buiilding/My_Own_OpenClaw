/**
 * Provides the tool ghost debug app module for the renderer UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DesktopToolGhostRuntime } from './runtime/desktopToolGhostRuntime';
import ToolGhostCursor from '../features/chat/components/ToolGhostCursor';
import '../styles/theme.css';
import '../styles/ChatBoxResponseOverlay.css';

const LOOP_GAP_MS = 700;
const {
  clearToolGhostTimer,
  getToolGhostClickSyncDelayMs,
  scheduleToolGhostTimer,
} = DesktopToolGhostRuntime;
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
    clearToolGhostTimer({ timerRef: hideTimerRef });
    clearToolGhostTimer({ timerRef: loopTimerRef });
  }, []);

  const runAnimationOnce = useCallback(() => {
    clearTimers();
    setRunToken((value) => value + 1);
    setIsVisible(true);
    scheduleToolGhostTimer({
      timerRef: hideTimerRef,
      delayMs: toolGhostClickSyncDelayMs,
      callback: () => {
        setIsVisible(false);
        scheduleToolGhostTimer({
          timerRef: loopTimerRef,
          delayMs: LOOP_GAP_MS,
          callback: () => {
            runAnimationOnce();
          },
        });
      },
    });
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
