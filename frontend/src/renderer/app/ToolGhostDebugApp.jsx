import { useEffect, useRef, useState } from 'react';
import { TOOL_GHOST_CLICK_SYNC_DELAY_MS } from '../features/chat/constants/toolGhostRuntime';
import '../styles/theme.css';
import '../styles/ChatBoxResponseOverlay.css';

const LOOP_GAP_MS = 700;

const TRACK_STYLE = Object.freeze({
  '--ghost-start-offset-x': '0px',
  '--ghost-start-offset-y': '-240px',
  '--ghost-end-offset-x': '0px',
  '--ghost-end-offset-y': '240px',
  '--ghost-offset-x': '0px',
  '--ghost-offset-y': '240px',
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

  return (
    <div style={{
      minHeight: '100vh',
      margin: 0,
      background: 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
    }}
    >
      {isVisible ? (
        <div className="chatbox-tool-ghost" aria-label="Ghost cursor debug animation" key={runToken}>
          <div
            className="chatbox-tool-ghost-track is-targeted is-click-animating"
            style={TRACK_STYLE}
          >
            <div className="chatbox-tool-ghost-cursor-wrap" aria-hidden="true">
              <div className="chatbox-tool-ghost-ring" />
              <div className="chatbox-tool-ghost-ripple" />
              <div className="chatbox-tool-ghost-cursor" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ToolGhostDebugApp;
