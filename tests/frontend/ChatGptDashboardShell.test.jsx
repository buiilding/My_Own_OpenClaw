import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import ChatGptDashboardShell from '../../frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell';

const mockListeners = new Map();

jest.mock('../../frontend/src/renderer/features/chat/components/ChatInterface', () => () => (
  <div data-testid="chat-interface-stub">ChatInterfaceStub</div>
));

jest.mock('../../frontend/src/renderer/features/dashboard/components/sections/SettingsSection', () => () => (
  <div data-testid="settings-section-stub">SettingsSectionStub</div>
));

jest.mock('../../frontend/src/renderer/features/dashboard/components/sections/ModelsSection', () => () => (
  <div data-testid="models-section-stub">ModelsSectionStub</div>
));

jest.mock('../../frontend/src/renderer/features/dashboard/components/sections/EpisodicMemorySection', () => () => (
  <div data-testid="episodic-memory-stub">EpisodicMemoryStub</div>
));

jest.mock('../../frontend/src/renderer/features/dashboard/components/sections/SemanticMemorySection', () => () => (
  <div data-testid="semantic-memory-stub">SemanticMemoryStub</div>
));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: (channel, listener) => {
      mockListeners.set(channel, listener);
      return () => {
        mockListeners.delete(channel);
      };
    },
  },
  ON_CHANNELS: {
    MAIN_WINDOW_OPEN_TARGET: 'main-window-open-target',
  },
}));

describe('ChatGptDashboardShell', () => {
  beforeEach(() => {
    mockListeners.clear();
  });

  test('renders chat interface as primary main content', () => {
    render(
      <ChatGptDashboardShell
        config={{}}
        availableModels={{ local: [], online: [] }}
        onConfigChange={jest.fn()}
      />,
    );

    expect(screen.getByTestId('chat-interface-stub')).toBeInTheDocument();
  });

  test('opens settings modal when main process emits settings target', () => {
    render(
      <ChatGptDashboardShell
        config={{}}
        availableModels={{ local: [], online: [] }}
        onConfigChange={jest.fn()}
      />,
    );

    act(() => {
      const listener = mockListeners.get('main-window-open-target');
      listener?.({ target: 'settings' });
    });

    expect(screen.getByTestId('settings-section-stub')).toBeInTheDocument();
  });

  test('sidebar models button opens models modal', () => {
    render(
      <ChatGptDashboardShell
        config={{}}
        availableModels={{ local: [], online: [] }}
        onConfigChange={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Models' }));

    expect(screen.getByTestId('models-section-stub')).toBeInTheDocument();
  });
});
