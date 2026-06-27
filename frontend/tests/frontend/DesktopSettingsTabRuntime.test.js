/**
 * Covers renderer settings tab runtime behavior.
 */

import { DesktopSettingsTabRuntime } from '../../src/renderer/app/runtime/desktopSettingsTabRuntime.js';

const {
  getSettingsTabDescriptors,
  getSettingsTabIds,
  resolveSettingsTabLabel,
} = DesktopSettingsTabRuntime;

describe('desktopSettingsTabRuntime', () => {
  test('exposes ordered settings tab descriptors for settings rendering', () => {
    expect(getSettingsTabDescriptors()).toEqual([
      { id: 'general', iconKey: 'settings', label: 'General' },
      { id: 'appearance', iconKey: 'palette', label: 'Appearance' },
      { id: 'agent', iconKey: 'bot', label: 'Agent' },
      { id: 'workspace', iconKey: 'folderOpen', label: 'Workspace' },
      { id: 'browser', iconKey: 'globe', label: 'Browser' },
      { id: 'memory', iconKey: 'database', label: 'Memory' },
      { id: 'onboarding', iconKey: 'sparkles', label: 'Onboarding' },
    ]);
    expect(getSettingsTabIds()).toEqual([
      'general',
      'appearance',
      'agent',
      'workspace',
      'browser',
      'memory',
      'onboarding',
    ]);
  });

  test('resolves known tab labels and unknown-tab fallback labels', () => {
    expect(resolveSettingsTabLabel('appearance')).toBe('Appearance');
    expect(resolveSettingsTabLabel('data-controls')).toBe('Settings');
    expect(resolveSettingsTabLabel('unknown', 'Fallback')).toBe('Fallback');
  });
});
