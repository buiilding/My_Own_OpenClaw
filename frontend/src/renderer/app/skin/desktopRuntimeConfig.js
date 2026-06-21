/**
 * Exposes active renderer skin config through the generic chat desktop UI facade.
 */

import { DEFAULT_MODEL_SELECTION } from './modelSelectionDefaults';
import {
  DEFAULT_PROVIDER_API_KEYS,
  PROVIDER_API_KEY_SPECS,
} from './providerCredentialSettings';
import {
  formatProviderDisplayLabel,
  resolveProviderModelDisplay,
} from './providerModelDisplaySettings';
import { DEFAULT_APPEARANCE_THEME } from './appearanceSettings';
import { RENDERER_STORAGE_KEYS } from './storageSettings';

export const DesktopRuntimeConfig = Object.freeze({
  DEFAULT_MODEL_SELECTION,
  DEFAULT_PROVIDER_API_KEYS,
  PROVIDER_API_KEY_SPECS,
  formatProviderDisplayLabel,
  resolveProviderModelDisplay,
  DEFAULT_APPEARANCE_THEME,
  RENDERER_STORAGE_KEYS,
});
