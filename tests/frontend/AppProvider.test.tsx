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
    render(
      <AppProvider>
        <div>child</div>
      </AppProvider>,
    );

    expect(mockConfigContext.registerSaveStatusCallback).toHaveBeenCalledWith(
      mockStatusContext.setSaving,
    );
  });

  test('shift+tab toggles interaction mode', () => {
    const { rerender } = render(
      <AppProvider>
        <div>child</div>
      </AppProvider>,
    );

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
      bubbles: true,
    });
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

    const secondEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(secondEvent);

    expect(mockConfigContext.updateConfig).toHaveBeenLastCalledWith({
      interaction_mode: 'chat',
    });
  });

  test('does not rebind keydown listener on rerender', () => {
    const addListenerSpy = jest.spyOn(window, 'addEventListener');
    const removeListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { rerender, unmount } = render(
      <AppProvider>
        <div>child</div>
      </AppProvider>,
    );

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
});

