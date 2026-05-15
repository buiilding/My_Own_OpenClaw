import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

let backendHandler = null;

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
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
      errors: [],
    })),
    on: (_channel, handler) => {
      backendHandler = handler;
      return () => {
        backendHandler = null;
      };
    },
  },
  INVOKE_CHANNELS: {
    LIST_AGENT_EXTENSIONS: 'list-agent-extensions',
  },
  ON_CHANNELS: {
    FROM_BACKEND: 'from-backend',
  },
}));

import AgentSettingsTab from '../../frontend/src/renderer/features/dashboard/components/sections/settings/AgentSettingsTab';

describe('AgentSettingsTab', () => {
  beforeEach(() => {
    backendHandler = null;
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

    fireEvent.click(screen.getByLabelText('Enable browser'));
    expect(onConfigChange).toHaveBeenCalledWith({
      agent_disabled_local_tools: ['browser'],
    });

    act(() => {
      backendHandler({
        type: 'client-tool-manifest',
        payload: {
          accepted: [{
            name: 'read_file',
            execution_target: 'sidecar',
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
    expect(screen.getByText(/file_path/)).toBeInTheDocument();
    expect(await screen.findByText('Notes')).toBeInTheDocument();
    expect(screen.getByText(/save_note/)).toBeInTheDocument();
    expect(screen.getAllByText(/search/).length).toBeGreaterThan(0);
  });
});
