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

export type DesktopGlobalStopShortcutStatusPresentation = {
  showFallbackNotice: boolean;
  fallbackLabel: string;
  showRegistrationFailure: boolean;
};

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function getGlobalAgentStopShortcutStatusPresentation(
  status: unknown,
): DesktopGlobalStopShortcutStatusPresentation {
  const source = recordOrEmpty(status);
  const requestedAccelerator = optionalText(source.requestedAccelerator);
  const resolvedAccelerator = optionalText(source.resolvedAccelerator);
  const showFallbackNotice = (
    source.usingFallback === true
    && requestedAccelerator !== null
    && resolvedAccelerator !== null
    && resolvedAccelerator !== requestedAccelerator
  );

  return {
    showFallbackNotice,
    fallbackLabel: showFallbackNotice
      ? getGlobalAgentStopShortcutLabel(resolvedAccelerator)
      : '',
    showRegistrationFailure: source.registrationFailed === true,
  };
}

export const DesktopShortcutRuntimeClient = {
  getAgentStopShortcutLabel,

  getGlobalAgentStopShortcutLabel,

  getGlobalAgentStopShortcutOptions,

  getGlobalAgentStopShortcutStatusPresentation,

  normalizeGlobalAgentStopShortcutAccelerator,

  isAgentStopShortcutEvent,
};
