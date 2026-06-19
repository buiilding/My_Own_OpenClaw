/**
 * Covers desktop settings-update error classification in the frontend test suite.
 */

import {
  isSettingsUpdateErrorPayload,
  isSettingsUpdateErrorText,
} from '../../frontend/src/renderer/app/runtime/desktopSettingsUpdateErrorRuntime';

describe('desktopSettingsUpdateErrorRuntime', () => {
  test('matches backend settings-update failure text', () => {
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
