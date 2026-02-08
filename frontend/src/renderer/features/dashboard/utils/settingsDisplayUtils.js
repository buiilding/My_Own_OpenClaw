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

export function buildSpeechModeConfigUpdate(_config, enabled) {
  return {
    speech_mode_enabled: enabled,
  };
}

export function buildVoiceModeConfigUpdate(_config, enabled) {
  return {
    voice_mode_enabled: enabled,
  };
}
