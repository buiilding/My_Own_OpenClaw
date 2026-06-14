/**
 * Exposes the package entrypoint for the renderer UI.
 */

import linuxRuntime from './linux';
import macosRuntime from './macos';
import windowsRuntime from './windows';
import type {
  SurfaceCollapseResult,
  SurfaceRestoreResult,
  HiddenSurface,
} from '../../types';

type SurfaceVisibilityRuntime = typeof linuxRuntime;

function resolveSurfaceVisibilityRuntime(): SurfaceVisibilityRuntime {
  if (typeof navigator === 'undefined') {
    return windowsRuntime;
  }
  const userAgent = typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
  if (/windows/i.test(userAgent)) {
    return windowsRuntime;
  }
  if (/macintosh|mac os x|macintel/i.test(userAgent)) {
    return macosRuntime;
  }
  if (/linux/i.test(userAgent)) {
    return linuxRuntime;
  }
  return windowsRuntime;
}

export function shouldManageSurfaceVisibilityForBackgroundCapture(): boolean {
  return resolveSurfaceVisibilityRuntime().shouldManageSurfaceVisibilityForBackgroundCapture();
}

export async function suppressSurfaceForBackgroundCapture(
  options: { waitMs?: number } = {},
): Promise<SurfaceCollapseResult> {
  return await resolveSurfaceVisibilityRuntime().suppressSurfaceForBackgroundCapture(options);
}

export async function restoreSurfaceAfterBackgroundCapture(
  hiddenSurface: HiddenSurface = 'chatbox',
): Promise<SurfaceRestoreResult> {
  return await resolveSurfaceVisibilityRuntime().restoreSurfaceAfterBackgroundCapture(hiddenSurface);
}
