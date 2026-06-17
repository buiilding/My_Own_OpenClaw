/**
 * Covers app config events. behavior in the frontend test suite.
 */

import {
  extractTranscriptUserId,
  routeConfigSettingsEvent,
} from '../../frontend/src/renderer/app/providers/appConfigEvents';

describe('appConfigEvents', () => {
  test('routes models-listed settings events to settings handler', () => {
    const handleModelsListed = jest.fn();
    const handlersRef = { current: { handleModelsListed } };

    routeConfigSettingsEvent({ type: 'models-listed', payload: { local_models: [] } }, handlersRef);
    expect(handleModelsListed).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'models-listed' }),
    );
  });

  test('ignores unsupported settings event types', () => {
    const handleModelsListed = jest.fn();
    const handlersRef = { current: { handleModelsListed } };

    routeConfigSettingsEvent({ type: 'status-updated' }, handlersRef);
    expect(handleModelsListed).not.toHaveBeenCalled();
  });

  test('extracts transcript user id only from non-empty string payloads', () => {
    expect(extractTranscriptUserId({ userId: 'user-1' })).toBe('user-1');
    expect(extractTranscriptUserId({ userId: '' })).toBeNull();
    expect(extractTranscriptUserId({ userId: 123 })).toBeNull();
    expect(extractTranscriptUserId(null)).toBeNull();
  });

  test('returns raw user id string including whitespace', () => {
    expect(extractTranscriptUserId({ userId: '   user-2   ' })).toBe('   user-2   ');
  });
});
