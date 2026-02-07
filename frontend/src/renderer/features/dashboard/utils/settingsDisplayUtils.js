export function toDisplayOptions(displays) {
  return displays.map((display) => ({
    value: String(display.id),
    label: display.label || `Display ${display.id}`,
  }));
}

export function findDisplayById(displays, displayId) {
  return displays.find((display) => String(display.id) === displayId) || null;
}

export function resolveDisplaySelection(displays, selectedDisplayId) {
  if (!Array.isArray(displays) || displays.length === 0) {
    return { nextSelectedDisplayId: selectedDisplayId, selectedDisplay: null };
  }

  const selected = findDisplayById(displays, selectedDisplayId);
  if (selected) {
    return { nextSelectedDisplayId: selectedDisplayId, selectedDisplay: selected };
  }

  const fallbackDisplay = displays.find((display) => display.isPrimary) || displays[0];
  return {
    nextSelectedDisplayId: String(fallbackDisplay.id),
    selectedDisplay: fallbackDisplay,
  };
}

export function buildSpeechModeConfigUpdate(config, enabled) {
  return {
    model_mode: config?.model_mode || 'online',
    selected_model_id: config?.selected_model_id || '',
    model_provider: config?.model_provider || '',
    speech_mode_enabled: enabled,
    interaction_mode: config?.interaction_mode || 'chat',
  };
}
