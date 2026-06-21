/**
 * Exposes active renderer skin config through the generic chat desktop UI facade.
 */

import { DEFAULT_MODEL_SELECTION } from './modelSelectionDefaults';
import {
  DEFAULT_PROVIDER_API_KEYS,
  PROVIDER_API_KEY_SPECS,
} from './providerCredentialSettings';
import {
  DEFAULT_PROVIDER_MODEL_DISPLAY,
  PROVIDER_LABEL_OVERRIDES,
  PROVIDER_MODEL_DISPLAY_FALLBACKS,
} from './providerModelDisplaySettings';
import { DEFAULT_APPEARANCE_THEME } from './appearanceSettings';
import { RENDERER_STORAGE_KEYS } from './storageSettings';

function formatProviderDisplayLabel(providerValue) {
  const provider = String(providerValue || '').trim();
  if (!provider) {
    return provider;
  }
  const lowerProvider = provider.toLowerCase();
  const override = PROVIDER_LABEL_OVERRIDES[lowerProvider];
  if (override) {
    return override;
  }
  return provider
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('-');
}

function resolveProviderModelDisplay(provider) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const fallback = PROVIDER_MODEL_DISPLAY_FALLBACKS.find((entry) => (
    entry.patterns.some((pattern) => normalizedProvider.includes(pattern))
  ));
  return fallback || DEFAULT_PROVIDER_MODEL_DISPLAY;
}

export const DesktopRuntimeConfig = Object.freeze({
  DEFAULT_MODEL_SELECTION,
  DEFAULT_PROVIDER_API_KEYS,
  PROVIDER_API_KEY_SPECS,
  formatProviderDisplayLabel,
  resolveProviderModelDisplay,
  DEFAULT_APPEARANCE_THEME,
  RENDERER_STORAGE_KEYS,
});
