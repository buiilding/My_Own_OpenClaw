import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

let backendHandler = null;

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: jest.fn(async () => ({
      extensions: [{
        id: 'notes',
        name: 'Notes',
        description: 'Adds note workflows.',
        permissions: [{ id: 'filesystem', reason: 'Read local notes' }],
        settings_panels: [{ id: 'extension:notes:settings:main', title: 'Notes settings' }],
        mcp_servers: [{
          id: 'memory',
          name: 'Memory',
          command: 'node',
          tools: [{ name: 'search' }],
        }],
        tools: [{ name: 'save_note' }],
        prompt_layers: [{ id: 'extension:notes:skill:review', type: 'extension_skill', priority: 75 }],
        lifecycle_hooks: { onSessionStart: 1, beforeToolCall: 1, afterToolCall: 1 },
        config_schema: { type: 'object' },
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

  test('updates tool toggles and displays accepted schemas plus prompt layers', async () => {
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
      backendHandler({
        type: 'system-prompt',
        payload: {
          client_prompt_layers: [{
            id: 'custom-instructions',
            type: 'custom_instructions',
            priority: 60,
            content: 'Prefer local tools.',
          }],
        },
      });
    });

    expect(screen.getByText('custom-instructions')).toBeInTheDocument();
    expect(screen.getByText('Accepted schema')).toBeInTheDocument();
    expect(screen.getByText(/file_path/)).toBeInTheDocument();
    expect(await screen.findByText('Notes')).toBeInTheDocument();
    expect(screen.getByText(/save_note/)).toBeInTheDocument();
    expect(screen.getAllByText(/search/).length).toBeGreaterThan(0);
  });
});
