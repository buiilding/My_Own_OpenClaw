import { act, renderHook } from '@testing-library/react';

import { useSettingsManagement } from '../../frontend/src/renderer/features/settings/hooks/useSettingsManagement';

describe('useSettingsManagement', () => {
  test('handleModelsListed forwards payload to setAvailableModels', () => {
    const setAvailableModels = jest.fn();

    const { result } = renderHook(() => useSettingsManagement(setAvailableModels));

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

  test('returns memoized handlers when dependencies stay the same', () => {
    const setAvailableModels = jest.fn();
    const { result, rerender } = renderHook(() => useSettingsManagement(setAvailableModels));

    const firstHandlers = result.current;
    rerender();

    expect(result.current).toBe(firstHandlers);
    expect(result.current.handleModelsListed).toBe(firstHandlers.handleModelsListed);
  });

  test('rebuilds handler when setAvailableModels changes', () => {
    const firstSetter = jest.fn();
    const secondSetter = jest.fn();
    const { result, rerender } = renderHook(
      ({ setter }) => useSettingsManagement(setter),
      { initialProps: { setter: firstSetter } },
    );

    const firstHandler = result.current.handleModelsListed;
    rerender({ setter: secondSetter });

    expect(result.current.handleModelsListed).not.toBe(firstHandler);
  });
});
