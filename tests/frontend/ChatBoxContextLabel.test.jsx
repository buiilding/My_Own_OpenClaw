import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

import ChatBoxContextLabel from '../../frontend/src/renderer/features/chat/components/ChatBoxContextLabel';

const mockInvoke = jest.fn((channel) => {
  if (channel === 'get-system-state') {
    return Promise.resolve({ active_window: 'main.py - Visual Studio Code' });
  }
  return Promise.resolve({ success: true });
});
const mockListeners = new Map();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
    on: (channel, listener) => {
      mockListeners.set(channel, listener);
      return () => {
        mockListeners.delete(channel);
      };
    },
  },
  INVOKE_CHANNELS: {
    GET_SYSTEM_STATE: 'get-system-state',
  },
  ON_CHANNELS: {
    RESPONSE_OVERLAY_VISIBILITY: 'response-overlay-visibility',
  },
}));

describe('ChatBoxContextLabel', () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockListeners.clear();
  });

  test('renders active window text as a standalone floating label', async () => {
    const { container } = render(<ChatBoxContextLabel />);

    await waitFor(() => {
      expect(screen.getByLabelText('Active app: VS Code')).toBeInTheDocument();
    });
    expect(screen.getByText('VS Code')).toBeInTheDocument();
    expect(container.querySelector('.chatbox-floating-context')).toBeTruthy();
  });

  test('hides when response overlay is visible', async () => {
    render(<ChatBoxContextLabel />);

    await waitFor(() => {
      expect(screen.getByLabelText('Active app: VS Code')).toBeInTheDocument();
    });

    const onResponseOverlayVisibility = mockListeners.get('response-overlay-visibility');
    expect(onResponseOverlayVisibility).toBeTruthy();

    act(() => {
      onResponseOverlayVisibility({ visible: true });
    });

    expect(screen.queryByLabelText('Active app: VS Code')).not.toBeInTheDocument();
  });
});
