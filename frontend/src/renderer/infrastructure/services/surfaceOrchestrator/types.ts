export type SurfaceMode = 'none' | 'interactive' | 'screenshot';

export const SURFACE_PHASE = Object.freeze({
  IDLE: 'idle',
  PREPARING_INTERACTIVE_FOCUS: 'preparing_interactive_focus',
  INTERACTIVE_READY: 'interactive_ready',
  PREPARING_CAPTURE_VISIBILITY: 'preparing_capture_visibility',
  CAPTURE_READY: 'capture_ready',
  RESTORING_SURFACE: 'restoring_surface',
  FAILED_TERMINAL: 'failed_terminal',
});

export type SurfacePhase = (typeof SURFACE_PHASE)[keyof typeof SURFACE_PHASE];

export type SurfaceTransitionSource = 'sdk-tool-runtime' | 'system-capture';
export type HiddenSurface =
  | 'none'
  | 'chatbox'
  | 'chatbox-response'
  | 'response'
  | 'main-window';

export type ToolSurfacePreparation = {
  canExecute: boolean;
  failureReason: string | null;
  surfaceToken: number | null;
  mode: SurfaceMode;
  correlationId: string;
  hiddenSurface?: HiddenSurface;
};

export type SurfaceCollapseTiming = {
  waitTime: number;
  hideInvokeTime: number;
  settleTime: number;
};

export type SurfaceCollapseResult = {
  collapsed: boolean;
  hiddenSurface: HiddenSurface;
  timing: SurfaceCollapseTiming;
};

export type SurfaceRestoreResult = {
  restored: boolean;
  restoredSurface: HiddenSurface;
  restoreInvokeTime: number;
};

export type CaptureVisibilityPreparation = {
  prepared: boolean;
  captureId: string;
  restoreSurfaceAfterCapture?: boolean;
  hiddenSurface?: HiddenSurface;
  timing?: SurfaceCollapseTiming;
};

export const OVERLAY_SURFACE_PREPARE_EXCEPTION = 'overlay_surface_prepare_exception';
