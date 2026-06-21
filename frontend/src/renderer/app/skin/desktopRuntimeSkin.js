/**
 * Exposes the active renderer skin through the generic chat desktop UI facade.
 */

import {
  formatToolAcceptanceRuntimeSummary,
  windieDesktopSkin,
} from './windieDesktopSkin';

export const desktopRuntimeSkin = windieDesktopSkin;

export const DesktopRuntimeSkin = Object.freeze({
  desktopRuntimeSkin,
  formatToolAcceptanceRuntimeSummary,
});
