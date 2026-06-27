/**
 * Covers desktop settings-update error classification in the frontend test suite.
 */

import { DesktopSettingsUpdateErrorRuntime } from '../../src/renderer/app/runtime/desktopSettingsUpdateErrorRuntime';

describe('desktopSettingsUpdateErrorRuntime', () => {
  const {
    isSettingsUpdateErrorPayload,
    isSettingsUpdateErrorText,
  } = DesktopSettingsUpdateErrorRuntime;

  test('matches settings-update failure text from runtime events', () => {
    expect(isSettingsUpdateErrorText('Failed to update settings: write failed')).toBe(true);
    expect(isSettingsUpdateErrorText('Database timeout')).toBe(false);
    expect(isSettingsUpdateErrorText(null)).toBe(false);
  });

  test('classifies message or content payload fields', () => {
    expect(isSettingsUpdateErrorPayload({
      message: 'Failed to update settings: timeout',
    })).toBe(true);
    expect(isSettingsUpdateErrorPayload({
      content: 'Failed to update settings: timeout',
    })).toBe(true);
    expect(isSettingsUpdateErrorPayload({
      message: 'Different failure',
      content: 'Still different',
    })).toBe(false);
    expect(isSettingsUpdateErrorPayload(undefined)).toBe(false);
  });
});
