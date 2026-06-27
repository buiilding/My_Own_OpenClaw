/**
 * Covers desktop settings event runtime client behavior in the frontend test suite.
 */

import { act, renderHook } from '@testing-library/react';

import {
  DesktopSettingsEventRuntimeClient,
} from '../../src/renderer/app/runtime/desktopSettingsEventRuntimeClient';

describe('desktopSettingsEventRuntimeClient', () => {
  test('routes models-listed settings events to settings handler', () => {
    const handlers = {
      handleModelsListed: jest.fn(),
    };

    DesktopSettingsEventRuntimeClient.routeDesktopSettingsEvent(
      { type: 'models-listed', payload: { local_models: [], online_models: [] } },
      handlers,
    );

    expect(handlers.handleModelsListed).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'models-listed' }),
    );
  });

  test('ignores unsupported settings event types', () => {
    const handlers = {
      handleModelsListed: jest.fn(),
    };

    DesktopSettingsEventRuntimeClient.routeDesktopSettingsEvent({ type: 'status-updated' }, handlers);

    expect(handlers.handleModelsListed).not.toHaveBeenCalled();
  });

  test('handleModelsListed forwards payload to setAvailableModels', () => {
    const setAvailableModels = jest.fn();

    const { result } = renderHook(() => (
      DesktopSettingsEventRuntimeClient.useDesktopSettingsEventHandlers(setAvailableModels)
    ));

    act(() => {
      result.current.handleModelsListed({
        payload: {
          local_models: ['local-a'],
          online_models: ['online-b'],
        },
      });
    });

    expect(setAvailableModels).toHaveBeenCalledWith({
      local_models: ['local-a'],
      online_models: ['online-b'],
    });
  });

  test('handleModelsListed ignores missing or invalid model payloads', () => {
    const setAvailableModels = jest.fn();
    const { result } = renderHook(() => (
      DesktopSettingsEventRuntimeClient.useDesktopSettingsEventHandlers(setAvailableModels)
    ));

    act(() => {
      result.current.handleModelsListed({});
      result.current.handleModelsListed({ payload: undefined });
      result.current.handleModelsListed({ payload: { local_models: ['local-a'] } });
      result.current.handleModelsListed({ payload: { local: ['local-a'], online: null } });
      result.current.handleModelsListed({ payload: 'not-a-model-list' });
    });

    expect(setAvailableModels).not.toHaveBeenCalled();
  });

  test('returns memoized handlers when dependencies stay the same', () => {
    const setAvailableModels = jest.fn();
    const { result, rerender } = renderHook(() => (
      DesktopSettingsEventRuntimeClient.useDesktopSettingsEventHandlers(setAvailableModels)
    ));

    const firstHandlers = result.current;
    rerender();

    expect(result.current).toBe(firstHandlers);
    expect(result.current.handleModelsListed).toBe(firstHandlers.handleModelsListed);
  });

  test('rebuilds handler when setAvailableModels changes', () => {
    const firstSetter = jest.fn();
    const secondSetter = jest.fn();
    const { result, rerender } = renderHook(
      ({ setter }) => DesktopSettingsEventRuntimeClient.useDesktopSettingsEventHandlers(setter),
      { initialProps: { setter: firstSetter } },
    );

    const firstHandler = result.current.handleModelsListed;
    rerender({ setter: secondSetter });

    expect(result.current.handleModelsListed).not.toBe(firstHandler);
  });
});
