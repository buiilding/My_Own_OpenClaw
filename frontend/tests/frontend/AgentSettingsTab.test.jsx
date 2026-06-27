/**
 * Covers agent settings tab. behavior in the frontend test suite.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

let capabilityEventHandler = null;

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: jest.fn(async () => ({
      plugins: [{
        id: 'notes',
        name: 'Notes',
        description: 'Adds note workflows.',
        permissions: [{ id: 'filesystem', reason: 'Read local notes' }],
        settings_panels: [{ id: 'extension:plugin:notes:settings:main', title: 'Notes settings' }],
        tools: [{ name: 'save_note' }],
        config_schema: { type: 'object' },
      }],
      skills: [{ id: 'extension:skill:review', type: 'extension_skill', priority: 75 }],
      mcps: [{
        id: 'memory',
        name: 'Memory',
        command: 'node',
        tools: [{ name: 'search' }],
      }],
      errors: [{
        kind: 'plugin',
        id: 'broken-notes',
        reason: 'manifest failed',
      }],
    })),
    on: (_channel, handler) => {
      capabilityEventHandler = handler;
      return () => {
        capabilityEventHandler = null;
      };
    },
  },
  INVOKE_CHANNELS: {
    LIST_AGENT_EXTENSIONS: 'list-agent-extensions',
  },
  ON_CHANNELS: {
    AGENT_CAPABILITY_EVENT: 'agent-capability-event',
  },
}));

import AgentSettingsTab from '../../src/renderer/features/dashboard/components/sections/settings/AgentSettingsTab';

describe('AgentSettingsTab', () => {
  beforeEach(() => {
    capabilityEventHandler = null;
  });

  test('updates tool toggles and displays accepted schemas plus extensions', async () => {
    const onConfigChange = jest.fn();
    render(
      <AgentSettingsTab
        config={{
          agent_custom_instructions: 'Prefer local tools.',
          agent_disabled_local_tools: [],
          agent_disabled_remote_tools: [],
        }}
        onConfigChange={onConfigChange}
      />,
    );

    expect(screen.getByText('System prompt')).toBeInTheDocument();
    expect(document.querySelectorAll('.settings-surface-tool-status').length).toBe(1);

    fireEvent.click(screen.getByLabelText('Enable browser'));
    expect(onConfigChange).toHaveBeenCalledWith({
      agent_disabled_local_tools: ['browser'],
    });
    fireEvent.click(screen.getByLabelText('Enable web_search'));
    expect(onConfigChange).toHaveBeenCalledWith({
      agent_disabled_remote_tools: ['web_search'],
    });

    act(() => {
      capabilityEventHandler({
        type: 'client-tool-manifest',
        payload: {
          accepted: [{
            name: 'read_file',
            execution_target: 'local_runtime',
            argument_resolution: 'passthrough',
            schema: { type: 'object', properties: { file_path: { type: 'string' } } },
          }],
          rejected: [],
        },
      });
    });

    expect(screen.queryByText('Active prompt layers')).not.toBeInTheDocument();
    expect(screen.queryByText('custom-instructions')).not.toBeInTheDocument();
    expect(screen.getByText('Accepted schema')).toBeInTheDocument();
    expect(screen.getByText('passthrough / local runtime')).toBeInTheDocument();
    expect(screen.getByText(/file_path/)).toBeInTheDocument();
    expect(await screen.findByText('Notes')).toBeInTheDocument();
    expect(screen.getByText(/save_note/)).toBeInTheDocument();
    expect(screen.getAllByText(/search/).length).toBeGreaterThan(0);
    expect(await screen.findByText('plugin broken-notes: manifest failed')).toBeInTheDocument();

    act(() => {
      capabilityEventHandler({
        type: 'remote-tool-catalog',
        payload: {
          remote_tools: [{
            name: 'web_search',
            available: false,
            reason_unavailable: 'Hosted search disabled',
          }],
        },
      });
    });

    expect(screen.getByText('Hosted search disabled')).toBeInTheDocument();
  });

  test('formats unknown execution targets as generic runtime labels', async () => {
    render(
      <AgentSettingsTab
        config={{
          agent_custom_instructions: '',
          agent_disabled_local_tools: [],
          agent_disabled_remote_tools: [],
        }}
        onConfigChange={jest.fn()}
      />,
    );

    expect(await screen.findByText('Notes')).toBeInTheDocument();

    act(() => {
      capabilityEventHandler({
        type: 'client-tool-manifest',
        payload: {
          accepted: [{
            name: 'read_file',
            execution_target: 'experimental_host',
            argument_resolution: 'prepared',
            schema: { type: 'object' },
          }],
          rejected: [],
        },
      });
    });

    expect(screen.getByText('prepared / runtime')).toBeInTheDocument();
    expect(screen.queryByText(/experimental_host/)).not.toBeInTheDocument();
  });
});
