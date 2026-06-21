/**
 * Exposes the active renderer skin through the generic chat desktop UI facade.
 */

import { windieDesktopSkin } from './windieDesktopSkin';

export const desktopRuntimeSkin = windieDesktopSkin;

function formatToolAcceptanceRuntimeSummary(acceptedTool) {
  const config = desktopRuntimeSkin.settings.agent.toolAcceptance;
  const argumentResolution = acceptedTool?.argument_resolution || config.argumentResolutionFallback;
  const executionTarget = acceptedTool?.execution_target || '';
  const executionTargetLabel = config.executionTargetLabels[executionTarget] || 'runtime';
  return `${argumentResolution} / ${executionTargetLabel}`;
}

export const DesktopRuntimeSkin = Object.freeze({
  desktopRuntimeSkin,
  formatToolAcceptanceRuntimeSummary,
});
