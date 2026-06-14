/**
 * Provides the preparation module for the renderer UI.
 */

import type { SurfaceMode, ToolSurfacePreparation } from './types';

export function buildToolSurfacePreparation(
  mode: SurfaceMode,
  correlationId: string,
  options: {
    canExecute: boolean;
    failureReason: string | null;
    surfaceToken: number | null;
    hiddenSurface?: ToolSurfacePreparation['hiddenSurface'];
  },
): ToolSurfacePreparation {
  return {
    canExecute: options.canExecute,
    failureReason: options.failureReason,
    surfaceToken: options.surfaceToken,
    mode,
    correlationId,
    hiddenSurface: options.hiddenSurface ?? 'none',
  };
}
