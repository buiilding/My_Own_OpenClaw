export type SurfaceMode = 'none' | 'interactive' | 'screenshot';

export type SurfacePhase =
  | 'idle'
  | 'preparing_interactive_focus'
  | 'interactive_ready'
  | 'preparing_capture_visibility'
  | 'capture_ready'
  | 'restoring_surface'
  | 'failed_terminal';

export type SurfaceTransitionSource = 'tool-runner' | 'system-capture';

export type ToolSurfacePreparation = {
  restoreChatPillAfterExecution: boolean;
  canExecute: boolean;
  failureReason: string | null;
  surfaceToken: number | null;
  overlayIgnoreEnabled: boolean;
  mode: SurfaceMode;
  correlationId: string;
};

export type CaptureVisibilityPreparation = {
  prepared: boolean;
  captureId: string;
};

export const DEFAULT_TOOL_FOCUS_PREPARE_WAIT_MS = 180;
export const DEFAULT_TOOL_FOCUS_PREPARE_MAX_ATTEMPTS = 5;
export const DEFAULT_CAPTURE_FOCUS_PREPARE_WAIT_MS = 120;
export const OVERLAY_SURFACE_PREPARE_EXCEPTION = 'overlay_surface_prepare_exception';
