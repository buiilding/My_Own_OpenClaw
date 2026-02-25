import { useEffect, useRef, useState } from 'react';
import { TOOL_GHOST_CLICK_SYNC_DELAY_MS } from '../features/chat/constants/toolGhostRuntime';
import '../styles/theme.css';
import '../styles/ChatBoxResponseOverlay.css';

const LOOP_GAP_MS = 700;

const TRACK_STYLE = Object.freeze({
  '--ghost-start-left': '50%',
  '--ghost-start-top': '22%',
  '--ghost-end-left': '50%',
  '--ghost-end-top': '76%',
  '--ghost-ripple-left': '50%',
  '--ghost-ripple-top': '76%',
  '--ghost-target-scale': '1',
  '--ghost-motion-duration': `${TOOL_GHOST_CLICK_SYNC_DELAY_MS}ms`,
});

function ToolGhostDebugApp() {
  const [isVisible, setIsVisible] = useState(false);
  const [runToken, setRunToken] = useState(0);
  const hideTimerRef = useRef(null);
  const loopTimerRef = useRef(null);

  const clearTimers = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (loopTimerRef.current) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
  };

  const runAnimationOnce = () => {
    clearTimers();
    setRunToken((value) => value + 1);
    setIsVisible(true);
    hideTimerRef.current = window.setTimeout(() => {
      setIsVisible(false);
      hideTimerRef.current = null;
      loopTimerRef.current = window.setTimeout(() => {
        runAnimationOnce();
      }, LOOP_GAP_MS);
    }, TOOL_GHOST_CLICK_SYNC_DELAY_MS);
  };

  useEffect(() => {
    runAnimationOnce();
    return () => {
      clearTimers();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return isVisible ? (
    <div className="chatbox-tool-ghost" aria-label="Ghost cursor debug animation" key={runToken}>
      <div
        className="chatbox-tool-ghost-track is-targeted is-click-animating is-moving"
        style={TRACK_STYLE}
      >
        <div className="chatbox-tool-ghost-target-ripple is-click-timeline" />
        <div className="chatbox-tool-ghost-cursor-wrap" aria-hidden="true">
          <div className="chatbox-tool-ghost-ring" />
          <div className="chatbox-tool-ghost-cursor">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4.2 3.6 9.4 18.4 12.2 12.8l5.8 2.8 1.2-2.5-5.8-2.8 5.3-2.7z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        <div className="chatbox-tool-ghost-label">Ghost cursor debug animation</div>
      </div>
    </div>
  ) : null;
}

export default ToolGhostDebugApp;
