/**
 * Covers app config events. behavior in the frontend test suite.
 */

import {
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

});
