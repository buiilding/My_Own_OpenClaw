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

function parseScreenResolution(rawValue) {
  if (typeof rawValue !== 'string') {
    return null;
  }
  const match = rawValue.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) {
    return null;
  }
  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function useToolGhostLifecycle({
  shouldShowToolGhostBase,
  toolGhostPreview,
  activeToolCallId,
}) {
  const [toolGhostStartRatio, setToolGhostStartRatio] = useState({ xRatio: 0.5, yRatio: 0.5 });
  const [toolGhostResolvedTargetRatio, setToolGhostResolvedTargetRatio] = useState(null);
  const [toolGhostReady, setToolGhostReady] = useState(true);
  const [toolGhostHidden, setToolGhostHidden] = useState(false);

  useEffect(() => {
    if (!shouldShowToolGhostBase || !toolGhostPreview.isMouseClick) {
      setToolGhostHidden(false);
      setToolGhostReady(true);
      setToolGhostStartRatio({ xRatio: 0.5, yRatio: 0.5 });
      setToolGhostResolvedTargetRatio(null);
      return undefined;
    }

    let cancelled = false;
    let hideTimer = null;
    setToolGhostHidden(false);
    setToolGhostReady(false);
    setToolGhostStartRatio({ xRatio: 0.5, yRatio: 0.5 });
    setToolGhostResolvedTargetRatio(null);

    const beginGhostLifecycle = (nextStartRatio, nextTargetRatio) => {
      if (cancelled) {
        return;
      }
      setToolGhostStartRatio(nextStartRatio);
      setToolGhostResolvedTargetRatio(nextTargetRatio);
      setToolGhostReady(true);
      hideTimer = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        setToolGhostHidden(true);
      }, TOOL_GHOST_CLICK_SYNC_DELAY_MS);
    };

    void IpcBridge.invoke(INVOKE_CHANNELS.GET_SYSTEM_STATE, {
      fields: ['mouse_position', 'screen_resolution'],
    }).then((systemState) => {
      const parsedScreen = parseScreenResolution(systemState?.screen_resolution);
      const targetDisplayWidth = (
        Number.isFinite(toolGhostPreview.targetDisplayWidth)
        && toolGhostPreview.targetDisplayWidth > 0
      )
        ? toolGhostPreview.targetDisplayWidth
        : parsedScreen?.width ?? null;
      const targetDisplayHeight = (
        Number.isFinite(toolGhostPreview.targetDisplayHeight)
        && toolGhostPreview.targetDisplayHeight > 0
      )
        ? toolGhostPreview.targetDisplayHeight
        : parsedScreen?.height ?? null;

      const parsedMouse = parseMousePosition(systemState?.mouse_position);
      const startRatio = (
        parsedMouse
        && targetDisplayWidth
        && targetDisplayHeight
      )
        ? {
          xRatio: clampRatio(parsedMouse.x / targetDisplayWidth),
          yRatio: clampRatio(parsedMouse.y / targetDisplayHeight),
        }
        : { xRatio: 0.5, yRatio: 0.5 };

      let targetRatio = null;
      if (toolGhostPreview.hasTarget) {
        targetRatio = {
          xRatio: toolGhostPreview.xRatio,
          yRatio: toolGhostPreview.yRatio,
        };
      } else if (
        Number.isFinite(toolGhostPreview.rawTargetX)
        && Number.isFinite(toolGhostPreview.rawTargetY)
        && targetDisplayWidth
        && targetDisplayHeight
      ) {
        targetRatio = {
          xRatio: clampRatio(toolGhostPreview.rawTargetX / targetDisplayWidth),
          yRatio: clampRatio(toolGhostPreview.rawTargetY / targetDisplayHeight),
        };
      }

      beginGhostLifecycle(startRatio, targetRatio);
    }).catch(() => {
      const fallbackTargetRatio = toolGhostPreview.hasTarget
        ? { xRatio: toolGhostPreview.xRatio, yRatio: toolGhostPreview.yRatio }
        : null;
      beginGhostLifecycle({ xRatio: 0.5, yRatio: 0.5 }, fallbackTargetRatio);
    });

    return () => {
      cancelled = true;
      if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
      }
    };
  }, [
    shouldShowToolGhostBase,
    toolGhostPreview.isMouseClick,
    toolGhostPreview.hasTarget,
    toolGhostPreview.xRatio,
    toolGhostPreview.yRatio,
    toolGhostPreview.targetDisplayWidth,
    toolGhostPreview.targetDisplayHeight,
    toolGhostPreview.rawTargetX,
    toolGhostPreview.rawTargetY,
    activeToolCallId,
  ]);

  return {
    toolGhostStartRatio,
    toolGhostResolvedTargetRatio,
    toolGhostReady,
    toolGhostHidden,
  };
}
