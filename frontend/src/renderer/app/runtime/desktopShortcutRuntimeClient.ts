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

function getGlobalAgentStopShortcutStatusPresentation(
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

function resolveGlobalAgentStopShortcutFallbackAccelerator(
  status: unknown,
): string | null {
  const source = recordOrEmpty(status);
  const resolvedAccelerator = optionalText(source.resolvedAccelerator);
  if (
    source.registrationFailed === true
    || source.usingFallback !== true
    || resolvedAccelerator === null
  ) {
    return null;
  }
  const trimmedAccelerator = resolvedAccelerator.trim();
  return trimmedAccelerator || null;
}

function areGlobalAgentStopShortcutStatusesEqual(
  currentStatus: unknown,
  nextStatus: unknown,
): boolean {
  const current = recordOrEmpty(currentStatus);
  const next = recordOrEmpty(nextStatus);
  return (
    current.requestedAccelerator === next.requestedAccelerator
    && current.resolvedAccelerator === next.resolvedAccelerator
    && current.usingFallback === next.usingFallback
    && current.registrationFailed === next.registrationFailed
  );
}

export const DesktopShortcutRuntimeClient = {
  getAgentStopShortcutLabel,

  getGlobalAgentStopShortcutLabel,

  getGlobalAgentStopShortcutOptions,

  getGlobalAgentStopShortcutStatusPresentation,

  resolveGlobalAgentStopShortcutFallbackAccelerator,

  areGlobalAgentStopShortcutStatusesEqual,

  normalizeGlobalAgentStopShortcutAccelerator,

  isAgentStopShortcutEvent,
};
