/**
 * Exposes renderer startup mode state through the desktop app runtime boundary.
 */

import { isVmModeEnabled } from '../../infrastructure/runtime/vmMode';

export const DesktopStartupRuntimeClient = {
  isVmModeEnabled,
};
