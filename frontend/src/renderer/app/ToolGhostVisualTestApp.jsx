import { useEffect, useMemo, useRef, useState } from 'react';
import { buildToolGhostPreviewFromMessageText } from '../features/chat/utils/toolGhostPreview';
import { buildToolGhostTrackStyle } from '../features/chat/components/chatBoxResponseUtils';
import { TOOL_GHOST_CLICK_SYNC_DELAY_MS } from '../features/chat/constants/toolGhostRuntime';
import '../styles/theme.css';
import '../styles/ChatBoxResponseOverlay.css';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ToolGhostVisualTestApp() {
  const [screenWidth, setScreenWidth] = useState(1920);
  const [screenHeight, setScreenHeight] = useState(1080);
  const [startX, setStartX] = useState(220);
  const [startY, setStartY] = useState(180);
  const [targetX, setTargetX] = useState(1380);
  const [targetY, setTargetY] = useState(760);
  const [explanation, setExplanation] = useState('Clicking target button');
  const [isVisible, setIsVisible] = useState(false);
  const [runToken, setRunToken] = useState(0);
  const hideTimerRef = useRef(null);

  const payloadText = useMemo(() => JSON.stringify({
    name: 'mouse_control',
    arguments: {
      action: 'click',
      x: targetX,
      y: targetY,
      explanation,
    },
    metadata: {
      coordinate_contract: {
        target_display_size: [screenWidth, screenHeight],
        normalized_coordinates: { x: targetX, y: targetY },
      },
    },
  }), [explanation, screenHeight, screenWidth, targetX, targetY]);

  const preview = useMemo(
    () => buildToolGhostPreviewFromMessageText(payloadText),
    [payloadText],
  );

  const startRatio = useMemo(() => ({
    xRatio: clamp(startX / screenWidth, 0, 1),
    yRatio: clamp(startY / screenHeight, 0, 1),
  }), [screenHeight, screenWidth, startX, startY]);

  const effectiveTargetRatio = useMemo(() => ({
    xRatio: clamp(targetX / screenWidth, 0, 1),
    yRatio: clamp(targetY / screenHeight, 0, 1),
  }), [screenHeight, screenWidth, targetX, targetY]);

  const trackStyle = useMemo(
    () => buildToolGhostTrackStyle(preview, startRatio, effectiveTargetRatio),
    [effectiveTargetRatio, preview, startRatio],
  );

  const playAnimation = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setIsVisible(true);
    setRunToken((value) => value + 1);
    hideTimerRef.current = window.setTimeout(() => {
      setIsVisible(false);
      hideTimerRef.current = null;
    }, TOOL_GHOST_CLICK_SYNC_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      padding: 24,
      background: 'radial-gradient(circle at 15% 20%, rgba(47, 88, 132, 0.38), rgba(9, 12, 18, 0.94) 58%)',
      color: '#ecf2ff',
      fontFamily: 'var(--font-sans)',
    }}
    >
      <h1 style={{ marginTop: 0, marginBottom: 12, fontSize: 24 }}>Ghost Mouse Visual Test</h1>
      <p style={{ marginTop: 0, opacity: 0.86 }}>
        Timeline: hold start 1s, move 1.2s, hold target 1s, hide.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 10, maxWidth: 920 }}>
        <label>Screen Width
          <input value={screenWidth} onChange={(e) => setScreenWidth(Number.parseInt(e.target.value || '1', 10) || 1)} />
        </label>
        <label>Screen Height
          <input value={screenHeight} onChange={(e) => setScreenHeight(Number.parseInt(e.target.value || '1', 10) || 1)} />
        </label>
        <label>Explanation
          <input value={explanation} onChange={(e) => setExplanation(e.target.value)} />
        </label>
        <label>Start X
          <input value={startX} onChange={(e) => setStartX(Number.parseInt(e.target.value || '0', 10) || 0)} />
        </label>
        <label>Start Y
          <input value={startY} onChange={(e) => setStartY(Number.parseInt(e.target.value || '0', 10) || 0)} />
        </label>
        <label>Target X
          <input value={targetX} onChange={(e) => setTargetX(Number.parseInt(e.target.value || '0', 10) || 0)} />
        </label>
        <label>Target Y
          <input value={targetY} onChange={(e) => setTargetY(Number.parseInt(e.target.value || '0', 10) || 0)} />
        </label>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
        <button type="button" onClick={playAnimation}>Play Ghost Animation</button>
        <span style={{ alignSelf: 'center', opacity: 0.84 }}>
          Start ({startX}, {startY}) -> Target ({targetX}, {targetY})
        </span>
      </div>

      <div style={{ marginTop: 24 }}>
        {isVisible ? (
          <div className="chatbox-tool-ghost" aria-label="Ghost cursor visual test" key={runToken}>
            <div
              className={`chatbox-tool-ghost-track is-targeted is-click-animating${preview.hasRect ? ' has-rect' : ''}`}
              style={trackStyle || undefined}
            >
              <div className="chatbox-tool-ghost-cursor-wrap" aria-hidden="true">
                {preview.hasRect ? (
                  <div className="chatbox-tool-ghost-target-rect" />
                ) : null}
                <div className="chatbox-tool-ghost-ring" />
                <div className="chatbox-tool-ghost-ripple" />
                <div className="chatbox-tool-ghost-cursor" />
              </div>
              <div className="chatbox-tool-ghost-label">{preview.label}</div>
            </div>
          </div>
        ) : (
          <div style={{ opacity: 0.72 }}>Ghost hidden. Press "Play Ghost Animation".</div>
        )}
      </div>
    </div>
  );
}

export default ToolGhostVisualTestApp;
