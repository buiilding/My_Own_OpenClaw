import { useEffect, useMemo, useRef, useState } from 'react';
import { TOOL_GHOST_CLICK_SYNC_DELAY_MS } from '../features/chat/constants/toolGhostRuntime';
import '../styles/theme.css';
import '../styles/ChatBoxResponseOverlay.css';

const START_HOLD_MS = 1000;
const MOVE_MS = 1200;
const END_HOLD_MS = 1000;
const LOOP_GAP_MS = 700;

const GHOST_LABEL = 'mouse_control.explanation: Move ghost top to bottom';
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
  const [isLooping, setIsLooping] = useState(true);
  const hideTimerRef = useRef(null);
  const loopTimerRef = useRef(null);

  const timelineLabel = useMemo(() => (
    `${START_HOLD_MS}ms hold -> ${MOVE_MS}ms move -> ${END_HOLD_MS}ms hold`
  ), []);

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
      if (isLooping) {
        loopTimerRef.current = window.setTimeout(() => {
          runAnimationOnce();
        }, LOOP_GAP_MS);
      }
    }, TOOL_GHOST_CLICK_SYNC_DELAY_MS);
  };

  useEffect(() => {
    runAnimationOnce();
    return () => {
      clearTimers();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLooping]);

  return (
    <div style={{
      minHeight: '100vh',
      margin: 0,
      padding: 24,
      color: '#eaf2ff',
      background: 'radial-gradient(circle at 20% 0%, #1d2d4f 0%, #0a0f1a 54%, #06080f 100%)',
      fontFamily: 'var(--font-sans)',
    }}
    >
      <h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 24 }}>Ghost Cursor Debug</h1>
      <p style={{ marginTop: 0, opacity: 0.84, maxWidth: 800 }}>
        Visual harness only. No real mouse move. No click. Hard-coded top-to-bottom ghost motion.
      </p>
      <p style={{ marginTop: 0, opacity: 0.72, maxWidth: 800 }}>
        Timeline: {timelineLabel}
      </p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <button type="button" onClick={runAnimationOnce}>Replay</button>
        <button type="button" onClick={() => setIsLooping((value) => !value)}>
          Loop: {isLooping ? 'on' : 'off'}
        </button>
      </div>
      <div style={{
        position: 'relative',
        width: 300,
        height: 620,
        border: '1px solid rgba(151, 196, 255, 0.4)',
        borderRadius: 16,
        background: 'linear-gradient(180deg, rgba(90, 162, 255, 0.14), rgba(90, 162, 255, 0.04))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
      >
        <div style={{
          position: 'absolute',
          left: '50%',
          top: 38,
          transform: 'translateX(-50%)',
          fontSize: 11,
          letterSpacing: 1.1,
          opacity: 0.64,
          textTransform: 'uppercase',
        }}
        >
          Top
        </div>
        <div style={{
          position: 'absolute',
          left: '50%',
          bottom: 38,
          transform: 'translateX(-50%)',
          fontSize: 11,
          letterSpacing: 1.1,
          opacity: 0.64,
          textTransform: 'uppercase',
        }}
        >
          Bottom
        </div>
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
              <div className="chatbox-tool-ghost-label">{GHOST_LABEL}</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ToolGhostDebugApp;
