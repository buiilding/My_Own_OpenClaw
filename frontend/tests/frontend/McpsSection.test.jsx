/**
 * Covers mcps section. behavior in the frontend test suite.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockInvoke = jest.fn();

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    LIST_MCP_SERVERS: 'list-mcp-servers',
    SET_MCP_SERVER_ENABLED: 'set-mcp-server-enabled',
    REFRESH_MCP_SERVERS: 'refresh-mcp-servers',
  },
}));

import McpsSection from '../../src/renderer/features/dashboard/components/sections/McpsSection';

function registry(overrides = {}) {
  return {
    mcps: [{
      id: 'memory',
      name: 'Memory',
      command: 'node',
      args: ['server.cjs'],
      extension_id: 'mcp:memory',
      requires_user_enable: true,
      effective_enabled: false,
      status: { state: 'off', label: 'Off', reason: 'Explicit enablement required.' },
      tools: [{ name: 'search' }],
      ...overrides,
    }],
    errors: [],
    mcp_errors: [],
    enabled_mcp_servers: overrides.effective_enabled ? ['mcp:memory'] : [],
  };
}

describe('McpsSection', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  test('lists MCPs and toggles enablement through the runtime client', async () => {
    mockInvoke
      .mockResolvedValueOnce(registry())
      .mockResolvedValueOnce({
        success: true,
        registry: registry({
          effective_enabled: true,
          user_enabled: true,
          status: { state: 'ready', label: 'Ready', reason: '' },
        }),
      });

    render(<McpsSection />);

    expect(await screen.findByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Enable Memory'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenLastCalledWith('set-mcp-server-enabled', {
        id: 'mcp:memory',
        enabled: true,
      });
    });
    expect(await screen.findByText('Ready')).toBeInTheDocument();
  });

  test('refreshes MCP discovery through the runtime client', async () => {
    mockInvoke
      .mockResolvedValueOnce(registry({ effective_enabled: true }))
      .mockResolvedValueOnce(registry({
        effective_enabled: true,
        status: { state: 'ready', label: 'Ready', reason: '' },
      }));

    render(<McpsSection />);

    expect(await screen.findByText('Memory')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh MCP servers' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenLastCalledWith('refresh-mcp-servers');
    });
    expect(await screen.findByText('Ready')).toBeInTheDocument();
  });

  test('shows normalized enablement errors from the runtime client', async () => {
    mockInvoke
      .mockResolvedValueOnce(registry())
      .mockResolvedValueOnce({
        success: false,
        error: 'Missing MCP server id.',
        registry: registry(),
      });

    render(<McpsSection />);

    expect(await screen.findByText('Memory')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Enable Memory'));

    expect(await screen.findByText('Missing MCP server id.')).toBeInTheDocument();
  });

  test('shows registry errors through runtime presentation values', async () => {
    mockInvoke.mockResolvedValueOnce({
      ...registry(),
      mcps: [],
      errors: [{
        kind: 'mcp',
        id: 'broken-memory',
        reason: 'spawn failed',
      }],
    });

    render(<McpsSection />);

    expect(await screen.findByText('mcp broken-memory: spawn failed')).toBeInTheDocument();
  });
});
