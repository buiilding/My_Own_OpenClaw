/**
 * Classifies settings-update failures for renderer app-runtime consumers.
 */

const SETTINGS_UPDATE_ERROR_TEXT = 'Failed to update settings';

export type SettingsUpdateErrorPayload = {
  content?: unknown;
  message?: unknown;
};

function isSettingsUpdateErrorText(value: unknown): boolean {
  return typeof value === 'string' && value.includes(SETTINGS_UPDATE_ERROR_TEXT);
}

function isSettingsUpdateErrorPayload(
  payload: SettingsUpdateErrorPayload | null | undefined,
): boolean {
  return (
    isSettingsUpdateErrorText(payload?.message)
    || isSettingsUpdateErrorText(payload?.content)
  );
}

export const DesktopSettingsUpdateErrorRuntime = Object.freeze({
  isSettingsUpdateErrorText,
  isSettingsUpdateErrorPayload,
});
