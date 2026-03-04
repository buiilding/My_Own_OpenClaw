import { render } from '@testing-library/react';

let mockConfigContext: {
  config: Record<string, any>;
  updateConfig: jest.Mock;
  registerSaveStatusCallback: jest.Mock;
};
let mockStatusContext: {
  setSaving: jest.Mock;
};

jest.mock('../../frontend/src/renderer/app/providers/AppConfigProvider', () => ({
  AppConfigProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../frontend/src/renderer/app/providers/AppStatusProvider', () => ({
  AppStatusProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../frontend/src/renderer/app/providers/AppConfigContext', () => ({
  useAppConfigContext: () => mockConfigContext,
}));

jest.mock('../../frontend/src/renderer/app/providers/AppStatusContext', () => ({
  useAppStatusContext: () => mockStatusContext,
}));

import { AppProvider } from '../../frontend/src/renderer/app/providers/AppProvider';

describe('AppProvider', () => {
  const renderProvider = (child: React.ReactNode = <div>child</div>) => render(
    <AppProvider>
      {child}
    </AppProvider>,
  );

  const createTabKeydown = (shiftKey: boolean) => new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    cancelable: true,
    bubbles: true,
  });

  beforeEach(() => {
    mockConfigContext = {
      config: { interaction_mode: 'chat' },
      updateConfig: jest.fn(),
      registerSaveStatusCallback: jest.fn(),
    };
    mockStatusContext = {
      setSaving: jest.fn(),
    };
  });

  test('registers save-status callback with status provider', () => {
    renderProvider();

    expect(mockConfigContext.registerSaveStatusCallback).toHaveBeenCalledWith(
      mockStatusContext.setSaving,
    );
  });

  test('shift+tab toggles interaction mode', () => {
    const { rerender } = renderProvider();

    const event = createTabKeydown(true);
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(mockConfigContext.updateConfig).toHaveBeenCalledWith({
      interaction_mode: 'agent',
    });

    mockConfigContext = {
      ...mockConfigContext,
      config: { interaction_mode: 'agent' },
    };

    rerender(
      <AppProvider>
        <div>child</div>
      </AppProvider>,
    );

    const secondEvent = createTabKeydown(true);
    window.dispatchEvent(secondEvent);

    expect(mockConfigContext.updateConfig).toHaveBeenLastCalledWith({
      interaction_mode: 'chat',
    });
  });

  test('does not rebind keydown listener on rerender', () => {
    const addListenerSpy = jest.spyOn(window, 'addEventListener');
    const removeListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { rerender, unmount } = renderProvider();

    mockConfigContext = {
      ...mockConfigContext,
      config: { interaction_mode: 'agent' },
    };
    rerender(
      <AppProvider>
        <div>child</div>
      </AppProvider>,
    );

    const keydownAdds = addListenerSpy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownAdds).toHaveLength(1);

    unmount();

    const keydownRemoves = removeListenerSpy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownRemoves).toHaveLength(1);
  });

  test('ignores keydown events that do not match shift+tab shortcut', () => {
    renderProvider();

    const event = createTabKeydown(false);
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(mockConfigContext.updateConfig).not.toHaveBeenCalled();
  });

  test('does not attempt mode toggle when updateConfig is not a function', () => {
    mockConfigContext = {
      ...mockConfigContext,
      updateConfig: null as any,
    };

    renderProvider();

    const event = createTabKeydown(true);

    expect(() => window.dispatchEvent(event)).not.toThrow();
    expect(event.defaultPrevented).toBe(false);
  });

  test('handles missing registerSaveStatusCallback without throwing', () => {
    mockConfigContext = {
      ...mockConfigContext,
      registerSaveStatusCallback: undefined as any,
    };

    expect(() => {
      renderProvider();
    }).not.toThrow();
  });

  test('uses fallback agent mode when config is null', () => {
    mockConfigContext = {
      ...mockConfigContext,
      config: null as any,
    };

    renderProvider();

    const event = createTabKeydown(true);
    window.dispatchEvent(event);

    expect(mockConfigContext.updateConfig).toHaveBeenCalledWith({
      interaction_mode: 'chat',
    });
  });

  test('ignores shift+tab shortcut when typing inside editable elements', () => {
    renderProvider(<input aria-label="editable" />);

    const input = document.querySelector('input');
    expect(input).toBeTruthy();

    const event = createTabKeydown(true);
    input?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(mockConfigContext.updateConfig).not.toHaveBeenCalled();
  });
});
