import type { SurfaceMode, ToolSurfacePreparation } from './types';

export function buildToolSurfacePreparation(
  mode: SurfaceMode,
  correlationId: string,
  options: {
    restoreChatPillAfterExecution: boolean;
    canExecute: boolean;
    failureReason: string | null;
    surfaceToken: number | null;
    overlayIgnoreEnabled: boolean;
  },
): ToolSurfacePreparation {
  return {
    restoreChatPillAfterExecution: options.restoreChatPillAfterExecution,
    canExecute: options.canExecute,
    failureReason: options.failureReason,
    surfaceToken: options.surfaceToken,
    overlayIgnoreEnabled: options.overlayIgnoreEnabled,
    mode,
    correlationId,
  };
}
