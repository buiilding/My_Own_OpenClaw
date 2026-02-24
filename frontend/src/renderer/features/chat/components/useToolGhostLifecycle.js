import { useEffect, useState } from 'react';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { TOOL_GHOST_CLICK_SYNC_DELAY_MS } from '../constants/toolGhostRuntime';

function clampRatio(value) {
  return Math.min(1, Math.max(0, value));
}

function parseMousePosition(rawValue) {
  if (typeof rawValue !== 'string') {
    return null;
  }
  const match = rawValue.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }
  const x = Number.parseFloat(match[1]);
  const y = Number.parseFloat(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

export function useToolGhostLifecycle({
  shouldShowToolGhostBase,
  toolGhostPreview,
  activeToolCallId,
}) {
  const [toolGhostStartRatio, setToolGhostStartRatio] = useState({ xRatio: 0.5, yRatio: 0.5 });
  const [toolGhostReady, setToolGhostReady] = useState(true);
  const [toolGhostHidden, setToolGhostHidden] = useState(false);

  useEffect(() => {
    if (!shouldShowToolGhostBase || !toolGhostPreview.isMouseClick) {
      setToolGhostHidden(false);
      setToolGhostReady(true);
      setToolGhostStartRatio({ xRatio: 0.5, yRatio: 0.5 });
      return undefined;
    }

    let cancelled = false;
    let hideTimer = null;
    setToolGhostHidden(false);
    setToolGhostReady(false);
    setToolGhostStartRatio({ xRatio: 0.5, yRatio: 0.5 });

    const targetDisplayWidth = toolGhostPreview.targetDisplayWidth;
    const targetDisplayHeight = toolGhostPreview.targetDisplayHeight;
    const canMapCurrentMouse = Number.isFinite(targetDisplayWidth)
      && Number.isFinite(targetDisplayHeight)
      && targetDisplayWidth > 0
      && targetDisplayHeight > 0;

    const beginGhostLifecycle = (nextStartRatio) => {
      if (cancelled) {
        return;
      }
      setToolGhostStartRatio(nextStartRatio);
      setToolGhostReady(true);
      hideTimer = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        setToolGhostHidden(true);
      }, TOOL_GHOST_CLICK_SYNC_DELAY_MS);
    };

    if (!canMapCurrentMouse) {
      beginGhostLifecycle({ xRatio: 0.5, yRatio: 0.5 });
    } else {
      void IpcBridge.invoke(INVOKE_CHANNELS.GET_SYSTEM_STATE, {
        fields: ['mouse_position'],
      }).then((systemState) => {
        const parsedMouse = parseMousePosition(systemState?.mouse_position);
        if (!parsedMouse) {
          beginGhostLifecycle({ xRatio: 0.5, yRatio: 0.5 });
          return;
        }
        beginGhostLifecycle({
          xRatio: clampRatio(parsedMouse.x / targetDisplayWidth),
          yRatio: clampRatio(parsedMouse.y / targetDisplayHeight),
        });
      }).catch(() => {
        beginGhostLifecycle({ xRatio: 0.5, yRatio: 0.5 });
      });
    }

    return () => {
      cancelled = true;
      if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
      }
    };
  }, [
    shouldShowToolGhostBase,
    toolGhostPreview.isMouseClick,
    toolGhostPreview.targetDisplayWidth,
    toolGhostPreview.targetDisplayHeight,
    activeToolCallId,
  ]);

  return {
    toolGhostStartRatio,
    toolGhostReady,
    toolGhostHidden,
  };
}
