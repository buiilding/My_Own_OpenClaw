/**
 * Classifies settings-update failures for renderer runtime consumers.
 */

const SETTINGS_UPDATE_ERROR_TEXT = 'Failed to update settings';

export type SettingsUpdateErrorPayload = {
  content?: unknown;
  message?: unknown;
};

export function isSettingsUpdateErrorText(value: unknown): boolean {
  return typeof value === 'string' && value.includes(SETTINGS_UPDATE_ERROR_TEXT);
}

export function isSettingsUpdateErrorPayload(
  payload: SettingsUpdateErrorPayload | null | undefined,
): boolean {
  return (
    isSettingsUpdateErrorText(payload?.message)
    || isSettingsUpdateErrorText(payload?.content)
  );
}
