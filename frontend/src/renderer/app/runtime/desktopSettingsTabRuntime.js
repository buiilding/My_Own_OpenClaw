/**
 * Owns renderer settings tab descriptors for the app runtime.
 */

const SETTINGS_TAB_DESCRIPTORS = Object.freeze([
  Object.freeze({ id: 'general', iconKey: 'settings', label: 'General' }),
  Object.freeze({ id: 'appearance', iconKey: 'palette', label: 'Appearance' }),
  Object.freeze({ id: 'agent', iconKey: 'bot', label: 'Agent' }),
  Object.freeze({ id: 'workspace', iconKey: 'folderOpen', label: 'Workspace' }),
  Object.freeze({ id: 'browser', iconKey: 'globe', label: 'Browser' }),
  Object.freeze({ id: 'memory', iconKey: 'database', label: 'Memory' }),
  Object.freeze({ id: 'onboarding', iconKey: 'sparkles', label: 'Onboarding' }),
]);

function cloneDescriptor(descriptor) {
  return { ...descriptor };
}

function getSettingsTabDescriptors() {
  return SETTINGS_TAB_DESCRIPTORS.map(cloneDescriptor);
}

function getSettingsTabIds() {
  return SETTINGS_TAB_DESCRIPTORS.map((descriptor) => descriptor.id);
}

function resolveSettingsTabLabel(tabId, fallback = 'Settings') {
  return SETTINGS_TAB_DESCRIPTORS.find((descriptor) => descriptor.id === tabId)?.label || fallback;
}

export {
  getSettingsTabDescriptors,
  getSettingsTabIds,
  resolveSettingsTabLabel,
};
