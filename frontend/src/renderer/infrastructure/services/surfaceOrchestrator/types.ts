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

export type SurfaceTransitionSource = 'tool-runner' | 'system-capture';

export type ToolSurfacePreparation = {
  canExecute: boolean;
  failureReason: string | null;
  surfaceToken: number | null;
  mode: SurfaceMode;
  correlationId: string;
};

export type ChatPillCollapseTiming = {
  waitTime: number;
  hideInvokeTime: number;
  settleTime: number;
};

export type ChatPillCollapseResult = {
  collapsed: boolean;
  timing: ChatPillCollapseTiming;
};

export type ChatPillRestoreResult = {
  restored: boolean;
  restoreInvokeTime: number;
};

export type CaptureVisibilityPreparation = {
  prepared: boolean;
  captureId: string;
  restoreChatPillAfterCapture?: boolean;
  timing?: ChatPillCollapseTiming;
};

export const OVERLAY_SURFACE_PREPARE_EXCEPTION = 'overlay_surface_prepare_exception';
