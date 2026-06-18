/**
 * Covers desktop settings event runtime client behavior in the frontend test suite.
 */

import { act, renderHook } from '@testing-library/react';

import { useDesktopSettingsEventHandlers } from '../../frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient';

describe('useDesktopSettingsEventHandlers', () => {
  test('handleModelsListed forwards payload to setAvailableModels', () => {
    const setAvailableModels = jest.fn();

    const { result } = renderHook(() => useDesktopSettingsEventHandlers(setAvailableModels));

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
    const { result } = renderHook(() => useDesktopSettingsEventHandlers(setAvailableModels));

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
    const { result, rerender } = renderHook(() => useDesktopSettingsEventHandlers(setAvailableModels));

    const firstHandlers = result.current;
    rerender();

    expect(result.current).toBe(firstHandlers);
    expect(result.current.handleModelsListed).toBe(firstHandlers.handleModelsListed);
  });

  test('rebuilds handler when setAvailableModels changes', () => {
    const firstSetter = jest.fn();
    const secondSetter = jest.fn();
    const { result, rerender } = renderHook(
      ({ setter }) => useDesktopSettingsEventHandlers(setter),
      { initialProps: { setter: firstSetter } },
    );

    const firstHandler = result.current.handleModelsListed;
    rerender({ setter: secondSetter });

    expect(result.current.handleModelsListed).not.toBe(firstHandler);
  });
});
