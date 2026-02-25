import { useEffect, useState } from 'react';

export function useAutoResizedResponseHeight({
  activeResponseId,
  bodyRef,
  enabled,
  minHeight,
  maxHeight,
  chromeHeight,
}) {
  const [responseHeight, setResponseHeight] = useState(minHeight);

  useEffect(() => {
    if (!enabled) {
      setResponseHeight(minHeight);
      return;
    }

    const bodyEl = bodyRef.current;
    if (!bodyEl) {
      return;
    }

    let animationFrameId = null;
    let resizeObserver = null;

    const recalcHeight = () => {
      const measuredHeight = bodyEl.scrollHeight + chromeHeight;
      const nextHeight = Math.max(
        minHeight,
        Math.min(maxHeight, measuredHeight),
      );
      setResponseHeight((prevHeight) => (prevHeight === nextHeight ? prevHeight : nextHeight));
    };

    const scheduleRecalc = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        recalcHeight();
      });
    };

    scheduleRecalc();

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleRecalc);
      resizeObserver.observe(bodyEl);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [activeResponseId, bodyRef, chromeHeight, enabled, maxHeight, minHeight]);

  return responseHeight;
}
