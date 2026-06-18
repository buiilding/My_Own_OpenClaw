/**
 * Coordinates renderer shortcut policy for app and feature clients.
 */

import {
  getAgentStopShortcutLabel,
  getGlobalAgentStopShortcutLabel,
  getGlobalAgentStopShortcutOptions,
  isAgentStopShortcutEvent,
  normalizeGlobalAgentStopShortcutAccelerator,
} from '../../infrastructure/shortcuts/agentStopShortcut';

export const DesktopShortcutRuntimeClient = {
  getAgentStopShortcutLabel,

  getGlobalAgentStopShortcutLabel,

  getGlobalAgentStopShortcutOptions,

  normalizeGlobalAgentStopShortcutAccelerator,

  isAgentStopShortcutEvent,
};
